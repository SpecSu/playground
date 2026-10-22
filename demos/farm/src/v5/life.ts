/**
 * Pure per-animal V5 rules. All times/durations are real milliseconds. The owner
 * supplies bounded effective-online dtMs separately from wall-clock `now` and
 * validates navigation, safe bed capacity, sessions and action receipts. Feeding
 * is called once after the owner's reserve → walk → 3s → inventory transaction.
 * This module owns neither animal identity nor inventory, profiles or deletion.
 */
export type LifeStage = 'baby' | 'juvenile' | 'adult';
export type LifeAction = 'dance' | 'bounce' | 'love';
export type Food = 'milk' | 'feed';
export type HabitStage = 'observe' | 'imitate' | 'invite';
export type StageCare = {feeds: number; explorationSessions: string[]; rests: number; plays: number};
export type LifeHabit = {
  count: number; stage: HabitStage; lastAt: number; sessions: string[]; days: string[]; imported: boolean;
};
export type DailyBond = {day: string; feed: number; play: number; explore: number; total: number};
export type LifeMemory = {
  kind: 'feed' | 'rest' | 'explore' | 'play' | 'habit' | 'stage' | 'legacy'; at: number; text: string;
};
export type LifeState = {
  version: 5;
  stage: LifeStage;
  bornAt: number;
  stageAt: number;
  hunger: number;
  energy: number;
  bond: number;
  ageMultiplier: 1 | 240;
  lastSettledAt: number;
  lastEffectiveFeedAt: number | null;
  care: {baby: StageCare; juvenile: StageCare};
  rest: {bedId: string | null; sessionId: string | null; elapsedMs: number; completed: boolean};
  explore: {sessionId: string | null; elapsedMs: number; completed: boolean; jointElapsedMs: number; jointCompleted: boolean};
  habits: Partial<Record<LifeAction, LifeHabit>>;
  daily: DailyBond;
  products: {stored: number; settledAt: number};
  memory: LifeMemory[];
};
export type CreateLifeOptions = {
  bornAt?: number;
  stage?: LifeStage;
  stageAt?: number;
  /** Already-normalized V5 0..100 relationship. Takes precedence over legacyBond. */
  initialBond?: number;
  /** Legacy 0..12 bond, converted piecewise so old phases remain the same. */
  legacyBond?: number;
  legacyHabits?: Partial<Record<LifeAction, {count: number; stage: HabitStage; lastAt: number}>>;
  ageMultiplier?: 1 | 240;
};
export type AdvanceLifeInput = {
  now: number;
  dtMs: number;
  sessionId: string;
  moving?: boolean;
  /** Owner certifies this animal occupies one available safe bed. */
  safeBedId?: string | null;
  /** Owner certifies activity is in an appropriate, reachable species region. */
  exploring?: boolean;
  withPlayer?: boolean;
};
export type FeedingInput = {now: number; food: Food; manual?: boolean};
export type FeedingResult = {life: LifeState; accepted: boolean; effective: boolean; bondAdded: number; message: string};
export type PlayInput = {now: number; sessionId: string; action: LifeAction; manual?: boolean};
export type PlayResult = FeedingResult & {habitProgressed: boolean};
export type GrowthMissing = {kind: 'age' | 'feed' | 'explore' | 'rest' | 'play'; remaining: number; text: string};
export type GrowthSummary = {
  stage: LifeStage; nextStage: LifeStage | null; elapsedMs: number; requiredMs: number;
  remainingMs: number; ageProgress: number; ready: boolean; missing: GrowthMissing[]; message: string;
};

export const LIFE_RULES = {
  initialHunger: 55, initialEnergy: 80, needsMax: 100,
  hungerPerMinute: 1, movingEnergyPerMinute: 1, restEnergyPerMinute: 5,
  offlineHungerMaxDrop: 20, offlineHungerFloor: 30,
  fullHunger: 80, effectiveFeedHunger: 70, feedHungerGain: 30,
  effectiveFeedCooldownMs: 30 * 60_000,
  explorationMs: 30_000, safeRestMs: 60_000,
  babyAgeMs: 24 * 60 * 60_000, juvenileAgeMs: 72 * 60 * 60_000,
  babyFeeds: 3, juvenileFeeds: 6, babyExplorations: 1, juvenileExplorations: 2,
  babyRests: 1, juvenileRests: 2, juvenilePlays: 1,
  feedBond: 3, feedBondDailyCount: 2, playBond: 2, playBondDailyCount: 2,
  exploreBond: 2, exploreBondDailyCount: 1, dailyBondCap: 12,
  habitCount: 3, productIntervalMs: 12 * 60 * 60_000, productAmount: 2, productCap: 6,
  babyScale: 0.62, juvenileScale: 0.82, adultScale: 1,
} as const;

