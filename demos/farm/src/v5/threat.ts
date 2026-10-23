/**
 * V5 pure online threat simulation. All times are online seconds and all positions
 * use layout grid units. Callers persist the entire returned state and pass dt=0
 * when hidden/disconnected/loading. No inventory, rewards, DB or wall clock reads.
 *
 * createThreat(options, layout) -> ThreatState
 * stepThreat(state, layout, {dt, playerPosition?, driveOff?, rescueActorId?,
 *   findBackActorId?, abandonActorId?, abandonConfirmed?}) -> ThreatState
 * guardianCommand(state, layout, command) -> {state, ok, reason?}
 * threatSummary(state) -> counts and per-actor factual records
 * evaluateEvacuation({actors,doors}) -> deterministic independent-door benchmark
 */
import { buildingApproaches, buildingFootprint, isWalkable, lineOfSight, shelterEntries, type GridPoint, type Layout } from './layout.ts';
import { findActorPath } from './actor-navigation.ts';

export type GuardianKind = 'dog' | 'cat' | 'frog';
export type ThreatMode = 'tutorial' | 'rehearsal' | 'reassure' | 'challenge';
export type ActorStatus = 'waiting' | 'evacuating' | 'queued' | 'safe' | 'carried' | 'boundary' | 'lost' | 'memorial';
export type GuardianBehavior = 'patrol' | 'follow' | 'station' | 'emergency' | 'rescue' | 'respond' | 'rest';
export type GuardianAbility = 'block' | 'gather' | 'calm' | 'bubble';

export const THREAT_RULES = {
  animalSpeed: 1, injuredSpeed: 0.7, reaction: 2, doorBase: 1, normalPanic: 1, densePanic: 2,
  denseCount: 5, wolfSpeed: 1, carrySpeed: 0.7, contact: 1, windup: 2, grab: 4,
  rescueWindow: 180, rescueWork: 3, driveOffRange: 1, playerSight: 6, animalSight: 3,
  tutorialRetreat: 20, step: 0.05,
  dog: { speed: 1.8, sight: 6, range: 1, duration: 6, cooldown: 20 },
  cat: { speed: 2.2, sight: 8, towerBonus: 4, range: 4, duration: 8, cooldown: 12 },
  frog: { speed: 1.2, sight: 5, range: 4, duration: 12, cooldown: 24, bubbleRange: 6, bubbleDuration: 4, bubbleCooldown: 20, bubbleMaxDelay: 2 },
};

export type ThreatUpgrades = {guardianLevel?:number;shelterLevels?:Record<string,number>};
const upgradeLevel=(level:number|undefined)=>Math.max(1,Math.min(3,Number.isFinite(level)?Math.floor(level!):1));
/** Level changes remain distinct abilities, never a global combat score. */
export function guardianUpgradeRules<K extends GuardianKind>(kind:K,level=1):typeof THREAT_RULES[K]{
  const n=upgradeLevel(level)-1,base=THREAT_RULES[kind];
  return {...base,sight:base.sight+(kind==='cat'?2*n:0),range:base.range+(kind==='dog'?0:n),duration:base.duration+(kind==='frog'?3*n:2*n)};
}
export function shelterDoorService(level=1){return 1-(upgradeLevel(level)-1)*.2;}
function abilityRules<K extends GuardianKind>(state:ThreatState,kind:K):typeof THREAT_RULES[K]{return guardianUpgradeRules(kind,state.upgrades?.guardianLevel);}

export interface ThreatActorInput { id: string; position: GridPoint; participant?: boolean; role?: 'animal' | 'guardian' | 'visitor'; }
export interface ShelterReservation { buildingId: string; doorId: string; slot: number; }
export interface ThreatActor {
  id: string; role: 'animal' | 'guardian' | 'visitor'; participant: boolean;
  position: GridPoint; path: GridPoint[]; pathIndex: number; pathLength: number;
  status: ActorStatus; reservation: ShelterReservation | null;
  discoveredAt: number | null; departAt: number | null; doorArrivalAt: number | null;
  enteredAt: number | null; exposedAt: number | null; injuredAt: number | null;
  rescuedAt: number | null; memorialAt: number | null; timely: boolean;
  serviceStartedAt: number | null; rescueStartedAt: number | null; rescueRemaining: number | null; rescueProgress: number;
  rescuePoint: GridPoint | null; reattackAfter: number; reason: string;
}
export interface ThreatWolf {
  id: string; position: GridPoint; spawn: GridPoint; path: GridPoint[]; pathIndex: number;
  status: 'approach' | 'windup' | 'grabbing' | 'carrying' | 'boundary' | 'retreated';
  targetDoorId: string | null; targetActorId: string | null; stageProgress: number;
  blockedUntil: number; blockUsed: number; slowedUntil: number; bubbleDelay: number;
  arrivedAt: number | null; interruptedUntil: number;
}
export interface ThreatDoor {
  buildingId: string; doorId: string; position: GridPoint; capacity: number;
  panic: number; queue: string[]; wolfArrivedAt: number | null;
  serviceActorId: string | null; lastFinishedAt: number;
}
export interface GuardianState {
  kind: GuardianKind; position: GridPoint; path: GridPoint[]; pathIndex: number;
  behavior: GuardianBehavior; target: GridPoint | null; targetWolfId: string | null;
  targetActorId: string | null; pendingAbility: GuardianAbility | null;
  ability: GuardianAbility | null; abilityStartedAt: number; abilityUntil: number;
  abilityPosition: GridPoint; calmWindows: { from: number; until: number; position: GridPoint }[];
  cooldowns: Record<GuardianAbility, number>; patrolIndex: number;
}
export interface ThreatTelemetry {
  id: string; type: string; at: number; actorId?: string; wolfId?: string;
  position?: GridPoint; path?: GridPoint[]; reason?: string;
}
export interface ThreatState {
  version: 1; id: string; seed: number; mode: ThreatMode; phase: 'choosing' | 'active' | 'rescue' | 'complete';
  elapsed: number; discoveredAt: number | null; actors: ThreatActor[]; wolves: ThreatWolf[];
  guardian: GuardianState | null; guardianStart: GridPoint; doors: ThreatDoor[];
  confirmedParticipants: string[]; lockedLayoutVersion: number; howled: boolean; upgrades?:ThreatUpgrades;
  events: ThreatTelemetry[]; rewards: 0; notice: string;
}
export interface CreateThreatOptions {
  id: string; seed: number; mode: ThreatMode; actors: ThreatActorInput[];
  guardian?: GuardianKind; guardianPosition?: GridPoint; wolfSpawns?: GridPoint[];
  challengeAuthorized?: boolean; confirmedParticipants?: string[]; howled?: boolean; upgrades?:ThreatUpgrades;
}
export interface ThreatStepInput {
  dt: number; playerPosition?: GridPoint; driveOff?: string; rescueActorId?: string;
  findBackActorId?: string; abandonActorId?: string; abandonConfirmed?: boolean;
}
export interface GuardianCommand {
  kind: 'select' | 'follow' | 'station' | 'patrol' | 'block' | 'gather' | 'calm' | 'bubble' | 'rescue';
  guardian?: GuardianKind; target?: GridPoint; wolfId?: string; actorId?: string;
}
export interface EvacuationFixture {
  actors: { id: string; doorId: string; arrivalAt?: number; path?: GridPoint[]; pathLength?: number; discoveredAt?: number; reaction?: number; speed?: number }[];
  doors: { id: string; wolfArrival: number; panic: number; calm?: { from: number; until: number }[]; capacity?: number; buildingId?: string }[];
}

