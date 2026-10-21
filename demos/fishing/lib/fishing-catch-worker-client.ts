import {
  runFishingCatchSolve,
  type FishingCatchSolveInput,
  type FishingCatchSolveResult,
} from './fishing-catch-solver.ts';

type CatchWorker = Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener' | 'removeEventListener'>;
type WorkerFactory = () => CatchWorker;
type Fallback = (input: FishingCatchSolveInput, signal?: AbortSignal) => Promise<FishingCatchSolveResult>;

export type FishingCatchWorkerClientOptions = {
  workerFactory?: WorkerFactory;
  fallback?: Fallback;
};

export type FishingCatchWorkerClient = {
  solve(input: FishingCatchSolveInput, signal?: AbortSignal): Promise<FishingCatchSolveResult>;
  dispose(): void;
};

type ClientState = {
  disposed: boolean;
  generation: number;
  jobs: Set<Job>;
};

type Job = {
  id: number;
  client: ClientState;
  generation: number;
  input: FishingCatchSolveInput;
  controller: AbortController;
  signal?: AbortSignal;
  onAbort?: () => void;
  stopDeadline?: () => void;
  resolve: (result: FishingCatchSolveResult) => void;
  reject: (error: unknown) => void;
  settled: boolean;
  slot?: Slot;
};

type Slot = {
  generation: number;
  job?: Job;
  worker?: CatchWorker;
  removeListeners?: () => void;
  fallbackTimer?: ReturnType<typeof setTimeout>;
  fallbackRunning: boolean;
};

type WorkerReply = {id: number; result?: FishingCatchSolveResult; error?: unknown};

const MAX_CONCURRENT_SOLVES = 2;
const VISIBLE_SOLVE_TIMEOUT_MS = 45000;
let nextRequestId = 0;

// Keep this URL literal here so the browser build emits an actual module Worker.
const defaultWorkerFactory: WorkerFactory = () => new Worker(
  new URL('./fishing-catch.worker.ts', import.meta.url),
  {type: 'module'},
);

// Test factories can be isolated while ordinary avatars all share one broker.
// Entries are removed when their final client is disposed.
const pools = new Map<WorkerFactory, Map<Fallback, CatchWorkerPool>>();

function cancelledError(): DOMException {
  return new DOMException('Fishing catch preparation was cancelled.', 'AbortError');
}

/** Background tabs throttle timers and Workers. Charge only visible time. */
function watchVisibleDeadline(expired: () => void): () => void {
  const visibility = typeof document === 'undefined' ? undefined : document;
  let remaining = VISIBLE_SOLVE_TIMEOUT_MS;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    timer = undefined;
    visibility?.removeEventListener('visibilitychange', changed);
  };
  const changed = () => {
    if (stopped) return;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      remaining -= Math.max(0, performance.now() - startedAt);
    }
    if (visibility?.hidden) return;
    startedAt = performance.now();
    timer = setTimeout(() => {
      timer = undefined;
      // A visibility event can be queued behind a delayed timer in a resumed
      // tab. Never report a timeout while the document is currently hidden.
      if (visibility?.hidden) return;
      stop();
      expired();
    }, Math.max(0, remaining));
  };
  visibility?.addEventListener('visibilitychange', changed);
  changed();
  return stop;
}

class CatchWorkerPool {
  private clients = new Set<ClientState>();
  private queue: Job[] = [];
  private slots = new Set<Slot>();
  private workersUnavailable = false;
  private closed = false;
  private pumping = false;
  private nextGeneration = 0;
  private workerFactory: WorkerFactory;
  private fallback: Fallback;
  private onEmpty: () => void;

  constructor(workerFactory: WorkerFactory, fallback: Fallback, onEmpty: () => void) {
    this.workerFactory = workerFactory;
    this.fallback = fallback;
    this.onEmpty = onEmpty;
  }

  createClient(): FishingCatchWorkerClient {
    const client: ClientState = {disposed: false, generation: 0, jobs: new Set()};
    this.clients.add(client);
    return {
      solve: (input, signal) => this.solve(client, input, signal),
      dispose: () => this.disposeClient(client),
    };
  }

