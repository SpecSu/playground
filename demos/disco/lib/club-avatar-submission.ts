/** A local render receipt, never a server/network acknowledgement. */
export interface AvatarRenderRequest { token: number; id: string; preset: string }
export interface AvatarRenderReceipt extends AvatarRenderRequest { status: 'ready' | 'failed' }
function avatarDeadline(expire: () => void, milliseconds: number) {
  let remaining = milliseconds, startedAt = Date.now(), paused = false;
  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(expire, remaining);
  return {
    pause(next: boolean) {
      if (next === paused) return;
      paused = next;
      if (next) { clearTimeout(timer); timer = undefined; remaining = Math.max(0, remaining - (Date.now() - startedAt)); }
      else { startedAt = Date.now(); timer = setTimeout(expire, remaining); }
    },
    cancel() { clearTimeout(timer); timer = undefined; },
  };
}
export class AvatarRenderGate {
  private generation = 0;
  private activeToken: number | null = null;
  private paused = false;
  private pending: { request: AvatarRenderRequest; settle: (ready: boolean) => void; deadline: ReturnType<typeof avatarDeadline> } | null = null;
  setPaused(paused: boolean) { this.paused = paused; this.pending?.deadline.pause(paused); }
  begin(): number | null {
    if (this.activeToken !== null) return null;
    return this.activeToken = ++this.generation;
  }
  isCurrent(token: number) { return this.activeToken === token; }
  waitForRender(request: AvatarRenderRequest, timeoutMs = 30_000): Promise<boolean> {
    if (!this.isCurrent(request.token)) return Promise.resolve(false);
    this.pending?.settle(false);
    return new Promise(resolve => {
      const deadline = avatarDeadline(() => settle(false), timeoutMs);
      deadline.pause(this.paused);
      const settle = (ready: boolean) => {
        deadline.cancel();
        if (this.pending?.request === request) this.pending = null;
        resolve(ready);
      };
      this.pending = { request, settle, deadline };
    });
  }
  report(receipt: AvatarRenderReceipt) {
    const waiting = this.pending;
    if (!waiting || !this.isCurrent(receipt.token)) return;
    const expected = waiting.request;
    if (receipt.token === expected.token && receipt.id === expected.id && receipt.preset === expected.preset) waiting.settle(receipt.status === 'ready');
  }
  finish(token: number) { if (this.isCurrent(token)) this.cancel(); }
  cancel() { this.activeToken = null; this.pending?.settle(false); this.pending = null; }
}
interface LoadingVisibility {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}
export function withAvatarLoadTimeout<T>(loading: Promise<T>, milliseconds = 30_000, visibility?: LoadingVisibility): Promise<T> {
  return new Promise((resolve, reject) => {
    const onVisibility = () => deadline.pause(Boolean(visibility?.hidden));
    const cleanup = () => { deadline.cancel(); visibility?.removeEventListener('visibilitychange', onVisibility); };
    const deadline = avatarDeadline(() => { cleanup(); reject(new Error('Avatar loading timed out')); }, milliseconds);
    visibility?.addEventListener('visibilitychange', onVisibility); onVisibility();
    loading.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