const clone = <T,>(value: T): T => structuredClone(value);
const point = (p: GridPoint): GridPoint => ({ x: p.x, z: p.z });
const cell = (p: GridPoint): GridPoint => ({ x: Math.round(p.x), z: Math.round(p.z) });
const distance = (a: GridPoint, b: GridPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const equal = (a: GridPoint, b: GridPoint) => distance(a, b) < 1e-8;
const rounded = (n: number) => Math.round(n * 1e9) / 1e9;
const length = (path: GridPoint[]) => path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0);
const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id, 'en');
const liveActor = (a: ThreatActor) => !['safe', 'carried', 'boundary', 'lost', 'memorial'].includes(a.status);

function emit(s: ThreatState, type: string, details: Omit<ThreatTelemetry, 'id' | 'type' | 'at'> = {}, at = s.elapsed) {
  s.events.push({ id: `${s.id}:${s.events.length + 1}`, type, at: rounded(at), ...details });
}
function pathTo(layout: Layout, from: GridPoint, to: GridPoint): GridPoint[] {
  return findActorPath(layout, from, to) ?? [];
}
function reachableWithin(layout: Layout, from: GridPoint, to: GridPoint, range: number) {
  if (distance(from, to) > range) return false;
  const route = pathTo(layout, from, to);
  return route.length > 0 && length(route) <= range + 1e-8;
}
function guardianSight(s: ThreatState, layout: Layout) {
  const g = s.guardian;
  if (!g) return 0;
  const tower = g.kind === 'cat' && layout.buildings.some(b => b.kind === 'tower' && buildingApproaches(layout, b).some(p => distance(p, g.position) <= 1));
  return abilityRules(s,g.kind).sight + (tower ? THREAT_RULES.cat.towerBonus : 0);
}
function visibleThreatPositions(s: ThreatState, layout: Layout) {
  const g = s.guardian;
  return s.wolves.filter(w => !['retreated', 'boundary'].includes(w.status) &&
    ((g && lineOfSight(layout, g.position, w.position, guardianSight(s, layout))) || s.actors.some(a => liveActor(a) && lineOfSight(layout, a.position, w.position, THREAT_RULES.animalSight))))
    .map(w => w.position);
}
/** Prefer a safe cardinal detour using exactly the layout walkability graph. */
function actorPath(layout: Layout, from: GridPoint, to: GridPoint, visible: GridPoint[]) {
  const fallback = pathTo(layout, from, to);
  if (!fallback.length || !visible.length) return fallback;
  const start = cell(from), goal = cell(to);
  const safeLayout = {...layout, owned: layout.owned.filter(p => equal(p, start) || equal(p, goal)
    || !visible.some(w => distance(p, w) <= THREAT_RULES.contact))};
  // A wolf cannot turn a disconnected alternative into a wall/water shortcut.
  return findActorPath(safeLayout, from, to) ?? fallback;
}
function setPath(mover: { path: GridPoint[]; pathIndex: number }, route: GridPoint[]) {
  mover.path = route.map(point); mover.pathIndex = route.length > 1 ? 1 : route.length;
}
/** Move continuously along cardinal graph edges, returning actual seconds spent. */
function move(mover: { position: GridPoint; path: GridPoint[]; pathIndex: number }, speed: number, seconds: number) {
  let remaining = Math.max(0, seconds * speed), used = 0;
  while (remaining > 1e-10 && mover.pathIndex < mover.path.length) {
    const target = mover.path[mover.pathIndex], d = distance(mover.position, target);
    if (d <= remaining + 1e-10) {
      mover.position = point(target); remaining -= d; used += d / speed; mover.pathIndex++;
    } else {
      mover.position = { x: rounded(mover.position.x + (target.x - mover.position.x) * remaining / d), z: rounded(mover.position.z + (target.z - mover.position.z) * remaining / d) };
      used += remaining / speed; remaining = 0;
    }
  }
  return used;
}
function guardian(kind: GuardianKind, position: GridPoint): GuardianState {
  return { kind, position: point(position), path: [], pathIndex: 0, behavior: 'patrol', target: null,
    targetWolfId: null, targetActorId: null, pendingAbility: null, ability: null, abilityStartedAt: 0,
    abilityUntil: 0, abilityPosition: point(position), calmWindows: [], cooldowns: { block: 0, gather: 0, calm: 0, bubble: 0 }, patrolIndex: 0 };
}
function boundaryPoints(layout: Layout) {
  const owned = new Set(layout.owned.map(p => `${p.x},${p.z}`));
  return layout.owned.filter(p => isWalkable(layout, p) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([x, z]) => !owned.has(`${p.x + x},${p.z + z}`)))
    .sort((a, b) => a.x - b.x || a.z - b.z);
}