const ACTIONS: readonly LifeAction[] = ['dance', 'bounce', 'love'];
const ACTION_LABEL: Record<LifeAction, string> = {dance: '跳舞', bounce: '蹦跳', love: '喜欢'};
const emptyCare = (): StageCare => ({feeds: 0, explorationSessions: [], rests: 0, plays: 0});
const emptyRest = (): LifeState['rest'] => ({bedId: null, sessionId: null, elapsedMs: 0, completed: false});
const emptyExplore = (): LifeState['explore'] => ({sessionId: null, elapsedMs: 0, completed: false, jointElapsedMs: 0, jointCompleted: false});
function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}
function clamp(value: number, low: number = 0, high: number = LIFE_RULES.needsMax): number {
  return Math.min(high, Math.max(low, value));
}
function dayAt(now: number): string {
  return new Date(finite(now, 'now')).toISOString().slice(0, 10);
}
function emptyDaily(now: number): DailyBond { return {day: dayAt(now), feed: 0, play: 0, explore: 0, total: 0}; }
function legacyBondValue(raw: number): number {
  const value = clamp(finite(raw, 'legacyBond'), 0, 12);
  if (value < 3) return value / 3 * 20;
  if (value < 6) return 20 + (value - 3) / 3 * 30;
  if (value < 10) return 50 + (value - 6) / 4 * 30;
  return 80 + (value - 10) / 2 * 20;
}
function habitStage(count: number): HabitStage { return count >= 3 ? 'invite' : count >= 2 ? 'imitate' : 'observe'; }
function remember(life: LifeState, kind: LifeMemory['kind'], at: number, text: string): void {
  life.memory.push({kind, at, text});
}
function stageCare(life: LifeState): StageCare | null {
  return life.stage === 'adult' ? null : life.care[life.stage];
}
function grantBond(life: LifeState, category: 'feed' | 'play' | 'explore', now: number): number {
  const today = dayAt(now);
  if (life.daily.day !== today) {
    // Old delayed commands cannot reset today's budget back to a prior UTC day.
    if (today < life.daily.day) return 0;
    life.daily = emptyDaily(now);
  }
  const rules = {
    feed: {amount: LIFE_RULES.feedBond, count: LIFE_RULES.feedBondDailyCount},
    play: {amount: LIFE_RULES.playBond, count: LIFE_RULES.playBondDailyCount},
    explore: {amount: LIFE_RULES.exploreBond, count: LIFE_RULES.exploreBondDailyCount},
  }[category];
  if (life.daily[category] >= rules.count || life.daily.total >= LIFE_RULES.dailyBondCap) return 0;
  const allowed = Math.min(rules.amount, LIFE_RULES.dailyBondCap - life.daily.total);
  life.daily[category]++;
  life.daily.total += allowed;
  const previous = life.bond;
  life.bond = clamp(life.bond + allowed);
  return life.bond - previous;
}

/** Stable identity, appearance and legacy memories are retained by the owner. */
export function createLife(now: number, options: CreateLifeOptions = {}): LifeState {
  finite(now, 'now');
  const bornAt = finite(options.bornAt ?? now, 'bornAt');
  const stage = options.stage ?? 'baby';
  if (!(['baby', 'juvenile', 'adult'] as const).includes(stage)) throw new RangeError('Invalid life stage');
  const stageAt = finite(options.stageAt ?? (stage === 'baby' ? bornAt : now), 'stageAt');
  const ageMultiplier = options.ageMultiplier ?? 1;
  if (ageMultiplier !== 1 && ageMultiplier !== 240) throw new RangeError('ageMultiplier must be 1 or 240');
  const bond = options.initialBond === undefined ? legacyBondValue(options.legacyBond ?? 0)
    : clamp(finite(options.initialBond, 'initialBond'));
  const habits: LifeState['habits'] = {};
  for (const action of ACTIONS) {
    const old = options.legacyHabits?.[action];
    if (!old) continue;
    const count = clamp(Math.floor(finite(old.count, 'habit count')), 0, LIFE_RULES.habitCount);
    if (!count) continue;
    const lastAt = finite(old.lastAt, 'habit lastAt');
    // Imported earned state stays earned. It creates no new sessions, care or rewards.
    habits[action] = {count, stage: habitStage(count), lastAt, sessions: [], days: [dayAt(lastAt)], imported: true};
  }
  return {
    version: 5, stage, bornAt, stageAt,
    hunger: LIFE_RULES.initialHunger, energy: LIFE_RULES.initialEnergy, bond, ageMultiplier,
    lastSettledAt: now, lastEffectiveFeedAt: null,
    care: {baby: emptyCare(), juvenile: emptyCare()}, rest: emptyRest(), explore: emptyExplore(),
    habits, daily: emptyDaily(now), products: {stored: 0, settledAt: now}, memory: [],
  };
}