  private solve(client: ClientState, input: FishingCatchSolveInput, signal?: AbortSignal): Promise<FishingCatchSolveResult> {
    if (client.disposed || this.closed || signal?.aborted) return Promise.reject(cancelledError());
    return new Promise((resolve, reject) => {
      const job: Job = {
        id: ++nextRequestId,
        client,
        generation: client.generation,
        input,
        controller: new AbortController(),
        signal,
        resolve,
        reject,
        settled: false,
      };
      job.onAbort = () => this.cancel(job);
      client.jobs.add(job);
      signal?.addEventListener('abort', job.onAbort, {once: true});
      this.queue.push(job);
      this.pump();
    });
  }

  private isCurrent(job: Job): boolean {
    return !this.closed && !job.settled && !job.client.disposed && job.client.generation === job.generation;
  }

  private settle(job: Job, outcome: {result: FishingCatchSolveResult} | {error: unknown}): void {
    if (job.settled) return;
    job.settled = true;
    job.stopDeadline?.();
    job.stopDeadline = undefined;
    if (job.onAbort) job.signal?.removeEventListener('abort', job.onAbort);
    job.client.jobs.delete(job);
    if ('error' in outcome) job.reject(outcome.error);
    else job.resolve(outcome.result);
  }

  private cancel(job: Job): void {
    if (job.settled) return;
    job.controller.abort();
    this.settle(job, {error: cancelledError()});
    const slot = job.slot;
    if (!slot) {
      const queuedIndex = this.queue.indexOf(job);
      if (queuedIndex !== -1) this.queue.splice(queuedIndex, 1);
    }
    if (slot?.job === job) {
      if (slot.worker) {
        // Terminating this one worker stops obsolete CPU work immediately.
        this.retireWorker(slot);
        this.releaseSlot(slot);
      } else if (!slot.fallbackRunning) {
        clearTimeout(slot.fallbackTimer);
        slot.fallbackTimer = undefined;
        this.releaseSlot(slot);
      }
      // A running cooperative fallback retains its slot until it observes abort.
    }
    this.pump();
  }

  private disposeClient(client: ClientState): void {
    if (client.disposed) return;
    client.disposed = true;
    client.generation += 1;
    for (const job of [...client.jobs]) this.cancel(job);
    this.clients.delete(client);
    if (this.clients.size !== 0) return;
    this.closed = true;
    this.queue = [];
    for (const slot of this.slots) {
      clearTimeout(slot.fallbackTimer);
      slot.job?.controller.abort();
      this.retireWorker(slot);
    }
    this.slots.clear();
    this.onEmpty();
  }