export function createThreat(options: CreateThreatOptions, layout: Layout): ThreatState {
  if (!options.id || !Number.isFinite(options.seed) || !['tutorial', 'rehearsal', 'reassure', 'challenge'].includes(options.mode)) throw new Error('威胁事件参数无效');
  if (options.actors.length < 1 || options.actors.length > 12 || new Set(options.actors.map(a => a.id)).size !== options.actors.length) throw new Error('事件需要1至12个稳定且不重复的动物ID');
  if (options.actors.some(a => !a.id || !isWalkable(layout, cell(a.position)))) throw new Error('动物必须位于合法可行格');
  const participants = [...new Set(options.confirmedParticipants ?? [])].sort();
  if (options.mode === 'challenge') {
    if (!options.challengeAuthorized || !participants.length) throw new Error('真实风险需要明确确认参与名单');
    if (participants.some(id => !options.actors.some(a => a.id === id && a.participant === true && (!a.role || a.role === 'animal')))) throw new Error('挑战名单只能包含明确参与的自有动物');
  }
  const start = options.guardianPosition ?? options.actors[0].position;
  if (!isWalkable(layout, cell(start))) throw new Error('守护者起点不可达');
  const s: ThreatState = {
    version: 1, id: options.id, seed: options.seed, mode: options.mode,
    phase: options.mode === 'tutorial' && !options.guardian ? 'choosing' : 'active', elapsed: 0, discoveredAt: null,
    actors: options.actors.map(a => ({ id: a.id, role: a.role ?? 'animal', participant: options.mode === 'challenge' && participants.includes(a.id),
      position: point(a.position), path: [], pathIndex: 0, pathLength: 0, status: 'waiting', reservation: null,
      discoveredAt: null, departAt: null, doorArrivalAt: null, enteredAt: null, exposedAt: null, injuredAt: null,
      rescuedAt: null, memorialAt: null, timely: false, serviceStartedAt: null, rescueStartedAt: null, rescueRemaining: null, rescueProgress: 0,
      rescuePoint: null, reattackAfter: 0, reason: '' })),
    wolves: [], guardian: options.guardian ? guardian(options.guardian, start) : null, guardianStart: point(start),
    doors: shelterEntries(layout).map(d => ({ buildingId: d.buildingId, doorId: d.doorId, position: { x: d.x, z: d.z }, capacity: d.capacity,
      panic: THREAT_RULES.normalPanic, queue: [], wolfArrivedAt: null, serviceActorId: null, lastFinishedAt: 0 })),
    upgrades: {guardianLevel:upgradeLevel(options.upgrades?.guardianLevel),shelterLevels:Object.fromEntries(layout.buildings.filter(b=>b.kind==='shelter').map(b=>[b.id,upgradeLevel(options.upgrades?.shelterLevels?.[b.id])]))},
    confirmedParticipants: options.mode === 'challenge' ? participants : [], lockedLayoutVersion: layout.version,
    howled: options.howled ?? true, events: [], rewards: 0, notice: options.mode === 'tutorial' ? '选择期间危险暂停；三位伙伴都有教学兜底' : options.mode === 'rehearsal' ? '无损演练：只记录路线与排队，不扣动物、不发材料' : '',
  };
  const boundary = boundaryPoints(layout).filter(p => !s.actors.some(a => equal(a.position, p)) && s.doors.some(d => pathTo(layout, p, d.position).length));
  const seededIndex = Math.abs(Math.trunc(options.seed * 1664525 + 1013904223)) % Math.max(1, boundary.length);
  const spawns = options.wolfSpawns ?? (boundary.length ? [boundary[seededIndex]] : []);
  if (spawns.length > (options.mode==='reassure'?3:2)) throw new Error('自然来袭最多3只狼，教学与固定演练最多2只');
  for (const spawn of spawns) {
    if (!boundary.some(p => equal(p, spawn))) throw new Error('狼必须从可达边界出现，不能生成在动物脚下');
    const candidates = s.doors.map(d => ({ door: d, path: pathTo(layout, spawn, d.position) })).filter(c => c.path.length)
      .sort((a, b) => length(a.path) - length(b.path) || a.door.doorId.localeCompare(b.door.doorId));
    if (!candidates.length) continue;
    const selected = candidates[Math.min(s.wolves.length, candidates.length - 1)];
    const wolf: ThreatWolf = { id: `${s.id}:wolf:${s.wolves.length + 1}`, position: point(spawn), spawn: point(spawn), path: [], pathIndex: 0,
      status: 'approach', targetDoorId: selected.door.doorId, targetActorId: null, stageProgress: 0,
      blockedUntil: 0, blockUsed: 0, slowedUntil: 0, bubbleDelay: 0, arrivedAt: null, interruptedUntil: 0 };
    setPath(wolf, selected.path); s.wolves.push(wolf);
  }
  if (!s.wolves.length) { s.phase = 'complete'; s.notice = '没有合法的预警与进场路线，先检查布局或进行演练'; }
  return s;
}

/** The same service equation is used by live queues and the documented fixtures. */
function serviceCompletion(start: number, panic: number, calm: { from: number; until: number }[],base=THREAT_RULES.doorBase) {
  const baseDone = start + base;
  let finish = baseDone + Math.max(0, panic);
  for (const window of calm) {
    const candidate = Math.max(baseDone, window.from);
    if (candidate < window.until && candidate < finish) finish = candidate;
  }
  return rounded(finish);
}

export function evaluateEvacuation(fixture: EvacuationFixture) {
  if (new Set(fixture.actors.map(a => a.id)).size !== fixture.actors.length || new Set(fixture.doors.map(d => d.id)).size !== fixture.doors.length) throw new Error('算例ID必须唯一');
  const slots = new Map<string, number>();
  const records: { id: string; doorId: string; arrivalAt: number; enteredAt: number | null; wolfArrival: number; timely: boolean; exposed: boolean; reason: string }[] = [];
  const arrivals = fixture.actors.map(actor => ({ actor, arrival: actor.arrivalAt ?? (actor.discoveredAt ?? 0) + (actor.reaction ?? THREAT_RULES.reaction) + (actor.path ? length(actor.path) : actor.pathLength ?? 0) / (actor.speed ?? THREAT_RULES.animalSpeed) }))
    .sort((a, b) => a.arrival - b.arrival || byId(a.actor, b.actor));
  const finish = new Map<string, number>();
  for (const { actor, arrival } of arrivals) {
    const door = fixture.doors.find(d => d.id === actor.doorId);
    if (!door || !Number.isFinite(arrival) || arrival < 0) throw new Error('算例必须提供合法入口和到达时间');
    const building = door.buildingId ?? door.id, used = slots.get(building) ?? 0;
    if (door.capacity !== undefined && used >= door.capacity) {
      records.push({ id: actor.id, doorId: door.id, arrivalAt: arrival, enteredAt: null, wolfArrival: door.wolfArrival, timely: false, exposed: true, reason: '保护位不足' }); continue;
    }
    slots.set(building, used + 1);
    const enteredAt = serviceCompletion(Math.max(arrival, finish.get(door.id) ?? 0), door.panic, door.calm ?? []);
    finish.set(door.id, enteredAt);
    records.push({ id: actor.id, doorId: door.id, arrivalAt: arrival, enteredAt, wolfArrival: door.wolfArrival,
      timely: enteredAt < door.wolfArrival, exposed: enteredAt >= door.wolfArrival, reason: enteredAt >= door.wolfArrival ? '排队完成时已暴露；仍可救援' : '首轮及时入棚' });
  }
  return { timely: records.filter(r => r.timely).length, exposed: records.filter(r => r.exposed).length, records };
}

function reserve(s: ThreatState, layout: Layout, visible = visibleThreatPositions(s, layout)) {
  // Globally nearest reachable actor/entry pairs; stable animal IDs settle ties.
  const used = new Map<string, Set<number>>();
  for (const actor of s.actors) if (actor.reservation) {
    const slots = used.get(actor.reservation.buildingId) ?? new Set<number>();
    slots.add(actor.reservation.slot); used.set(actor.reservation.buildingId, slots);
  }
  const pairs = s.actors.filter(a => liveActor(a) && !a.reservation).flatMap(actor => s.doors.map(door => ({ actor, door, path: actorPath(layout, actor.position, door.position, visible) })))
    .filter(p => p.path.length).sort((a, b) => length(a.path) - length(b.path) || byId(a.actor, b.actor) || a.door.buildingId.localeCompare(b.door.buildingId) || a.door.doorId.localeCompare(b.door.doorId));
  for (const pair of pairs) {
    if (pair.actor.reservation) continue;
    const slots = used.get(pair.door.buildingId) ?? new Set<number>();
    const slot = Array.from({ length: pair.door.capacity }, (_, i) => i).find(i => !slots.has(i));
    if (slot === undefined) continue;
    pair.actor.reservation = { buildingId: pair.door.buildingId, doorId: pair.door.doorId, slot };
    pair.actor.pathLength = length(pair.path); setPath(pair.actor, pair.path); pair.actor.reason = '';
    slots.add(slot); used.set(pair.door.buildingId, slots);
    emit(s, 'path', { actorId: pair.actor.id, path: pair.path.map(point), reason: `预约${pair.door.buildingId}第${slot + 1}位，经${pair.door.doorId}，${rounded(pair.actor.pathLength)}格` });
  }
  for (const actor of s.actors) if (liveActor(actor) && !actor.reservation) actor.reason = '没有可达的空余保护位';
  if (s.discoveredAt === s.elapsed) for (const door of s.doors) {
    const n = s.actors.filter(a => a.reservation?.doorId === door.doorId).length;
    door.panic = s.howled && n >= THREAT_RULES.denseCount ? THREAT_RULES.densePanic : THREAT_RULES.normalPanic;
  }
}