export function bondStage(bond: number): '初识' | '熟悉' | '亲近' | '默契' {
  finite(bond, 'bond');
  return bond >= 80 ? '默契' : bond >= 50 ? '亲近' : bond >= 20 ? '熟悉' : '初识';
}

/** Each missing item gives an exact count; remainingMs is real, unscaled time. */
export function growthSummary(life: LifeState, now: number): GrowthSummary {
  finite(now, 'now');
  const elapsedMs = Math.max(0, now - life.stageAt);
  if (life.stage === 'adult') return {
    stage: 'adult', nextStage: null, elapsedMs, requiredMs: 0, remainingMs: 0,
    ageProgress: 1, ready: false, missing: [], message: '已经成年，还能一起学习习惯、留下故事',
  };
  const baby = life.stage === 'baby';
  const requiredMs = (baby ? LIFE_RULES.babyAgeMs : LIFE_RULES.juvenileAgeMs) / life.ageMultiplier;
  const remainingMs = Math.max(0, requiredMs - elapsedMs);
  const care = life.care[life.stage];
  const missing: GrowthMissing[] = [];
  if (remainingMs > 0) missing.push({kind: 'age', remaining: remainingMs,
    text: `还差${Math.ceil(remainingMs / 60_000)}分钟阶段年龄`});
  const feeds = (baby ? LIFE_RULES.babyFeeds : LIFE_RULES.juvenileFeeds) - care.feeds;
  const explorations = (baby ? LIFE_RULES.babyExplorations : LIFE_RULES.juvenileExplorations) - care.explorationSessions.length;
  const rests = (baby ? LIFE_RULES.babyRests : LIFE_RULES.juvenileRests) - care.rests;
  if (feeds > 0) missing.push({kind: 'feed', remaining: feeds, text: `还差${feeds}次有效喂养`});
  if (explorations > 0) missing.push({kind: 'explore', remaining: explorations,
    text: `还差${explorations}次${baby ? '' : '不同会话的'}适配区域共同探索（每次30秒）`});
  if (!baby && care.plays < LIFE_RULES.juvenilePlays) missing.push({kind: 'play',
    remaining: LIFE_RULES.juvenilePlays - care.plays, text: `还差${LIFE_RULES.juvenilePlays - care.plays}次玩耍`});
  if (rests > 0) missing.push({kind: 'rest', remaining: rests, text: `还差${rests}次安稳休息（每次连续60秒）`});
  return {
    stage: life.stage, nextStage: baby ? 'juvenile' : 'adult', elapsedMs, requiredMs, remainingMs,
    ageProgress: clamp(elapsedMs / requiredMs, 0, 1), ready: missing.length === 0, missing,
    message: missing.length ? missing.map(item => item.text).join('；') : '成长条件已经满足',
  };
}

function promote(life: LifeState, now: number): void {
  if (!growthSummary(life, now).ready) return;
  life.stage = life.stage === 'baby' ? 'juvenile' : 'adult';
  life.stageAt = now;
  life.rest = emptyRest(); life.explore = emptyExplore();
  if (life.stage === 'adult') life.products = {stored: 0, settledAt: now};
  remember(life, 'stage', now, life.stage === 'juvenile' ? '完成照料与年龄条件，长成了少年' : '完成照料与年龄条件，长成了成年伙伴');
}

/** Revisit settlement never invents online exploration, rest or care milestones. */
export function settleOffline(original: LifeState, now: number): LifeState {
  finite(now, 'now');
  if (now <= original.lastSettledAt) return structuredClone(original);
  const life = structuredClone(original);
  const minutes = (now - life.lastSettledAt) / 60_000;
  const floor = Math.min(life.hunger, LIFE_RULES.offlineHungerFloor);
  life.hunger = Math.max(floor, life.hunger - Math.min(LIFE_RULES.offlineHungerMaxDrop, minutes * LIFE_RULES.hungerPerMinute));
  life.energy = clamp(life.energy + minutes * LIFE_RULES.restEnergyPerMinute);
  life.lastSettledAt = now;
  life.rest = emptyRest(); life.explore = emptyExplore();
  promote(life, now);
  return settleProducts(life, now);
}