  private pump(): void {
    if (this.closed || this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        while (this.queue.length > 0 && !this.isCurrent(this.queue[0])) this.queue.shift();
        if (this.queue.length === 0) break;
        let slot = [...this.slots].find(candidate => !candidate.job);
        if (!slot && this.slots.size >= MAX_CONCURRENT_SOLVES) break;
        if (!slot) {
          slot = {generation: ++this.nextGeneration, fallbackRunning: false};
          this.slots.add(slot);
        }
        const job = this.queue.shift()!;
        slot.job = job;
        job.slot = slot;
        if (!slot.worker && !this.workersUnavailable) {
          try {
            this.attachWorker(slot, this.workerFactory());
          } catch {
            // Unsupported/CSP-blocked Workers should not be constructed for
            // every queued avatar. Retry only with a new pool lifecycle.
            this.workersUnavailable = true;
            this.retireWorker(slot);
          }
        }
        if (slot.worker) {
          try {
            const runningSlot = slot;
            job.stopDeadline = watchVisibleDeadline(() => {
              if (this.isCurrent(job) && runningSlot.job === job) this.failWorker(runningSlot);
            });
            // Structured cloning preserves caller-owned geometry buffers.
            // Never transfer the live avatar's typed-array backing buffers.
            slot.worker.postMessage({id: job.id, input: job.input});
          } catch {
            this.failWorker(slot);
          }
        } else {
          this.startFallback(slot, job);
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  private attachWorker(slot: Slot, worker: CatchWorker): void {
    slot.worker = worker;
    const generation = slot.generation;
    const isLiveWorker = () => !this.closed && this.slots.has(slot) && slot.generation === generation && slot.worker === worker;
    const onMessage = (event: MessageEvent<WorkerReply>) => {
      if (!isLiveWorker()) return;
      const job = slot.job;
      const message = event.data;
      if (!job || !this.isCurrent(job) || !message || message.id !== job.id) return;
      if ('error' in message || !('result' in message)) {
        this.failWorker(slot);
        return;
      }
      this.settle(job, {result: message.result as FishingCatchSolveResult});
      this.releaseSlot(slot);
      this.pump();
    };
    const onError = (event: Event) => {
      if (!isLiveWorker()) return;
      event.preventDefault?.();
      this.failWorker(slot);
    };
    slot.removeListeners = () => {
      worker.removeEventListener('message', onMessage as EventListener);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onError);
    };
    worker.addEventListener('message', onMessage as EventListener);
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onError);
  }

  private retireWorker(slot: Slot): void {
    const worker = slot.worker;
    slot.worker = undefined;
    slot.generation += 1;
    try { slot.removeListeners?.(); } catch { /* Retirement must still settle jobs. */ }
    slot.removeListeners = undefined;
    try { worker?.terminate(); } catch { /* An already dead Worker needs no cleanup. */ }
  }

  private failWorker(slot: Slot): void {
    const job = slot.job;
    this.retireWorker(slot);
    if (job && this.isCurrent(job)) this.startFallback(slot, job);
    else this.releaseSlot(slot);
    this.pump();
  }

  private startFallback(slot: Slot, job: Job): void {
    if (slot.fallbackRunning || slot.fallbackTimer !== undefined) return;
    job.stopDeadline?.();
    job.stopDeadline = undefined;
    // A task boundary guarantees that construction/runtime failures cannot
    // invoke the expensive solver on the current rendering/input stack.
    slot.fallbackTimer = setTimeout(() => {
      slot.fallbackTimer = undefined;
      if (!this.isCurrent(job) || slot.job !== job) {
        this.releaseSlot(slot);
        this.pump();
        return;
      }
      slot.fallbackRunning = true;
      job.stopDeadline = watchVisibleDeadline(() => {
        if (!this.isCurrent(job) || slot.job !== job) return;
        job.controller.abort();
        this.settle(job, {error: new DOMException('Fishing catch preparation timed out.', 'TimeoutError')});
      });
      void this.runFallback(slot, job);
    }, 0);
  }

  private async runFallback(slot: Slot, job: Job): Promise<void> {
    try {
      const result = await this.fallback(job.input, job.controller.signal);
      if (this.isCurrent(job)) this.settle(job, {result});
    } catch (error) {
      if (this.isCurrent(job)) this.settle(job, {error});
    } finally {
      slot.fallbackRunning = false;
      this.releaseSlot(slot);
      this.pump();
    }
  }

  private releaseSlot(slot: Slot): void {
    if (slot.job) slot.job.slot = undefined;
    slot.job = undefined;
    if (!slot.worker) this.slots.delete(slot);
  }
}

export function createFishingCatchWorkerClient(options: FishingCatchWorkerClientOptions = {}): FishingCatchWorkerClient {
  const workerFactory = options.workerFactory ?? defaultWorkerFactory;
  const fallback = options.fallback ?? runFishingCatchSolve;
  let byFallback = pools.get(workerFactory);
  if (!byFallback) {
    byFallback = new Map();
    pools.set(workerFactory, byFallback);
  }
  let pool = byFallback.get(fallback);
  if (!pool) {
    const registry = byFallback;
    pool = new CatchWorkerPool(workerFactory, fallback, () => {
      registry.delete(fallback);
      if (registry.size === 0) pools.delete(workerFactory);
    });
    registry.set(fallback, pool);
  }
  return pool.createClient();
}