function discover(s: ThreatState, layout: Layout, input: ThreatStepInput) {
  if (s.discoveredAt !== null) return;
  const g = s.guardian;
  const observers = [
    ...(g ? [{ position: g.position, sight: guardianSight(s, layout) }] : []),
    ...(input.playerPosition ? [{ position: input.playerPosition, sight: THREAT_RULES.playerSight }] : []),
    ...s.actors.map(a => ({ position: a.position, sight: THREAT_RULES.animalSight })),
  ];
  const visible = s.wolves.filter(w => observers.some(o => distance(o.position, w.position) <= o.sight && lineOfSight(layout, o.position, w.position, o.sight)));
  if (!visible.length) return;
  s.discoveredAt = s.elapsed;
  emit(s, 'alert', { reason: '首次实际视线发现，发出全局警报' });
  for (const actor of s.actors) { actor.discoveredAt = s.elapsed; emit(s, 'discovered', { actorId: actor.id, position: point(actor.position) }); }
  reserve(s, layout, visible.map(w => w.position));
  for (const actor of s.actors) {
    const gathered = g?.ability === 'gather' && g.abilityUntil > s.elapsed && reachableWithin(layout, g.abilityPosition, actor.position, abilityRules(s,'cat').range);
    actor.departAt = s.elapsed + (gathered ? 0 : THREAT_RULES.reaction);
  }
  if (g && ['patrol', 'rest'].includes(g.behavior)) { g.behavior = 'respond'; g.path = []; g.pathIndex = 0; }
  if (g?.kind === 'cat' && g.cooldowns.gather <= s.elapsed) cast(s, layout, 'gather');
}

function expose(s: ThreatState, actor: ThreatActor, reason: string, at = s.elapsed) {
  if (actor.exposedAt !== null) return;
  actor.exposedAt = at; actor.reason = reason;
  emit(s, 'exposure', { actorId: actor.id, position: point(actor.position), reason }, at);
}
function release(s: ThreatState, layout: Layout, wolf: ThreatWolf, reason: string) {
  const actor = s.actors.find(a => a.id === wolf.targetActorId);
  if (actor && actor.status === 'carried') {
    actor.position = point(wolf.position); actor.status = 'evacuating'; actor.rescuedAt = s.elapsed;
    actor.doorArrivalAt = null; actor.serviceStartedAt = null; actor.reattackAfter = s.elapsed + THREAT_RULES.windup;
    const door = s.doors.find(d => d.doorId === actor.reservation?.doorId);
    if (door) setPath(actor, pathTo(layout, actor.position, door.position));
    emit(s, 'rescue', { actorId: actor.id, wolfId: wolf.id, position: point(actor.position), reason });
  }
  wolf.targetActorId = null; wolf.stageProgress = 0; wolf.status = 'approach'; wolf.interruptedUntil = s.elapsed;
  const door = s.doors.find(d => d.doorId === wolf.targetDoorId);
  if (door) setPath(wolf, pathTo(layout, wolf.position, door.position));
}

function cast(s: ThreatState, layout: Layout, ability: GuardianAbility, wolfId?: string) {
  const g = s.guardian;
  if (!g || g.cooldowns[ability] > s.elapsed) return false;
  if (ability === 'calm' && g.ability === 'bubble' && g.abilityUntil > s.elapsed) return false;
  if ((ability === 'block' && g.kind !== 'dog') || (ability === 'gather' && g.kind !== 'cat') || (['calm', 'bubble'].includes(ability) && g.kind !== 'frog')) return false;
  if (ability === 'block' || ability === 'bubble') {
    const range = ability === 'block' ? THREAT_RULES.dog.range : THREAT_RULES.frog.bubbleRange;
    const wolf = s.wolves.find(w => w.id === wolfId) ?? [...s.wolves].filter(w => !['boundary', 'retreated'].includes(w.status)).sort((a, b) => distance(g.position, a.position) - distance(g.position, b.position) || byId(a, b))[0];
    if (!wolf || ['boundary', 'retreated'].includes(wolf.status) || distance(g.position, wolf.position) > range || !lineOfSight(layout, g.position, wolf.position, range)) return false;
    if (ability === 'block' && !reachableWithin(layout, g.position, wolf.position, range)) return false;
    if (ability === 'block' && wolf.blockUsed >= abilityRules(s,'dog').duration) return false;
    if (ability === 'bubble' && wolf.bubbleDelay >= THREAT_RULES.frog.bubbleMaxDelay) return false;
    release(s, layout, wolf, ability === 'block' ? '刀盾狗打断并守住这一路' : '泡泡命中，打断抓取');
    if (ability === 'block') {
      const duration = abilityRules(s,'dog').duration - wolf.blockUsed;
      wolf.blockedUntil = s.elapsed + duration; wolf.blockUsed += duration;
      g.abilityUntil = wolf.blockedUntil; g.cooldowns.block = s.elapsed + THREAT_RULES.dog.cooldown;
    } else {
      wolf.slowedUntil = s.elapsed + THREAT_RULES.frog.bubbleDuration;
      g.abilityUntil = wolf.slowedUntil; g.cooldowns.bubble = s.elapsed + THREAT_RULES.frog.bubbleCooldown;
    }
  } else if (ability === 'gather') {
    g.abilityUntil = s.elapsed + abilityRules(s,'cat').duration; g.cooldowns.gather = s.elapsed + THREAT_RULES.cat.cooldown;
    for (const actor of s.actors) if (actor.departAt !== null && actor.status === 'waiting' && reachableWithin(layout, g.position, actor.position, abilityRules(s,'cat').range)) actor.departAt = Math.min(actor.departAt, s.elapsed);
  } else {
    g.abilityUntil = s.elapsed + abilityRules(s,'frog').duration; g.cooldowns.calm = s.elapsed + THREAT_RULES.frog.cooldown;
    g.calmWindows.push({ from: s.elapsed, until: g.abilityUntil, position: point(g.position) });
  }
  // One active ability: a bubble replaces calm and its local service benefit.
  if (ability === 'bubble') for (const window of g.calmWindows) window.until = Math.min(window.until, s.elapsed);
  g.ability = ability; g.abilityStartedAt = s.elapsed; g.abilityPosition = point(g.position); g.pendingAbility = null;
  emit(s, 'guardian-skill', { ...(wolfId ? { wolfId } : {}), position: point(g.position), reason: ability });
  return true;
}