/** Online dtMs is already bounded by the owner; age alone reads wall-clock now. */
export function advanceLife(original: LifeState, input: AdvanceLifeInput): LifeState {
  const {now, dtMs, sessionId} = input;
  finite(now, 'now'); finite(dtMs, 'dtMs');
  if (dtMs < 0) throw new RangeError('dtMs must be non-negative');
  if (!sessionId) throw new RangeError('A sessionId is required');
  if (now < original.lastSettledAt) return structuredClone(original);
  const life = structuredClone(original);
  const minutes = dtMs / 60_000;
  life.hunger = clamp(life.hunger - minutes * LIFE_RULES.hungerPerMinute);
  const bedId = input.moving ? null : input.safeBedId;
  if (bedId) {
    life.energy = clamp(life.energy + minutes * LIFE_RULES.restEnergyPerMinute);
    if (life.rest.bedId !== bedId || life.rest.sessionId !== sessionId) life.rest = {
      bedId, sessionId, elapsedMs: 0, completed: false,
    };
    life.rest.elapsedMs = Math.min(LIFE_RULES.safeRestMs, life.rest.elapsedMs + dtMs);
    if (!life.rest.completed && life.rest.elapsedMs >= LIFE_RULES.safeRestMs) {
      life.rest.completed = true;
      const care = stageCare(life);
      if (care) care.rests = Math.min(care.rests + 1, life.stage === 'baby' ? LIFE_RULES.babyRests : LIFE_RULES.juvenileRests);
      remember(life, 'rest', now, '在安全床位连续安稳休息了60秒');
    }
  } else {
    life.rest = emptyRest();
    if (input.moving) life.energy = clamp(life.energy - minutes * LIFE_RULES.movingEnergyPerMinute);
  }
  // Rest and exploration cannot both consume the same online seconds.
  if (input.exploring && !bedId) {
    if (life.explore.sessionId !== sessionId) life.explore = {...emptyExplore(), sessionId};
    life.explore.elapsedMs = Math.min(LIFE_RULES.explorationMs, life.explore.elapsedMs + dtMs);
    if (!life.explore.completed && life.explore.elapsedMs >= LIFE_RULES.explorationMs) {
      life.explore.completed = true;
      const care = stageCare(life);
      if (care && !care.explorationSessions.includes(sessionId)) care.explorationSessions.push(sessionId);
      remember(life, 'explore', now, '在适配区域探索了30秒');
    }
    // Completing an autonomous exploration does not imply 30s spent together.
    if (input.withPlayer) {
      life.explore.jointElapsedMs = Math.min(LIFE_RULES.explorationMs, life.explore.jointElapsedMs + dtMs);
      if (!life.explore.jointCompleted && life.explore.jointElapsedMs >= LIFE_RULES.explorationMs) {
        life.explore.jointCompleted = true;
        grantBond(life, 'explore', now);
        remember(life, 'explore', now, '和你在适配区域共同探索了30秒');
      }
    } else if (!life.explore.jointCompleted) {
      life.explore.jointElapsedMs = 0;
    }
  } else life.explore = emptyExplore();
  life.lastSettledAt = Math.max(life.lastSettledAt, now);
  promote(life, now);
  return settleProducts(life, now);
}

