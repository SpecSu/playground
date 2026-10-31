/**
 * Persist this small presentation state alongside its owning tutorial/profile.
 * Times are visible, ready, uncovered online seconds. The caller supplies dt=0
 * after a wall-clock gap; this module never reads a clock or changes the world.
 * Choice and defense require explicit commands and never finish on a timer.
 */
import type { GuardianKind } from './threat.ts';

export type OpeningStage = 'establish' | 'rustle' | 'approach' | 'startle' | 'choose' | 'arrival' | 'defend' | 'done';
export interface OpeningState { version: 1; stage: OpeningStage; elapsed: number; guardian: GuardianKind | null }
export interface OpeningGates { ready: boolean; visible: boolean; covered: boolean }
export type OpeningFocus = 'farm' | 'bushes' | 'wolves' | 'animals' | 'guardians' | 'guardian' | 'entrance' | 'player';
export interface OpeningPresentation {
  stage: OpeningStage; progress: number; caption: string; focus: OpeningFocus;
  guardian: GuardianKind | null; canSkip: boolean; requiresChoice: boolean; controlsLocked: boolean;
}

export const OPENING_DURATIONS = { establish: 1.6, rustle: 1.3, approach: 4.5, startle: 2, arrival: 3 } as const;
const durations: Partial<Record<OpeningStage, number>> = OPENING_DURATIONS;
const next: Partial<Record<OpeningStage, OpeningStage>> = {
  establish: 'rustle', rustle: 'approach', approach: 'startle', startle: 'choose', arrival: 'defend',
};
const preChoice = (stage: OpeningStage) => ['establish', 'rustle', 'approach', 'startle'].includes(stage);
const rounded = (seconds: number) => Math.round(seconds * 1e9) / 1e9;

/** Missing cinematic state must not replay an already completed tutorial. */
export function initialOpening(tutorial?: 'choose' | 'defend' | 'done'): OpeningState {
  return { version: 1, stage: tutorial === 'done' ? 'done' : tutorial === 'defend' ? 'defend' : 'establish', elapsed: 0, guardian: null };
}

export function advanceOpening(state: OpeningState, dt: number, gates: OpeningGates): OpeningState {
  if (!gates.ready || !gates.visible || gates.covered || !Number.isFinite(dt) || dt <= 0 || durations[state.stage] === undefined) return state;
  let stage = state.stage;
  let elapsed = (Number.isFinite(state.elapsed) ? Math.max(0, state.elapsed) : 0) + dt;
  // At most four transitions before an explicit choice; never auto-select or
  // transfer unused time into the later gameplay/defense clock.
  while (durations[stage] !== undefined && elapsed + 1e-9 >= durations[stage]!) {
    elapsed = Math.max(0, rounded(elapsed - durations[stage]!));
    stage = next[stage]!;
  }
  return { ...state, stage, elapsed: durations[stage] === undefined ? 0 : rounded(elapsed) };
}

export function skipOpening(state: OpeningState): OpeningState {
  if (preChoice(state.stage)) return { ...state, stage: 'choose', elapsed: 0 };
  if (state.stage === 'arrival') return { ...state, stage: 'defend', elapsed: 0 };
  return state;
}

export function selectOpeningGuardian(state: OpeningState, guardian: GuardianKind): OpeningState {
  if (state.stage !== 'choose' || !['dog', 'cat', 'frog'].includes(guardian)) return state;
  return { ...state, stage: 'arrival', elapsed: 0, guardian };
}

export function completeOpening(state: OpeningState): OpeningState {
  return state.stage === 'defend' ? { ...state, stage: 'done', elapsed: 0 } : state;
}

export function openingPresentation(state: OpeningState): OpeningPresentation {
  const captions: Record<OpeningStage, string> = {
    establish: 'LX 到家了，幼崽们正等着你',
    rustle: '围栏外的草丛，传来了沙沙声…',
    approach: '两只狼错开靠近，先看清它们的路线',
    startle: '幼崽们有些害怕，需要伙伴陪着',
    choose: '选一位伙伴，和 LX 一起守住小家',
    arrival: state.guardian === 'dog' ? '刀盾狗赶来了，它会守住入口' : state.guardian === 'cat' ? '喵脆角赶来了，它会引导幼崽回家' : '奶蛙赶来了，它会安抚受惊的幼崽',
    defend: '伙伴准备好了，点一次守护试试看',
    done: '大家安全了，去认识你的幼崽吧',
  };
  const focus: Record<OpeningStage, OpeningFocus> = {
    establish: 'farm', rustle: 'bushes', approach: 'wolves', startle: 'animals',
    choose: 'guardians', arrival: 'guardian', defend: 'entrance', done: 'player',
  };
  const duration = durations[state.stage];
  const progress = duration === undefined ? 1 : Number.isFinite(state.elapsed) ? Math.max(0, Math.min(1, state.elapsed / duration)) : 0;
  return {
    stage: state.stage, progress, caption: captions[state.stage], focus: focus[state.stage], guardian: state.guardian,
    canSkip: preChoice(state.stage) || state.stage === 'arrival', requiresChoice: state.stage === 'choose',
    controlsLocked: false,
  };
}


/** Each real wolf has its own reveal and anticipation, independent of wall time. */
export function openingWolfPresentation(state:OpeningState,index:number) {
  const delay=Math.max(0,index)*1.5;
  const elapsed=state.stage==='approach'?(Number.isFinite(state.elapsed)?Math.max(0,state.elapsed):0):OPENING_DURATIONS.approach;
  const local=elapsed-delay,visible=!['establish','rustle'].includes(state.stage)&&local>=0;
  const progress=Math.max(0,Math.min(1,(local-.65)/2.35));
  const phase:'waiting'|'sniffing'|'stalking'|'holding'=!visible?'waiting':local<.65?'sniffing':progress<1?'stalking':'holding';
  return {delay,visible,progress,phase};
}