export function guardianCommand(state: ThreatState, layout: Layout, command: GuardianCommand): { state: ThreatState; ok: boolean; reason?: string } {
  const fail = (reason: string) => ({ state, ok: false, reason });
  if (!command || !['select', 'follow', 'station', 'patrol', 'block', 'gather', 'calm', 'bubble', 'rescue'].includes(command.kind)) return fail('请选择合法的伙伴指令');
  if (command.kind === 'select') {
    if (state.phase !== 'choosing' || state.guardian) return fail('事件期间只有一个守护槽，不能换人重置技能');
    if (!command.guardian || !['dog', 'cat', 'frog'].includes(command.guardian)) return fail('请选择一位守护者');
    const s = clone(state); s.guardian = guardian(command.guardian, s.guardianStart); s.phase = 'active';
    emit(s, 'guardian-selected', { reason: command.guardian }); return { state: s, ok: true };
  }
  if (!state.guardian || state.phase === 'choosing') return fail('请先选择守护者');
  if (state.phase === 'complete') return fail('本次事件已经结束');
  const g = state.guardian;
  if (command.target && (!Number.isFinite(command.target.x) || !Number.isFinite(command.target.z) || !isWalkable(layout, cell(command.target)) || !pathTo(layout, g.position, cell(command.target)).length)) return fail('目标不可达，请选择同一连通区的合法地点');
  if (['block', 'gather', 'calm', 'bubble'].includes(command.kind)) {
    const ability = command.kind as GuardianAbility;
    if ((ability === 'block' && g.kind !== 'dog') || (ability === 'gather' && g.kind !== 'cat') || (['calm', 'bubble'].includes(ability) && g.kind !== 'frog')) return fail('当前守护者没有这项能力');
    if (g.cooldowns[ability] > state.elapsed) return fail(`技能还需${Math.ceil(g.cooldowns[ability] - state.elapsed)}秒冷却`);
    if (ability === 'calm' && g.ability === 'bubble' && g.abilityUntil > state.elapsed) return fail('泡泡施法尚未结束，结束后才能安抚');
    const wolf = command.wolfId ? state.wolves.find(w => w.id === command.wolfId) : undefined;
    if (command.wolfId && !wolf) return fail('目标狼不存在');
    if ((ability === 'block' || ability === 'bubble') && !wolf && !state.wolves.some(w => !['retreated', 'boundary'].includes(w.status))) return fail('没有可拦截的威胁');
    if (ability === 'block' && wolf && wolf.blockUsed >= abilityRules(state,'dog').duration) return fail(`同一威胁最多守住${abilityRules(state,'dog').duration}秒`);
    if (ability === 'bubble' && wolf && wolf.bubbleDelay >= THREAT_RULES.frog.bubbleMaxDelay) return fail('这条狼路线的泡泡延迟已到2秒上限');
    const target = command.target ? cell(command.target) : wolf?.position;
    if (target && !pathTo(layout, g.position, target).length) return fail('守护者到不了这条威胁路线');
    if (ability === 'bubble' && wolf && (distance(g.position, wolf.position) > THREAT_RULES.frog.bubbleRange || !lineOfSight(layout, g.position, wolf.position, THREAT_RULES.frog.bubbleRange))) return fail('泡泡需要6格内且有实际视线');
    const s = clone(state), next = s.guardian!;
    next.behavior = 'emergency'; next.target = target ? point(target) : point(next.position); next.targetWolfId = wolf?.id ?? null; next.pendingAbility = ability;
    if (!cast(s, layout, ability, wolf?.id) && target) setPath(next, pathTo(layout, next.position, target));
    return { state: s, ok: true };
  }
  if (command.kind === 'station' && !command.target) return fail('驻守需要指定地点');
  if (command.kind === 'rescue') {
    const actor = state.actors.find(a => a.id === command.actorId);
    if (!actor || !['carried', 'boundary'].includes(actor.status)) return fail('这只动物目前不需要追救');
    if (!pathTo(layout, g.position, actor.position).length) return fail('救援点不可达');
  }
  const s = clone(state), next = s.guardian!;
  next.behavior = command.kind === 'rescue' ? 'rescue' : command.kind as 'follow' | 'station' | 'patrol';
  next.target = command.target ? cell(command.target) : null; next.targetActorId = command.actorId ?? null;
  next.targetWolfId = null; next.pendingAbility = null; next.path = []; next.pathIndex = 0;
  if (next.ability === 'calm') for (const window of next.calmWindows) window.until = Math.min(window.until, s.elapsed);
  if (next.ability === 'block') for (const wolf of s.wolves) if (wolf.blockedUntil > s.elapsed && distance(wolf.position, next.position) <= THREAT_RULES.dog.range) {
    wolf.blockUsed = Math.max(0, rounded(wolf.blockUsed - (wolf.blockedUntil - s.elapsed))); wolf.blockedUntil = s.elapsed;
  }
  if (next.ability === 'calm' || next.ability === 'block') { next.ability = null; next.abilityUntil = s.elapsed; }
  if (next.target) setPath(next, pathTo(layout, next.position, next.target));
  emit(s, 'guardian-command', { reason: command.kind, ...(command.target ? { position: point(command.target) } : {}) });
  return { state: s, ok: true };
}

