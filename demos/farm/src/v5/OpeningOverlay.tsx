import { openingPresentation, type OpeningState } from './opening.ts';
import type { GuardianKind } from './threat.ts';

export interface OpeningOverlayProps {
  opening: OpeningState; ready: boolean; replay: boolean; busy: boolean; error?: string;
  retreating?:boolean;onSkip: () => void; onSelect: (kind: GuardianKind) => void; onDefend: () => void;
  onExitReplay: () => void; onCare: () => void; onRetry?: () => void; onReset?: () => void;
}

const guardians: { kind: GuardianKind; name: string; asset: string; ability: string }[] = [
  { kind: 'dog', name: '刀盾狗', asset: 'sword-shield-dog', ability: '守住入口，拖住靠近的一只狼。' },
  { kind: 'cat', name: '喵脆角', asset: 'miaocuijiao', ability: '引导幼崽，沿着安全路线回家。' },
  { kind: 'frog', name: '奶蛙', asset: 'milk-frog', ability: '安抚大家，让受惊的幼崽镇定下来。' },
];
const defenseLabel: Record<GuardianKind, string> = { dog: '守住入口', cat: '引导幼崽', frog: '安抚大家' };

/** Fits the existing Feed; asset readiness and all world mutations stay outside. */
export default function OpeningOverlay(props: OpeningOverlayProps) {
  const { opening, ready, replay, busy, error, onSkip, onSelect, onDefend, onExitReplay, onCare, onRetry } = props;
  const presentation = openingPresentation(opening);
  const defending = opening.stage === 'defend'&&!props.retreating;
  const blocked = busy || !ready || !!error;
  const caption = props.retreating ? '狼正在退走，等幼崽们放松下来…' : ready ? presentation.caption : presentation.canSkip ? '正在准备伙伴与场景，可以先跳过动画' : '正在准备伙伴与场景，稍等就能继续';
  return <section
    className={`opening-overlay ${defending ? 'opening-overlay--defend' : 'opening-overlay--blocking'}${replay ? ' opening-overlay--replay' : ''}`}
    data-opening-stage={opening.stage}
    aria-label={replay ? '独立开场演示' : '第一次回家'}
    aria-busy={!ready || busy}
  >
    <div className="opening-tools">
      <span className="opening-label">{replay ? '独立开场演示 · 不改存档' : '第一次回家'}</span>
      <div className="opening-tool-buttons">
        {presentation.canSkip && <button type="button" className="opening-skip" data-opening-action="skip" disabled={busy} onClick={onSkip}>跳过动画</button>}
        {!replay && props.onReset && <button type="button" data-opening-action="reset" disabled={busy||!!error} onClick={props.onReset}>重新开始</button>}
        {replay && <button type="button" className="opening-exit" onClick={onExitReplay}>退出演示</button>}
      </div>
    </div>

    {opening.stage === 'choose' ? <div className="opening-choice-sheet" role="dialog" aria-modal="true" aria-label="选择守护伙伴">
      <div className="opening-sheet-handle" aria-hidden="true"/>
      <h2>谁来守护小家？</h2>
      <p className="opening-choice-note">选择期间，危险暂停。三位都能陪你守住第一次小家。</p>
      {!ready && <p className="opening-loading" role="status">{caption}</p>}
      <div className="opening-choices">{guardians.map(guardian => <button
        type="button" key={guardian.kind} data-opening-guardian={guardian.kind}
        className="opening-choice" disabled={blocked}
        aria-label={`选择${guardian.name}`} onClick={() => onSelect(guardian.kind)}
      >
        <img src={`/avatars/portraits/${guardian.asset}.webp`} width="48" height="48" alt=""/>
        <span><b>{guardian.name}</b><small>{guardian.ability}</small></span>
        <span className="opening-choice-arrow" aria-hidden="true">›</span>
      </button>)}</div>
    </div> : <div className={`opening-caption${defending || opening.stage === 'done' ? ' opening-caption--action' : ''}`}>
      <p key={opening.stage} role="status" aria-live="polite">{caption}</p>
      {defending && <button type="button" className="opening-primary" data-opening-action="defend" disabled={blocked} onClick={onDefend}>{opening.guardian ? defenseLabel[opening.guardian] : '一起守护'}</button>}
      {opening.stage === 'done' && (replay
        ? <button type="button" className="opening-primary" onClick={onExitReplay}>退出演示</button>
        : <button type="button" className="opening-primary" data-opening-action="care" disabled={busy || !!error} onClick={onCare}>喂第一口</button>)}
    </div>}

    {error && <div className="opening-error" role="alert">
      <p>{error}</p>
      {onRetry && <button type="button" disabled={busy} onClick={onRetry}>重试保存</button>}
    </div>}
  </section>;
}
