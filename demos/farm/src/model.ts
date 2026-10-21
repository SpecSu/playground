import {journey} from './journey.ts';
export const ACTIONS = ['dance', 'bounce', 'love'] as const;
export type Action = typeof ACTIONS[number];
export type Avatar = 'human-lx' | 'miaocuijiao' | 'banana-cat';
export type Personality = 'eager' | 'shy' | 'independent';
export type Habit = { count: number; stage: 'observe' | 'imitate' | 'invite'; lastAt: number };
export type Care = {feedCount:number;companyCount:number;lastFeedAt:number;lastCompanyAt:number};
export type Animal = {
  id: string; name: string; personality: Personality; preference: Action; color: string;
  bond: number; habits: Partial<Record<Action, Habit>>; experiences: { text: string; at: number }[];
  appearance: 'plain' | 'starlit'; growthEligible: boolean; growthChoiceMade?: boolean;
  care:Care;
};
export type Farm = {
  version: 2; playerId: string; avatar: Avatar; animals: Animal[]; createdAt: number;
  lastActionAt: number; lastRhythmAt: number; visits: number; demoMode: boolean;
  sharedEvents: number; wool: number; woolAt: number; stage: boolean; revision: number;
  company:{animalId:string;startedAt:number;readyAt:number;expiresAt:number}|null;
  book:{met:string[];claimed:string[];rememberedVisits:number};
};
export type Reaction = {
  animalId: string; action: Action; delayMs: number; distance: number; style: 'copy' | 'tiny' | 'remix';
  micro: 'ear' | 'look'; progressed: boolean; source: 'action' | 'memory'; text: string;
};
export type FarmEvent = { id: string; kind: 'action' | 'rhythm' | 'welcome' | 'stage' | 'appearance' | 'feed' | 'company'; at: number; action: Action; reactions: Reaction[] };
export type Command = { id: string; type: string; action?: unknown; target?: unknown; avatar?: unknown; appearance?: unknown;quest?:unknown };
export type Result = { state: Farm; accepted: boolean; message: string; event?: FarmEvent };
export type Snapshot = Farm & { now: number; woolReady: number; storage: 'local-sqlite'; actionReadyAt: number };
export const ACTION_LABEL: Record<Action, string> = { dance: '跳舞', bounce: '蹦跳', love: '喜欢' };
export const PERSONALITY_LABEL: Record<Personality, string> = { eager: '热情', shy: '慢热', independent: '有主见' };
export const WOOL_INTERVAL = 30 * 60_000;
export const WOOL_CAP = 12;
export const STAGE_PRICE = 8;
export const ACTION_COOLDOWN = 6000;
export const LEARNING_COOLDOWN = 12_000;
export const FEED_COOLDOWN=45_000;
export const COMPANY_DURATION=20_000;
export const COMPANY_EXPIRY=60_000;
export const COMPANY_COOLDOWN=300_000;
const emptyCare=():Care=>({feedCount:0,companyCount:0,lastFeedAt:0,lastCompanyAt:0});
export function createFarm(playerId: string, now: number): Farm {
  return { version: 2, playerId, avatar: 'human-lx', createdAt: now, lastActionAt: 0, lastRhythmAt: 0, visits: 0,
    demoMode: false, sharedEvents: 0, wool: 0, woolAt: now, stage: false, revision: 0,
    company:null,book:{met:[],claimed:[],rememberedVisits:0},
    animals: [
      { id: 'pipi', name: '皮皮', personality: 'eager', preference: 'dance', color: '#efa376' },
      { id: 'momo', name: '茉茉', personality: 'shy', preference: 'love', color: '#b2b7df' },
      { id: 'doudou', name: '豆豆', personality: 'independent', preference: 'bounce', color: '#d5ba68' },
    ].map(a => ({ ...a, bond: 0, habits: {}, experiences: [], appearance: 'plain', growthEligible: false,care:emptyCare() })) as Animal[],
  };
}
/** One-time migration: player identity and earned farm state survive the new default body. */
export function upgradeFarm(raw:unknown):Farm {
 const s=structuredClone(raw) as Farm;
 if(!s||typeof s!=='object'||![1,2].includes(s.version))throw new Error('不支持的农场存档版本，原存档已保留');
 if((s.version as number)===1){s.version=2;s.avatar='human-lx';s.company=null;s.book={met:[],claimed:[],rememberedVisits:0};s.animals.forEach(a=>a.care=emptyCare());s.revision++;}
 return s;
}
export function bondStage(bond: number): string { return bond >= 10 ? '默契' : bond >= 6 ? '亲近' : bond >= 3 ? '熟悉' : '初识'; }
export function woolReady(s: Farm, now: number): number { return Math.min(WOOL_CAP, Math.max(0, Math.floor((now - s.woolAt) / WOOL_INTERVAL))); }
export function snapshot(s: Farm, now: number): Snapshot {
  return { ...structuredClone(s), now, woolReady: woolReady(s, now), storage: 'local-sqlite', actionReadyAt: s.lastActionAt + ACTION_COOLDOWN };
}
function remember(a: Animal, text: string, at: number) { a.experiences = [...a.experiences, { text, at }].slice(-8); }
function reaction(a: Animal, action: Action, progressed: boolean, source: Reaction['source']): Reaction {
  const traits = { eager: { delayMs: 120, distance: 1.35, style: 'copy' }, shy: { delayMs: 1600, distance: 2.5, style: 'tiny' }, independent: { delayMs: 650, distance: 3, style: 'remix' } } as const;
  const h = a.habits[action];
  const texts: Record<Personality, string> = source === 'memory'
    ? { eager: `还记得我们的${ACTION_LABEL[action]}！一起？`, shy: `认出你了…悄悄${ACTION_LABEL[action]}`, independent: `我的改编版${ACTION_LABEL[action]}，给你看` }
    : { eager: h?.stage === 'invite' ? '我来带头！轮到你啦' : h?.stage === 'imitate' ? '学会啦！跟你一起' : '好耶！我也来', shy: h?.stage === 'invite' ? '想再和你…来一次' : h?.stage === 'imitate' ? '小幅度…我也试试' : '耳朵动了动，正在看你', independent: h?.stage === 'invite' ? '看我的版本！一起？' : '我想换个节拍～' };
  return { animalId: a.id, action, ...traits[a.personality], micro: a.personality === 'shy' ? 'ear' : 'look', progressed, source, text: texts[a.personality] };
}
function greet(s: Farm): Reaction[] {
  return s.animals.flatMap(a => {
    const learned = ACTIONS.filter(action => (a.habits[action]?.count ?? 0) >= 2)
      .sort((a1, a2) => (a.habits[a2]?.count ?? 0) - (a.habits[a1]?.count ?? 0));
    return learned[0] ? [reaction(a, learned[0], false, 'memory')] : [];
  });
}
export function applyCommand(original: Farm, c: Command, now: number): Result {
  const reject = (message: string): Result => ({ state: original, accepted: false, message });
  const s = structuredClone(original);
  const event = (kind: FarmEvent['kind'], action: Action = 'dance', reactions: Reaction[] = []): FarmEvent => ({ id: c.id, kind, action, reactions, at: now });
  let visual: FarmEvent | undefined;
  let message = '已保存';
  if(c.type==='inspect'){
    const a=s.animals.find(a=>a.id===c.target);if(!a)return reject('请选择一位住民');
    if(s.book.met.includes(a.id))return reject(`已经认识${a.name}啦`);
    s.book.met.push(a.id);message=`认识了${a.name} · ${PERSONALITY_LABEL[a.personality]}`;
  }else if(c.type==='feed'||c.type==='company'){
    const a=s.animals.find(a=>a.id===c.target);if(!a)return reject('先选择一只羊');
    if(now-s.lastActionAt<ACTION_COOLDOWN)return reject('它们还在回应，等一会儿吧');
    if(c.type==='feed'){
      if(now-a.care.lastFeedAt<FEED_COOLDOWN)return reject(`${a.name}还在回味青草，稍后再来`);
      const progressed=a.care.feedCount<3;a.care.lastFeedAt=now;
      if(progressed){a.care.feedCount++;a.bond=Math.min(12,a.bond+1);if(a.care.feedCount===1)remember(a,'第一次吃你摘的青草',now);}
      const texts={eager:'青草！我先尝一口',shy:'先闻一闻…慢慢嚼起来',independent:'我挑这片，慢慢吃'};
      visual=event('feed','love',[{...reaction(a,'love',progressed,'action'),text:texts[a.personality]}]);
      message=progressed?`${a.name}吃到了你摘的青草`:`${a.name}享受青草 · 这次不重复增加关系`;
    }else{
      if(s.company&&now<=s.company.expiresAt)return reject('已经有一位朋友在陪你啦');
      if(now-a.care.lastCompanyAt<COMPANY_COOLDOWN)return reject(`${a.name}记着这段陪伴，稍后再一起待会儿`);
      s.company={animalId:a.id,startedAt:now,readyAt:now+COMPANY_DURATION,expiresAt:now+COMPANY_EXPIRY};
      visual=event('company','love',[{...reaction(a,'love',false,'action'),text:a.personality==='shy'?'隔一点距离，也想陪着你':a.personality==='independent'?'我就坐在这边，陪你一会':'我来陪你！'}]);
      message=`和${a.name}待20秒，完成后记下这段陪伴`;
    }
    s.lastActionAt=now;
  }else if(c.type==='finishCompany'||c.type==='cancelCompany'){
    if(!s.company)return reject('现在没有进行中的陪伴');
    const session=s.company;
    if(c.type==='cancelCompany'||now>session.expiresAt){s.company=null;message='这次陪伴结束了 · 关系不会减少';}
    else{
      if(now<session.readyAt)return reject('再一起待一会儿，陪伴还没完成');
      const a=s.animals.find(a=>a.id===session.animalId)!;const progressed=a.care.companyCount<3;
      if(progressed){a.care.companyCount++;a.bond=Math.min(12,a.bond+1);if(a.care.companyCount===1)remember(a,'和你安静待过一会儿',now);}
      a.care.lastCompanyAt=now;s.company=null;message=`${a.name}记下了这段陪伴${progressed?'':' · 这次不重复增加关系'}`;
    }
  }else if(c.type==='questClaim'){
    const quest=journey(s).find(q=>q.id===c.quest);if(!quest)return reject('没有这个手账目标');
    if(quest.claimed)return reject('这份手账奖励已经收好啦');if(!quest.ready)return reject('先完成这件小事吧');
    s.book.claimed.push(quest.id);s.wool+=quest.reward;message=`${quest.title} · 收到${quest.reward}团羊毛`;
  }else if (['act', 'rhythm', 'stagePlay'].includes(c.type)) {
    const action = c.type === 'act' ? c.action : c.type === 'stagePlay' ? 'bounce' : 'dance';
    if (!(ACTIONS as readonly unknown[]).includes(action)) return reject('请选择跳舞、蹦跳或喜欢');
    const target = c.type === 'act' ? c.target : 'all';
    if (target !== 'all' && !s.animals.some(a => a.id === target)) return reject('先选一只羊，或选大家');
    if (now - s.lastActionAt < ACTION_COOLDOWN) return reject('它们还在回应，等这段动作结束吧');
    if (c.type === 'rhythm' && now - s.lastRhythmAt < 30_000) return reject('奶蛙在休息，稍后再合拍');
    if (c.type === 'stagePlay' && !s.stage) return reject('先用羊毛搭建软垫舞台');
    s.lastActionAt = now;
    if (c.type === 'rhythm') { s.sharedEvents++; s.lastRhythmAt = now; }
    const chosen = action as Action;
    const reactions = s.animals.filter(a => target === 'all' || a.id === target).map(a => {
      const previous = a.habits[chosen];
      const progressed = !previous || now - previous.lastAt >= LEARNING_COOLDOWN;
      if (progressed) {
        const count = Math.min(3, (previous?.count ?? 0) + 1);
        a.habits[chosen] = { count, lastAt: now, stage: count === 1 ? 'observe' : count === 2 ? 'imitate' : 'invite' };
        if ((previous?.count ?? 0) < 3) a.bond = Math.min(12, a.bond + (chosen === a.preference ? 3 : 2));
        if ((previous?.count ?? 0) < count) remember(a, count === 1 ? `第一次看你${ACTION_LABEL[chosen]}` : count === 2 ? `学着和你${ACTION_LABEL[chosen]}` : `会主动邀请你${ACTION_LABEL[chosen]}`, now);
      }
      if (c.type === 'rhythm' && !a.experiences.some(e => e.text === '参加过奶蛙合拍')) remember(a, '参加过奶蛙合拍', now);
      return reaction(a, chosen, progressed, 'action');
    });
    for (const a of s.animals) a.growthEligible = (a.habits.dance?.count ?? 0) >= 3 && s.sharedEvents > 0;
    visual = event(c.type === 'act' ? 'action' : c.type === 'rhythm' ? 'rhythm' : 'stage', chosen, reactions);
    message = c.type === 'rhythm' ? '奶蛙带大家合拍！' : c.type === 'stagePlay' ? '新舞台，来一段软软蹦跳' : reactions.every(r => !r.progressed) ? '它们记得这个动作，陪伴继续 · 这次不重复增加进度' : '看看三种不同的回应';
  } else if (c.type === 'visit' || c.type === 'nextVisit') {
    if(c.type==='nextVisit'&&s.demoMode)return reject('已经在演示来访中，返回自然模式后再体验');
    s.company=null;
    s.visits++;
    if (c.type === 'nextVisit') { s.demoMode = true; s.woolAt = Math.min(s.woolAt, now - WOOL_INTERVAL * WOOL_CAP); }
    visual = event('welcome', 'dance', greet(s));
    if(visual.reactions.length)s.book.rememberedVisits++;
    message = visual.reactions.length ? '它们认出你，用记住的动作来迎接！' : '初次见面，先对大家跳一支舞吧';
    if (c.type === 'nextVisit') message = '演示下次来访（快进 6 小时）· ' + message;
  } else if (c.type === 'natural') {
    s.demoMode = false; message = '回到自然模式 · 已学会的习惯会保留';
  } else if (c.type === 'avatar') {
    if (c.avatar !== 'human-lx' && c.avatar !== 'miaocuijiao' && c.avatar !== 'banana-cat') return reject('这个分身尚未加入农场');
    s.avatar = c.avatar; message = '换好分身啦 · 它们仍然认得你';
  } else if (c.type === 'claim') {
    const amount = woolReady(s, now);
    if (!amount) return reject('羊毛还在慢慢积累');
    s.wool += amount; s.woolAt = amount === WOOL_CAP ? now : s.woolAt + amount * WOOL_INTERVAL;
    message = `收到了 ${amount} 团羊毛`;
  } else if (c.type === 'buy') {
    if (s.stage) return reject('软垫舞台已经搭好啦');
    if (s.wool < STAGE_PRICE) return reject('软垫舞台需要 8 团羊毛');
    s.wool -= STAGE_PRICE; s.stage = true; message = '软垫舞台搭好啦！试试一起蹦';
  } else if (c.type === 'appearance') {
    const a = s.animals.find(a => a.id === c.target);
    if (!a || (c.appearance !== 'plain' && c.appearance !== 'starlit')) return reject('请选择住民和外观');
    if (c.appearance === 'starlit' && !a.growthEligible) return reject('一起学会节奏，再参加一次奶蛙合拍');
    a.appearance = c.appearance; a.growthChoiceMade = true; message = c.appearance === 'starlit' ? `${a.name}留下了星点卷毛 ✦` : `${a.name}恢复了普通卷毛`;
    visual = event('appearance');
  } else return reject('未知指令');
  s.revision++;
  return { state: s, accepted: true, message, ...(visual ? { event: visual } : {}) };
}