function guardianStep(s: ThreatState, layout: Layout, input: ThreatStepInput, dt: number) {
  const g = s.guardian;
  if (!g) return;
  if (g.ability && g.abilityUntil <= s.elapsed) g.ability = null;
  let target: GridPoint | null = null;
  if (g.behavior === 'emergency') {
    const wolf = s.wolves.find(w => w.id === g.targetWolfId);
    target = wolf && !['retreated', 'boundary'].includes(wolf.status) ? wolf.position : g.target;
    if (g.pendingAbility && cast(s, layout, g.pendingAbility, g.targetWolfId ?? undefined)) return;
    if (!g.pendingAbility && !g.ability) { g.behavior = 'respond'; g.target = null; }
  } else if (g.behavior === 'rescue') {
    const actor = s.actors.find(a => a.id === g.targetActorId);
    if (actor && ['carried', 'boundary'].includes(actor.status)) {
      target = actor.position;
      const wolf = s.wolves.find(w => w.targetActorId === actor.id && w.status === 'carrying');
      if (wolf && distance(g.position, wolf.position) <= THREAT_RULES.contact && lineOfSight(layout, g.position, wolf.position, THREAT_RULES.contact)) release(s, layout, wolf, '守护者追上并救回，继续护送');
    } else { g.behavior = 'respond'; g.targetActorId = null; }
  } else if (g.behavior === 'follow') target = input.playerPosition ? cell(input.playerPosition) : g.target;
  else if (g.behavior === 'station') target = g.target;
  else if (s.discoveredAt !== null) {
    g.behavior = 'respond';
    if (g.kind === 'dog') {
      const wolves = s.wolves.filter(w => !['boundary', 'retreated'].includes(w.status)).map(w => ({ wolf: w, path: pathTo(layout, g.position, w.position) }))
        .filter(p => p.path.length).sort((a, b) => length(a.path) - length(b.path) || byId(a.wolf, b.wolf));
      const wolf = wolves[0]?.wolf;
      if (wolf) { target = wolf.position; if (cast(s, layout, 'block', wolf.id)) return; }
    } else if (g.kind === 'cat') {
      const waiting = s.actors.filter(a => a.status === 'waiting').sort(byId);
      target = waiting[0]?.position ?? s.doors.find(d => d.queue.length)?.position ?? null;
      if (waiting.some(a => reachableWithin(layout, g.position, a.position, abilityRules(s,'cat').range))) cast(s, layout, 'gather');
    } else {
      const busy = [...s.doors].sort((a, b) => s.actors.filter(x => x.reservation?.doorId === b.doorId && liveActor(x)).length - s.actors.filter(x => x.reservation?.doorId === a.doorId && liveActor(x)).length || a.doorId.localeCompare(b.doorId));
      target = busy[0]?.position ?? null;
      if (target && distance(g.position, target) <= abilityRules(s,'frog').range && (!g.ability || g.ability === 'calm')) cast(s, layout, 'calm');
    }
  } else {
    // Stable patrol points remain on the same graph; no invisible scouting bonus.
    const points = boundaryPoints(layout).filter(p => pathTo(layout, g.position, p).length);
    if (points.length) { target = points[(Math.abs(s.seed) + g.patrolIndex * Math.max(1, Math.floor(points.length / 4))) % points.length]; if (distance(g.position, target) < 0.1) g.patrolIndex++; }
    g.behavior = 'patrol';
  }
  if (g.ability === 'calm' || g.ability === 'block') return;
  if (target && distance(g.position, target) > 0.05) {
    if (!g.path.length || !equal(g.path[g.path.length - 1], target)) setPath(g, pathTo(layout, g.position, target));
    move(g, THREAT_RULES[g.kind].speed, dt);
  }
}

function actorStep(s: ThreatState, layout: Layout, dt: number, previous: number) {
  for (const actor of s.actors) {
    if (!liveActor(actor) || actor.departAt === null || actor.departAt > s.elapsed || !actor.reservation) continue;
    const door = s.doors.find(d => d.doorId === actor.reservation!.doorId);
    if (!door) continue;
    if (actor.status === 'waiting') { actor.status = 'evacuating'; emit(s, 'depart', { actorId: actor.id, position: point(actor.position) }, actor.departAt); }
    if (actor.status !== 'evacuating') continue;
    if (actor.pathIndex < actor.path.length && !isWalkable(layout, cell(actor.path[actor.pathIndex]))) {
      actor.reservation = null; actor.path = []; reserve(s, layout); continue;
    }
    const start = Math.max(previous, actor.departAt), available = Math.min(dt, s.elapsed - start);
    const spent = move(actor, actor.injuredAt === null ? THREAT_RULES.animalSpeed : THREAT_RULES.injuredSpeed, available);
    if (actor.pathIndex >= actor.path.length && equal(actor.position, door.position)) {
      actor.status = 'queued'; actor.doorArrivalAt = rounded(start + spent);
      emit(s, 'door-arrival', { actorId: actor.id, position: point(actor.position), reason: `等待${door.doorId}入棚` }, actor.doorArrivalAt);
    }
  }
}

function queueStep(s: ThreatState, layout: Layout) {
  for (const door of s.doors) {
    const queue = s.actors.filter(a => a.status === 'queued' && a.reservation?.doorId === door.doorId)
      .sort((a, b) => (a.doorArrivalAt ?? 0) - (b.doorArrivalAt ?? 0) || byId(a, b));
    door.queue = queue.map(a => a.id); door.serviceActorId = null;
    for (const actor of queue) {
      if (actor.serviceStartedAt === null) actor.serviceStartedAt = Math.max(actor.doorArrivalAt ?? s.elapsed, door.lastFinishedAt);
      const g = s.guardian;
      // Keep completed windows so a service at11.99 is still admitted when a
      // simulation step crosses the12.00 expiry. Cancellation clips the window.
      const calm = g?.calmWindows.filter(w => distance(w.position, door.position) <= abilityRules(s,'frog').range) ?? [];
      const entered = serviceCompletion(actor.serviceStartedAt, door.panic, calm,shelterDoorService(s.upgrades?.shelterLevels?.[door.buildingId]));
      if (entered > s.elapsed + 1e-8) { door.serviceActorId = actor.id; break; }
      actor.enteredAt = entered; actor.status = 'safe'; actor.timely = actor.rescuedAt === null && (door.wolfArrivedAt === null || entered < door.wolfArrivedAt);
      actor.reason = actor.timely ? '首轮及时入棚' : '暴露后已进入预约位';
      if (!actor.timely) expose(s, actor, '暴露后完成入棚', door.wolfArrivedAt ?? entered);
      // The visible actor occupies an actual reserved interior slot after service.
      // Interior cells are solid to outsiders; they are not used as path shortcuts.
      const final = actor.reservation!;
      const building = layout.buildings.find(b => b.id === final.buildingId);
      if (building) actor.position = point(buildingFootprint(building)[final.slot % buildingFootprint(building).length]);
      emit(s, 'entry', { actorId: actor.id, position: point(actor.position), reason: `${final.buildingId}预约位${final.slot + 1}` }, entered);
      door.lastFinishedAt = entered;
    }
    door.queue = s.actors.filter(a => a.status === 'queued' && a.reservation?.doorId === door.doorId).sort((a, b) => (a.doorArrivalAt ?? 0) - (b.doorArrivalAt ?? 0) || byId(a, b)).map(a => a.id);
  }
}