export function feedingResult(original: LifeState, input: FeedingInput): FeedingResult {
  finite(input.now, 'now');
  const reject = (message: string): FeedingResult => ({life: original, accepted: false, effective: false, bondAdded: 0, message});
  if (input.now < original.lastSettledAt) return reject('照料时间已经变化，请重新尝试');
  const expected: Food = original.stage === 'baby' ? 'milk' : 'feed';
  if (input.food !== expected) return reject(expected === 'milk' ? '幼羊需要适配的奶' : '少年与成年羊需要适配饲料');
  if (original.hunger >= LIFE_RULES.fullHunger) return reject('已经吃饱，想玩一会儿');
  const life = structuredClone(original);
  const effective = input.manual !== false && life.hunger <= LIFE_RULES.effectiveFeedHunger
    && (life.lastEffectiveFeedAt === null || input.now - life.lastEffectiveFeedAt >= LIFE_RULES.effectiveFeedCooldownMs);
  life.hunger = clamp(life.hunger + LIFE_RULES.feedHungerGain);
  let bondAdded = 0;
  if (effective) {
    life.lastEffectiveFeedAt = input.now;
    const care = stageCare(life);
    if (care) care.feeds = Math.min(care.feeds + 1, life.stage === 'baby' ? LIFE_RULES.babyFeeds : LIFE_RULES.juvenileFeeds);
    bondAdded = grantBond(life, 'feed', input.now);
  }
  remember(life, 'feed', input.now, effective ? '吃到了你亲手送来的适配食物，记下一次有效照料'
    : input.manual === false ? '收到了一份帮助照料的适配食物' : '补充了一份适配食物，这次不重复增加成长经历');
  promote(life, input.now);
  return {life, accepted: true, effective, bondAdded, message: effective ? '吃好了，记下一次有效照料' : '吃好了，这次补充需求'};
}

export function playWith(original: LifeState, input: PlayInput): PlayResult {
  finite(input.now, 'now');
  const reject = (message: string): PlayResult => ({life: original, accepted: false, effective: false,
    bondAdded: 0, habitProgressed: false, message});
  if (!ACTIONS.includes(input.action)) return reject('请选择已有的跳舞、蹦跳或喜欢动作');
  if (!input.sessionId) return reject('需要有效会话才能记下相处');
  if (input.now < original.lastSettledAt) return reject('相处时间已经变化，请重新尝试');
  if (input.manual === false) return {...reject('伙伴一起回应了动作，这次不代替主人建立关系'), accepted: true};
  const life = structuredClone(original);
  const care = stageCare(life);
  if (care) care.plays = Math.min(care.plays + 1, LIFE_RULES.juvenilePlays);
  const bondAdded = grantBond(life, 'play', input.now);
  const day = dayAt(input.now);
  const old = life.habits[input.action];
  const habitProgressed = !old || (old.count < LIFE_RULES.habitCount
    && !old.sessions.includes(input.sessionId) && !old.days.includes(day) && input.now >= old.lastAt);
  if (habitProgressed) {
    const count = (old?.count ?? 0) + 1;
    life.habits[input.action] = {
      count, stage: habitStage(count), lastAt: input.now,
      sessions: [...(old?.sessions ?? []), input.sessionId], days: [...(old?.days ?? []), day],
      imported: old?.imported ?? false,
    };
    remember(life, 'habit', input.now, `${count === 1 ? '第一次看你' : count === 2 ? '学着和你' : '会主动邀请你'}${ACTION_LABEL[input.action]}`);
  }
  remember(life, 'play', input.now, `和你一起${ACTION_LABEL[input.action]}`);
  promote(life, input.now);
  return {life, accepted: true, effective: true, bondAdded, habitProgressed,
    message: habitProgressed ? '记住了这次相处，习惯慢慢形成' : '一起玩了一会儿，它记得这个动作'};
}

export function animalScale(life: LifeState | LifeStage): number {
  const stage = typeof life === 'string' ? life : life.stage;
  return stage === 'baby' ? LIFE_RULES.babyScale : stage === 'juvenile' ? LIFE_RULES.juvenileScale : LIFE_RULES.adultScale;
}

/** Whole 12h batches preserve the remainder below capacity; full storage pauses. */
export function settleProducts(original: LifeState, now: number): LifeState {
  finite(now, 'now');
  const life = structuredClone(original);
  if (life.stage !== 'adult' || now <= life.products.settledAt) return life;
  if (life.products.stored >= LIFE_RULES.productCap) {
    life.products.settledAt = now;
    return life;
  }
  const elapsed = Math.max(0, now - Math.max(life.stageAt, life.products.settledAt));
  const batches = Math.min(Math.floor(elapsed / LIFE_RULES.productIntervalMs),
    Math.floor((LIFE_RULES.productCap - life.products.stored) / LIFE_RULES.productAmount));
  life.products.stored += batches * LIFE_RULES.productAmount;
  life.products.settledAt = life.products.stored >= LIFE_RULES.productCap ? now
    : life.products.settledAt + batches * LIFE_RULES.productIntervalMs;
  return life;
}

/** Owner stores the returned life atomically with inventory and command receipt. */
export function claimProducts(original: LifeState, now: number): {life: LifeState; materials: number} {
  const life = settleProducts(original, now);
  const materials = life.products.stored;
  life.products.stored = 0;
  return {life, materials};
}