function wolfStep(s: ThreatState, layout: Layout, input: ThreatStepInput, dt: number, previous: number) {
  for (const wolf of s.wolves) {
    if (['retreated', 'boundary'].includes(wolf.status)) continue;
    if (input.driveOff === wolf.id && input.playerPosition && distance(input.playerPosition, wolf.position) <= THREAT_RULES.driveOffRange && lineOfSight(layout, input.playerPosition, wolf.position, THREAT_RULES.driveOffRange)) {
      release(s, layout, wolf, 'LX在实际位置驱赶并救回'); wolf.blockedUntil = Math.max(wolf.blockedUntil, s.elapsed + 2); emit(s, 'drive-off', { wolfId: wolf.id, position: point(wolf.position) });
    }
    if (wolf.blockedUntil > previous || wolf.interruptedUntil > previous) continue;
    if (s.mode === 'tutorial' && s.elapsed >= THREAT_RULES.tutorialRetreat) {
      wolf.status = 'retreated'; emit(s, 'tutorial-fallback', { wolfId: wolf.id, reason: '伙伴赶走教学威胁，继续按真实路线排队回棚' }); continue;
    }
    const canAttack = s.mode !== 'tutorial' && s.mode !== 'rehearsal';
    if (wolf.status === 'carrying') {
      const actor = s.actors.find(a => a.id === wolf.targetActorId);
      move(wolf, THREAT_RULES.carrySpeed, dt);
      if (actor) actor.position = point(wolf.position);
      if (wolf.pathIndex >= wolf.path.length && actor) {
        wolf.status = 'boundary'; actor.status = 'boundary'; actor.rescueStartedAt = s.elapsed; actor.rescueRemaining = THREAT_RULES.rescueWindow;
        actor.rescuePoint = point(wolf.spawn); actor.rescueProgress = 0;
        emit(s, 'boundary-rescue', { actorId: actor.id, wolfId: wolf.id, position: point(actor.position), reason: '180秒在线追踪救援；靠近1格连续3秒' });
      }
      continue;
    }
    const target = s.actors.find(a => a.id === wolf.targetActorId);
    if (['windup', 'grabbing'].includes(wolf.status)) {
      if (!target || !liveActor(target) || target.reattackAfter > s.elapsed) { release(s, layout, wolf, '目标已离开'); continue; }
      if (distance(wolf.position, target.position) > THREAT_RULES.contact) {
        setPath(wolf, pathTo(layout, wolf.position, target.position)); move(wolf, THREAT_RULES.wolfSpeed, dt);
      }
      if (distance(wolf.position, target.position) > THREAT_RULES.contact || !lineOfSight(layout, wolf.position, target.position, THREAT_RULES.contact)) { wolf.stageProgress = 0; wolf.status = 'windup'; continue; }
      wolf.stageProgress = rounded(wolf.stageProgress + dt);
      if (wolf.status === 'windup' && wolf.stageProgress >= THREAT_RULES.windup) {
        if (target.injuredAt === null) { target.injuredAt = s.elapsed; target.reason = '受伤后速度0.7，仍可回棚与救援'; emit(s, 'injury', { actorId: target.id, wolfId: wolf.id, position: point(target.position) }); }
        wolf.status = 'grabbing'; wolf.stageProgress = 0; emit(s, 'grab-start', { actorId: target.id, wolfId: wolf.id, position: point(target.position), reason: '4秒连续抓取，可打断' });
      } else if (wolf.status === 'grabbing' && wolf.stageProgress >= THREAT_RULES.grab) {
        target.status = 'carried'; target.serviceStartedAt = null; wolf.status = 'carrying'; wolf.stageProgress = 0;
        setPath(wolf, pathTo(layout, wolf.position, wolf.spawn)); target.position = point(wolf.position);
        emit(s, 'carried', { actorId: target.id, wolfId: wolf.id, position: point(target.position), path: wolf.path.map(point), reason: '沿可见路径叼向边界，速度0.7' });
      }
      continue;
    }
    let speed = THREAT_RULES.wolfSpeed;
    if (wolf.slowedUntil > previous && wolf.bubbleDelay < THREAT_RULES.frog.bubbleMaxDelay) {
      speed *= 0.5;
    }
    const spent = move(wolf, speed, dt);
    if (speed < THREAT_RULES.wolfSpeed) wolf.bubbleDelay = Math.min(THREAT_RULES.frog.bubbleMaxDelay, rounded(wolf.bubbleDelay + spent * 0.5));
    const door = s.doors.find(d => d.doorId === wolf.targetDoorId);
    if (door && equal(wolf.position, door.position) && wolf.arrivedAt === null) {
      wolf.arrivedAt = rounded(previous + spent); door.wolfArrivedAt = Math.min(door.wolfArrivedAt ?? Infinity, wolf.arrivedAt);
      emit(s, 'wolf-door', { wolfId: wolf.id, position: point(wolf.position), reason: door.doorId }, wolf.arrivedAt);
    }
    if (canAttack) {
      const candidates = s.actors.filter(a => liveActor(a) && a.reattackAfter <= s.elapsed && distance(a.position, wolf.position) <= THREAT_RULES.contact && lineOfSight(layout, wolf.position, a.position, THREAT_RULES.contact))
        .sort((a, b) => distance(a.position, wolf.position) - distance(b.position, wolf.position) || byId(a, b));
      if (candidates[0]) {
        const actor = candidates[0]; wolf.targetActorId = actor.id; wolf.status = 'windup'; wolf.stageProgress = 0;
        expose(s, actor, '狼已接近1格，正在2秒攻击前摇'); emit(s, 'attack-windup', { actorId: actor.id, wolfId: wolf.id, position: point(wolf.position), reason: '2秒可见前摇，可驱赶或让伙伴打断' });
      } else if (wolf.arrivedAt !== null) {
        const chase = s.actors.filter(liveActor).map(a => ({ actor: a, path: pathTo(layout, wolf.position, a.position) })).filter(p => p.path.length).sort((a, b) => length(a.path) - length(b.path) || byId(a.actor, b.actor));
        if (chase[0]) setPath(wolf, chase[0].path); else wolf.status = 'retreated';
      }
    } else if (wolf.arrivedAt !== null && s.mode === 'rehearsal') wolf.status = 'retreated';
  }
}

function markLost(s: ThreatState, actor: ThreatActor, reason: string) {
  const permanent = s.mode === 'challenge' && actor.participant && actor.role === 'animal' && s.confirmedParticipants.includes(actor.id);
  actor.status = permanent ? 'memorial' : 'lost'; actor.memorialAt = permanent ? s.elapsed : null;
  actor.reason = permanent ? `${reason}；保留姓名与纪念，原ID不会复活` : `${reason}；可免费找回并照料`;
  actor.rescueRemaining = 0; actor.rescueProgress = 0;
  emit(s, permanent ? 'memorial' : 'recoverable-lost', { actorId: actor.id, position: point(actor.position), reason: actor.reason });
}
function rescueStep(s: ThreatState, layout: Layout, input: ThreatStepInput, dt: number) {
  for (const actor of s.actors) {
    if (actor.status === 'lost' && input.findBackActorId === actor.id) {
      actor.status = 'evacuating'; actor.position = point(actor.rescuePoint ?? actor.position); actor.rescuedAt = s.elapsed;
      actor.reattackAfter = s.elapsed + THREAT_RULES.windup; actor.departAt = s.elapsed;
      const door = s.doors.find(d => d.doorId === actor.reservation?.doorId);
      if (door) setPath(actor, pathTo(layout, actor.position, door.position)); else reserve(s, layout);
      for (const wolf of s.wolves) if (wolf.targetActorId === actor.id && wolf.status === 'boundary') wolf.status = 'retreated';
      actor.reason = '免费找回，继续护送回棚和照料'; emit(s, 'find-back', { actorId: actor.id, position: point(actor.position), reason: actor.reason });
    }
    if (actor.status !== 'boundary') continue;
    const onlineDt = Math.min(dt, s.elapsed - (actor.rescueStartedAt ?? s.elapsed));
    if (input.abandonActorId === actor.id && input.abandonConfirmed) { markLost(s, actor, '已二次确认放弃本次追救'); continue; }
    const g = s.guardian;
    const nearbyPlayer = input.rescueActorId === actor.id && input.playerPosition && distance(input.playerPosition, actor.position) <= THREAT_RULES.contact && lineOfSight(layout, input.playerPosition, actor.position, THREAT_RULES.contact);
    const nearbyGuardian = g?.behavior === 'rescue' && g.targetActorId === actor.id && distance(g.position, actor.position) <= THREAT_RULES.contact && lineOfSight(layout, g.position, actor.position, THREAT_RULES.contact);
    actor.rescueProgress = nearbyPlayer || nearbyGuardian ? rounded(actor.rescueProgress + onlineDt) : 0;
    if (actor.rescueProgress >= THREAT_RULES.rescueWork) {
      actor.status = 'evacuating'; actor.rescuedAt = s.elapsed; actor.rescueRemaining = null; actor.rescueProgress = 0;
      actor.departAt = s.elapsed; actor.doorArrivalAt = null; actor.serviceStartedAt = null;
      actor.reattackAfter = s.elapsed + THREAT_RULES.windup;
      const door = s.doors.find(d => d.doorId === actor.reservation?.doorId);
      if (door) setPath(actor, pathTo(layout, actor.position, door.position)); else reserve(s, layout);
      for (const wolf of s.wolves) if (wolf.targetActorId === actor.id && wolf.status === 'boundary') wolf.status = 'retreated';
      emit(s, 'rescue', { actorId: actor.id, position: point(actor.position), reason: '靠近1格连续3秒，回到合法边界出口；继续护送' });
      continue;
    }
    actor.rescueRemaining = Math.max(0, rounded((actor.rescueRemaining ?? THREAT_RULES.rescueWindow) - onlineDt));
    if (actor.rescueRemaining === 0) markLost(s, actor, '180秒在线追救窗口已结束');
  }
}

export function stepThreat(state: ThreatState, layout: Layout, input: ThreatStepInput): ThreatState {
  if (!Number.isFinite(input.dt) || input.dt < 0) throw new Error('在线步长必须是非负有限秒数');
  if (input.dt === 0 || state.phase === 'choosing') return clone(state);
  const recovery = state.phase === 'complete' && state.actors.some(a => a.id === input.findBackActorId && a.status === 'lost');
  if (layout.version !== state.lockedLayoutVersion && !recovery && state.phase !== 'complete') throw new Error('事件期间布局已锁定，不能改变路线与入口');
  if (state.phase === 'complete' && !input.findBackActorId) return clone(state);
  const s = clone(state);
  if (s.phase === 'complete' && !recovery) return s;
  if (recovery) {
    s.phase = 'active'; s.lockedLayoutVersion = layout.version;
    // After an ended event, a free recovery uses the current legal layout. This
    // also allows adding the missing shelter without making loss irreversible.
    s.doors = shelterEntries(layout).map(d => ({ buildingId: d.buildingId, doorId: d.doorId, position: { x: d.x, z: d.z }, capacity: d.capacity,
      panic: THREAT_RULES.normalPanic, queue: [], wolfArrivedAt: null, serviceActorId: null, lastFinishedAt: s.elapsed }));
    const actor = s.actors.find(a => a.id === input.findBackActorId)!;
    if (!s.doors.some(d => d.doorId === actor.reservation?.doorId)) actor.reservation = null;
    if (!isWalkable(layout, cell(actor.position))) {
      const exit = boundaryPoints(layout).sort((a, b) => distance(a, actor.position) - distance(b, actor.position) || a.x - b.x || a.z - b.z)[0];
      if (exit) actor.rescuePoint = point(exit);
    }
  }
  let remaining = input.dt;
  while (remaining > 1e-9 && s.phase !== 'complete') {
    const dt = Math.min(THREAT_RULES.step, remaining), previous = s.elapsed;
    discover(s, layout, input);
    s.elapsed = rounded(s.elapsed + dt); remaining -= dt;
    guardianStep(s, layout, input, dt);
    actorStep(s, layout, dt, previous);
    wolfStep(s, layout, input, dt, previous);
    queueStep(s, layout);
    for (const actor of s.actors) {
      const door = s.doors.find(d => d.doorId === actor.reservation?.doorId);
      if (door?.wolfArrivedAt !== null && door?.wolfArrivedAt !== undefined && (actor.enteredAt === null || actor.enteredAt >= door.wolfArrivedAt)) expose(s, actor, '狼抵达该入口时尚未完成入棚', door.wolfArrivedAt);
    }
    rescueStep(s, layout, input, dt);
    s.phase = s.actors.some(a => a.status === 'boundary') ? 'rescue' : 'active';
    if (s.actors.every(a => ['safe', 'lost', 'memorial'].includes(a.status)) || (s.wolves.every(w => w.status === 'retreated') && !s.actors.some(a => (a.status === 'evacuating' && a.reservation !== null) || ['queued', 'carried', 'boundary'].includes(a.status)))) {
      if (s.mode === 'tutorial' && !s.events.some(e => e.type === 'tutorial-fallback')) emit(s, 'tutorial-fallback', { reason: '伙伴教学保护已完成；三位选择均可安全通过，回棚仍遵守路径与门队列' });
      s.phase = 'complete'; emit(s, 'complete', { reason: s.mode === 'rehearsal' ? '无损演练完成，无经济奖励' : '本次事件结果已保存' });
    }
  }
  return s;
}

export function threatSummary(state: ThreatState) {
  const records = state.actors.map(a => ({ id: a.id, status: a.status, timely: a.timely, discoveredAt: a.discoveredAt,
    departAt: a.departAt, pathLength: a.pathLength, doorId: a.reservation?.doorId ?? null, doorArrivalAt: a.doorArrivalAt,
    enteredAt: a.enteredAt, exposedAt: a.exposedAt, injuredAt: a.injuredAt, rescuedAt: a.rescuedAt, memorialAt: a.memorialAt, reason: a.reason }));
  const reasons = [...new Set(state.actors.map(a => a.reason).filter(Boolean))];
  return { total: records.length, safe: records.filter(a => a.status === 'safe').length,
    timely: records.filter(a => a.timely).length, exposed: records.filter(a => a.exposedAt !== null).length,
    injured: records.filter(a => a.injuredAt !== null).length, rescued: records.filter(a => a.rescuedAt !== null).length,
    lost: records.filter(a => a.status === 'lost' || a.status === 'memorial').length,
    recoverableLost: records.filter(a => a.status === 'lost').length, memorial: records.filter(a => a.status === 'memorial').length,
    records, reasons, recommendation: reasons.some(r => r.includes('保护位')) ? '先补充可达保护位，再增加动物' : records.some(a => a.exposedAt !== null) ? '把集合点移近保护棚，或预览增加独立入口' : '当前路线可用，可用无损演练比较下一次改造', rewards: 0 as const };
}
