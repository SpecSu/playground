'use client';
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { generateDanceChart, judgeDanceOffset, scoreDanceHits, danceRoundPhase, DANCE_LANES, DANCE_SUBMIT_GRACE_MS } from '@/lib/dance-machine';
import type { DanceRound } from '@/lib/dance-machine';
import { canPlayDanceRound, chooseDanceNote, danceKeyLane, expiredDanceNotes } from '@/lib/dance-input';
import './DanceMachine.css';
import DanceResultConfetti from './DanceResultConfetti';
import { DANCE_CURTAIN_CALL_MS } from '@/lib/dance-curtain-call';
import { DanceResultCelebration } from '@/lib/dance-result-celebration';
import { CLUB_AVATAR_CATALOG } from '@/lib/club-avatar-catalog';
import { resolveAvatarPreset, type AvatarPreset } from '@/lib/room-types';
import type { DanceAudioStatus } from '@/lib/dance-audio';

const ARROWS = ['←','↑','↓','→'];
const COLORS = ['#ed8cc7','#b0e98a','#79c9ff','#ffc579'];
type Hit = { noteId: number; offsetMs: number };
type Feedback = { direction: 'left'|'up'|'down'|'right'; at: number };
type Props = { getAudioStatus: () => DanceAudioStatus | null; round: DanceRound; ownId: string | null; joined: boolean; serverOffsetMs: number; ready: boolean; enabled: boolean; photo?: string; onSubmit: (roundId: string, hits: Hit[]) => Promise<boolean>; onFeedback: (feedback: Feedback) => void; onToast: (text: string) => void };

function ResultAvatar({ preset, name }: { preset?: AvatarPreset; name: string }) {
  const canonical = preset ? resolveAvatarPreset(preset) : undefined;
  const avatar = CLUB_AVATAR_CATALOG.find(item => item.id === canonical);
  return avatar?.previewImage ? <img className="dance-rank-avatar" src={avatar.previewImage} alt={`${name}的角色头像`}/> : <span className="dance-rank-avatar" role="img" aria-label={`${name}的角色头像`}>{avatar?.previewIcon ?? '👤'}</span>;
}
function ResultCrown({ rank }: { rank: number }) {
  const color = ['#ffe5a0','#dceaff','#edb38d'][rank-1];
  return <svg className="dance-crown" viewBox="0 0 36 28" role="img" aria-label={`${['金','银','铜'][rank-1]}色皇冠`}><path d="M4 7 12 13 18 3 24 13 32 7 28 23H8Z" fill={color} stroke={color} strokeLinejoin="round"/><path d="M8 25H28" stroke={color} strokeWidth="3" strokeLinecap="round"/>{[4,18,32].map((x,index)=><circle key={x} cx={x} cy={index===1?3:6} r="2" fill={color}/>)}</svg>;
}

export default function DanceMachine({ round, ownId, joined, serverOffsetMs, ready, enabled, photo, onSubmit, onFeedback, onToast, getAudioStatus }: Props) {
  const [now, setNow] = useState(() => Date.now() + serverOffsetMs);
  const [firstSeen] = useState(now);
  const [closed, setClosed] = useState(false);
  const [celebrationGate] = useState(() => new DanceResultCelebration());
  const [view, setView] = useState<{ hits: Hit[]; consumed: Set<number>; combo: number }>({ hits: [], consumed: new Set(), combo: 0 });
  const [feedback, setFeedback] = useState<{ label: string; lane: number; at: number } | null>(null);
  const [submission, setSubmission] = useState<'idle'|'sending'|'sent'|'failed'>('idle');
  const [exporting, setExporting] = useState(false);
  const [pressedLanes, setPressedLanes] = useState<number[]>([]);
  const heldButtons = useRef(new Map<string,number>());
  const buttonPulseTimers = useRef(new Map<number,ReturnType<typeof setTimeout>>());
  const setButtonPressed = useCallback((lane: number, down: boolean, token: string) => {
    if (down) heldButtons.current.set(token,lane); else heldButtons.current.delete(token);
    setPressedLanes([...new Set(heldButtons.current.values())]);
  }, []);
  const pulseButton = useCallback((lane: number) => {
    clearTimeout(buttonPulseTimers.current.get(lane));
    setButtonPressed(lane,true,`assist:${lane}`);
    buttonPulseTimers.current.set(lane,setTimeout(()=>{setButtonPressed(lane,false,`assist:${lane}`);buttonPulseTimers.current.delete(lane);},120));
  }, [setButtonPressed]);
  const consumed = useRef(new Set<number>());
  const hits = useRef<Hit[]>([]);
  const combo = useRef(0);
  const lastGestureAt = useRef(0);
  const didSubmit = useRef(false);
  const resultPanel = useRef<HTMLElement>(null);
  const chart = useMemo(() => generateDanceChart(round.seed, round.version), [round.seed, round.version]);
  const audioStatus = getAudioStatus();
  const phase = danceRoundPhase(round, audioStatus?.elapsedMs != null && (audioStatus.ready || audioStatus.ranked) ? round.startsAt + audioStatus.elapsedMs : now);
  const resultsReady = phase === 'results' && now >= round.endsAt + DANCE_CURTAIN_CALL_MS;
  const ownEntry = round.roster.find(entry => entry.id === ownId);
  const playable = canPlayDanceRound(joined, Boolean(ownEntry && !ownEntry.isNpc), firstSeen, round.startsAt);
  const elapsed = audioStatus?.elapsedMs ?? now - round.startsAt;
  const localScore = useMemo(() => scoreDanceHits(chart, view.hits), [chart, view.hits]);
  const ownResult = round.results.find(result => result.actorId === ownId);
  const sortedResults = [...round.results].sort((a,b) => b.score-a.score || b.maxCombo-a.maxCombo || a.submittedAt-b.submittedAt);
  const score = ownResult ?? (playable ? localScore : null);
  const ownRank = ownResult ? sortedResults.findIndex(result => result.actorId === ownId) + 1 : null;
  const podium = sortedResults.slice(0,3);
  const resultStatus = ownResult ? '已同步 · 本局成绩' : !playable ? '本局观战' : !audioStatus?.ranked ? '本局不计分' : now >= round.endsAt + DANCE_SUBMIT_GRACE_MS ? '本机成绩 · 上传已截止' : submission === 'failed' ? '上传失败 · 可重试' : '本机成绩 · 同步中';


  useEffect(() => {
    let frame = 0;
    const tick = () => { setNow(Date.now() + serverOffsetMs); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [serverOffsetMs]);

  useEffect(() => {
    if (!playable || phase === 'countdown') return;
    const missed = expiredDanceNotes(chart, consumed.current, elapsed);
    if (!missed.length) return;
    missed.forEach(note => consumed.current.add(note.id));
    combo.current = 0;
    setFeedback({ label: 'MISS', lane: missed.at(-1)!.lane, at: now });
    setView({ hits: [...hits.current], consumed: new Set(consumed.current), combo: combo.current });
  }, [chart, elapsed, now, phase, playable]);

  const submit = useCallback(async () => {
    if (!playable || !getAudioStatus()?.ranked || !ready || didSubmit.current || Date.now()+serverOffsetMs < round.endsAt) return;
    didSubmit.current = true;
    setSubmission('sending');
    const accepted = await onSubmit(round.id, [...hits.current]);
    setSubmission(accepted ? 'sent' : 'failed');
    if (!accepted) didSubmit.current = false;
  }, [getAudioStatus, onSubmit, playable, ready, round.endsAt, round.id, serverOffsetMs]);
  const wallEndReached = now >= round.endsAt;
  useEffect(() => { if (phase === 'results' && wallEndReached && submission === 'idle' && ready) void submit(); }, [phase, ready, submission, submit, wallEndReached]);

  const press = useCallback((lane: number) => {
    const status = getAudioStatus();
    if (!status?.ready || !status.ranked || status.elapsedMs === null) return;
    const time = round.startsAt + status.elapsedMs;
    if (!enabled || !ready || !playable || time < round.startsAt || time >= round.endsAt || document.visibilityState !== 'visible') return;
    // Avatar motion follows actual input, independently of chart judgment.
    const gestureAt = Math.max(Date.now()+serverOffsetMs,lastGestureAt.current+.001);
    lastGestureAt.current = gestureAt;
    onFeedback({ direction: DANCE_LANES[lane], at: gestureAt });
    const note = chooseDanceNote(chart, consumed.current, lane, time-round.startsAt);
    if (!note) return;
    const offsetMs = Math.round(time-round.startsAt-note.atMs);
    const judgment = judgeDanceOffset(offsetMs);
    consumed.current.add(note.id);
    hits.current.push({ noteId: note.id, offsetMs });
    combo.current = judgment === 'bad' || judgment === 'miss' ? 0 : combo.current+1;
    setFeedback({ label: judgment.toUpperCase(), lane, at: time });
    setView({ hits: [...hits.current], consumed: new Set(consumed.current), combo: combo.current });
  }, [chart, enabled, getAudioStatus, onFeedback, playable, ready, round.endsAt, round.startsAt, serverOffsetMs]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      const typing = target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"]'));
      const lane = danceKeyLane(event.key, event.repeat || event.isComposing, typing);
      if (lane === null || !enabled || !playable || phase !== 'playing') return;
      event.preventDefault(); setButtonPressed(lane,true,`key:${event.key}`); press(lane);
    };
    const keyup = (event: KeyboardEvent) => { const lane=danceKeyLane(event.key,false,false); if(lane!==null)setButtonPressed(lane,false,`key:${event.key}`); };
    const clear = () => { buttonPulseTimers.current.forEach(timer=>clearTimeout(timer));buttonPulseTimers.current.clear();heldButtons.current.clear(); setPressedLanes([]); };
    const visibility = () => { if(document.visibilityState!=='visible')clear(); };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup',keyup); window.addEventListener('blur',clear);document.addEventListener('visibilitychange',visibility);
    return () => { window.removeEventListener('keydown',keydown); window.removeEventListener('keyup',keyup); window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility);clear(); };
  }, [enabled, phase, playable, press, setButtonPressed]);

  useEffect(() => {
    if (!resultsReady || closed || firstSeen > round.endsAt) return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => resultPanel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }), 0);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setClosed(true); }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(resultPanel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (!buttons.length) return;
      if (event.shiftKey && (document.activeElement === buttons[0] || !resultPanel.current?.contains(document.activeElement))) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && (document.activeElement === buttons.at(-1) || !resultPanel.current?.contains(document.activeElement))) { event.preventDefault(); buttons[0]?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', key); if (previous?.isConnected && !previous.closest('[inert],[hidden]')) previous.focus({preventScroll:true}); };
  }, [closed, firstSeen, resultsReady, round.endsAt]);

  const makePhoto = async (): Promise<Blob> => {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 1440;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('无法创建图片');
    ctx.fillStyle='#070b13';ctx.fillRect(0,0,900,1440);
    ctx.fillStyle='#111b2b';ctx.fillRect(28,28,844,1384);
    const text=(value:string,x:number,y:number,size:number,color='#eef3ff',weight='500')=>{ctx.fillStyle=color;ctx.font=`${weight} ${size}px sans-serif`;ctx.fillText(value,x,y);};
    if(photo){try{const image=new Image();image.src=photo;await image.decode();ctx.save();ctx.globalAlpha=.08;ctx.drawImage(image,28,28,844,150);ctx.restore();}catch{/* Optional scene capture. */}}
    const portrait=async(preset:AvatarPreset|undefined,x:number,y:number,size:number)=>{
      const canonical=preset ? resolveAvatarPreset(preset) : undefined;
      const avatar=CLUB_AVATAR_CATALOG.find(item=>item.id===canonical);
      ctx.save();ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.clip();ctx.fillStyle='#293549';ctx.fillRect(x,y,size,size);
      let drawn=false;if(avatar?.previewImage){try{const image=new Image();image.src=avatar.previewImage;await image.decode();ctx.drawImage(image,x,y,size,size);drawn=true;}catch{/* Picker icon remains a truthful preset fallback. */}}
      if(!drawn){ctx.textAlign='center';text(avatar?.previewIcon??'👤',x+size/2,y+size*.73,size*.58);ctx.textAlign='left';}ctx.restore();
    };
    const row=async(result:typeof sortedResults[number],rank:number,y:number)=>{
      const member=round.roster.find(entry=>entry.id===result.actorId),mine=result.actorId===ownId;
      if(mine){ctx.fillStyle='#20382f';ctx.fillRect(58,y-38,784,72);}
      text(String(rank).padStart(2,'0'),74,y+7,23,'#8da0bf');await portrait(member?.preset,125,y-29,58);
      text(`${(member?.name??'舞者').slice(0,12)}${mine?' · 我':''}`,203,y+7,25);ctx.textAlign='right';text(result.score.toLocaleString(),821,y+7,29,mine?'#c4f596':'#eef3ff','600');ctx.textAlign='left';
    };
    text('AFTERHOURS / DANCE MACHINE',63,80,17,'#8c9dbb');text('本场高光',63,141,47,'#eef3ff','700');
    ARROWS.forEach((arrow,index)=>text(arrow,655+index*43,137,37,COLORS[index],'700'));
    text(`${Math.round((round.endsAt-round.startsAt)/1000)} 秒 · ${round.roster.length} 人 · ${resultStatus}`,63,179,19,'#95a8c5');
    for(const [index,result] of podium.entries()){
      const entry=round.roster.find(member=>member.id===result.actorId),center=[450,191,709][index],size=index===0?162:140,y=index===0?235:260;
      await portrait(entry?.preset,center-size/2,y,size);
      const metal=['#ffe5a0','#dceaff','#edb38d'][index];ctx.fillStyle=metal;ctx.beginPath();ctx.moveTo(center-31,y-14);ctx.lineTo(center-21,y+9);ctx.lineTo(center+21,y+9);ctx.lineTo(center+31,y-14);ctx.lineTo(center+12,y-5);ctx.lineTo(center,y-29);ctx.lineTo(center-12,y-5);ctx.closePath();ctx.fill();
      ctx.textAlign='center';text(String(index+1),center+size/2-6,y+size-4,24,metal,'700');text(`${(entry?.name??'舞者').slice(0,10)}${result.actorId===ownId?' · 我':''}`,center,443,26);text(result.score.toLocaleString(),center,484,index===0?42:36,index===0?'#c4f596':'#eef3ff','700');ctx.textAlign='left';
    }
    if(!podium.length)text(now<round.endsAt+DANCE_SUBMIT_GRACE_MS?'等待本局成绩同步':'本局暂无完成成绩',260,370,25,'#95a8c5');
    text('本场排名   TOP 8',65,545,25,'#c7d4e9');
    for(const [index,result] of sortedResults.slice(3,8).entries())await row(result,index+4,605+index*84);
    if(sortedResults.length<4)text(now<round.endsAt+DANCE_SUBMIT_GRACE_MS?'等待其他舞者上传成绩…':'本局暂无更多完成成绩',250,745,23,'#8d9ebc');
    if(ownRank&&ownRank>8&&ownResult)await row(ownResult,ownRank,1060);
    else {ctx.textAlign='center';text(ownResult?'每一拍，都有人与你同频。':`${resultStatus}${score?` · ${score.score.toLocaleString()} 分`:''}`,450,1067,22,'#9bacc5');ctx.textAlign='left';}
    const stats=[['我的准确率',score?`${((score.counts.cool+score.counts.good)/chart.length*100).toFixed(1)}%`:'—'],['最高连击',String(score?.maxCombo??'—')],['COOL / GOOD',score?`${score.counts.cool} / ${score.counts.good}`:'—']];
    stats.forEach(([label,value],index)=>{ctx.textAlign='center';text(label,185+index*265,1160,20,'#8d9ebc');text(value,185+index*265,1215,40,'#eef3ff','600');ctx.textAlign='left';});
    text('这一拍，我们同频。',63,1338,25,'#b6c5de');ctx.textAlign='right';text(new Date(round.endsAt).toLocaleDateString('zh-CN'),830,1338,19,'#8293ad');ctx.textAlign='left';
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('导出失败')),'image/png'));
  };
  const exportPhoto = async (share: boolean) => {
    if(exporting) return;setExporting(true);
    try {
      const blob=await makePhoto();const file=new File([blob],`afterhours-${round.id}.png`,{type:'image/png'});
      if(share && navigator.canShare?.({files:[file]}) && navigator.share) await navigator.share({files:[file],title:'我的 AFTERHOURS 跳舞机成绩'});
      else {const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);onToast(share?'当前浏览器不支持图片分享，已下载成绩照片。':'成绩照片已导出为 PNG。');}
    } catch(error) {if(!(error instanceof DOMException && error.name==='AbortError'))onToast('图片暂时未能导出，请再试一次。');}
    finally {setExporting(false);}
  };

  if (closed || (phase === 'results' && firstSeen > round.endsAt)) return null;
  if (phase === 'results' && !resultsReady) return <section className="dance-curtain-indicator" aria-label="本局谢幕"><span>这一拍，我们同频。</span><small>谢幕中 · 成绩即将揭晓</small></section>;
  if (resultsReady) return <><div className="dance-result-backdrop"><section ref={resultPanel} className="dance-result-layer" role="dialog" aria-label="跳舞机本局成绩" aria-modal="true">
    <button className="dance-result-close" onClick={()=>setClosed(true)} aria-label="关闭成绩，返回舞池"><X size={19}/></button>
    <div className="dance-result-board">
      <header className="dance-result-header"><span>AFTERHOURS / DANCE MACHINE</span><h2>本场高光</h2><p>{Math.round((round.endsAt-round.startsAt)/1000)} 秒 · {round.roster.length} 人 · {resultStatus}</p><div className="dance-result-arrows" aria-hidden="true">{ARROWS.map((arrow,index)=><i key={arrow} style={{color:COLORS[index]}}>{arrow}</i>)}</div></header>
      <div className="dance-podium" aria-label="本局前三名">{podium.map((result,index)=>{const entry=round.roster.find(member=>member.id===result.actorId);return <div key={result.actorId} className={`dance-podium-place place-${index+1}`} aria-label={`第 ${index+1} 名 ${entry?.name??'舞者'} ${result.score} 分`}><div className="dance-portrait-wrap"><ResultAvatar preset={entry?.preset} name={entry?.name??'舞者'}/><ResultCrown rank={index+1}/><span className="dance-rank-medal">{index+1}</span></div><b title={entry?.name}>{entry?.name??'舞者'}{result.actorId===ownId&&<em>我</em>}</b><strong>{result.score.toLocaleString()}</strong></div>;})}{!podium.length&&<p className="dance-podium-empty">{now<round.endsAt+DANCE_SUBMIT_GRACE_MS?'等待本局成绩同步':'本局暂无完成成绩'}</p>}</div>
      <h3 className="dance-section-label">本场排名 <span>TOP 8</span><small>得分</small></h3>
      <div className="dance-ranking" aria-label="第 4 至第 8 名">{sortedResults.slice(3,8).map((result,index)=>{const entry=round.roster.find(member=>member.id===result.actorId);return <div key={result.actorId} className={result.actorId===ownId?'mine':''}><span>{String(index+4).padStart(2,'0')}</span><ResultAvatar preset={entry?.preset} name={entry?.name??'舞者'}/><b title={entry?.name}>{entry?.name??'舞者'}</b>{result.actorId===ownId&&<em>我</em>}<strong>{result.score.toLocaleString()}</strong></div>;})}{sortedResults.length<4&&<p>{now<round.endsAt+DANCE_SUBMIT_GRACE_MS?'等待其他舞者上传成绩…':'本局暂无更多完成成绩'}</p>}</div>
      <div className="dance-own-slot">{ownRank && ownRank>8 ? <div className="dance-outside-rank"><span>{String(ownRank).padStart(2,'0')}</span><ResultAvatar preset={ownEntry?.preset} name={ownEntry?.name??'我'}/><b title={ownEntry?.name}>{ownEntry?.name??'我'}</b><em>我</em><strong>{ownResult!.score.toLocaleString()}</strong></div> : <p>{ownResult?'每一拍，都有人与你同频。':`${resultStatus}${score?` · ${score.score.toLocaleString()} 分`:''}`}</p>}</div>
      <div className="dance-stats" aria-label="我的本场表现"><div><span>我的准确率</span><b>{score?((score.counts.cool+score.counts.good)/chart.length*100).toFixed(1):'—'}<small>%</small></b></div><div><span>最高连击</span><b>{score?.maxCombo??'—'}</b></div><div><span>COOL / GOOD</span><b>{score?.counts.cool??'—'} <small>/ {score?.counts.good??'—'}</small></b></div></div>
    </div>
    <div className="dance-result-actions"><button disabled={exporting} onClick={()=>void exportPhoto(false)}><Download size={15}/>保存图片</button><button disabled={exporting} onClick={()=>void exportPhoto(true)}><Share2 size={15}/>分享成绩</button></div>
    <div className="dance-result-links">{submission==='failed'&&now<round.endsAt+DANCE_SUBMIT_GRACE_MS&&<button onClick={()=>void submit()}>重试上传成绩</button>}<button onClick={()=>setClosed(true)}>回到现场</button></div>
  </section></div><DanceResultConfetti roundId={round.id} visible={enabled} celebration={celebrationGate}/></>;
  return <section className="dance-round" aria-label="跳舞机">
    <div className="dance-round-meta"><div><strong>跳舞机</strong><small>{playable?'跟着节拍，一起跳':'本局观战 · 下一局一起玩'}</small></div><div className="dance-time"><b>{Math.max(0,Math.ceil((round.endsAt-Math.max(now,round.startsAt))/1000))}</b><span>秒</span></div></div>
    <div className="dance-score"><small>SCORE</small><strong>{playable?localScore.score.toLocaleString():'—'}</strong><span>{round.roster.length} 人同场</span></div>
    <div className={`dance-feedback ${feedback&&now-feedback.at<650?'visible':''} ${feedback?.label==='COOL'?'cool-impact':''}`} key={feedback?.at}><strong className={`judgment-${feedback?.label.toLowerCase()}`}>{feedback?.label??'READY'}</strong><div><b>{view.combo}</b> COMBO</div></div>
    <div className="dance-track"><div className="dance-lanes">{ARROWS.map((arrow,lane)=><div key={arrow} style={{'--lane':COLORS[lane]} as CSSProperties}/>)}</div><div className="dance-notes">{chart.filter(note=>!view.consumed.has(note.id)&&note.atMs-elapsed<1900&&note.atMs-elapsed>-220).map(note=><span key={note.id} className="dance-note" style={{left:`${note.lane*25}%`,top:`${82-(note.atMs-elapsed)/1900*82}%`,color:COLORS[note.lane]}}>{ARROWS[note.lane]}</span>)}</div><div key={`line-${feedback?.at}`} className={`dance-judge-line ${feedback?.label==='COOL'&&now-feedback.at<320?'cool-punch':''}`}><span>HIT ZONE</span></div>{feedback?.label==='COOL'&&now-feedback.at<320&&<div key={`burst-${feedback.at}`} className="dance-cool-burst" aria-hidden="true" style={{left:`${12.5+feedback.lane*25}%`,'--lane':COLORS[feedback.lane]} as CSSProperties}><span/>{[0,45,90,135,180,225,270,315].map(angle=><i key={angle} style={{'--angle':`${angle}deg`} as CSSProperties}/>)}</div>}<div className="dance-targets">{ARROWS.map((arrow,lane)=><span key={arrow} style={{'--lane':COLORS[lane]} as CSSProperties} className={feedback?.label!=='MISS'&&feedback?.lane===lane&&now-feedback.at<180?'flash':''}>{arrow}</span>)}</div></div>
    <div className="dance-keys" role="group" aria-label="节拍方向键">{ARROWS.map((arrow,lane)=><button key={arrow} style={{'--lane':COLORS[lane]} as CSSProperties} className={pressedLanes.includes(lane)?'pressed':''} disabled={!playable||phase!=='playing'||!ready||!enabled||!audioStatus?.ranked} aria-label={['左','上','下','右'][lane]} onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);setButtonPressed(lane,true,`pointer:${event.pointerId}`);press(lane);}} onPointerUp={event=>setButtonPressed(lane,false,`pointer:${event.pointerId}`)} onPointerCancel={event=>setButtonPressed(lane,false,`pointer:${event.pointerId}`)} onLostPointerCapture={event=>setButtonPressed(lane,false,`pointer:${event.pointerId}`)} onClick={event=>{if(event.detail===0){pulseButton(lane);press(lane);}}}>{arrow}</button>)}</div>
    <p className="dance-round-hint">{!ready?'连接恢复后继续':playable&&!audioStatus?.ranked?(phase==='countdown'?'请开启声音，准备跟上节拍':'音频未就绪或已中断 · 本局不计分'):playable?'点按方向键 · 箭头抵达亮线时击中':'这局已经开始，下一局等你加入'}</p>
    {phase==='countdown'&&<div className="dance-countdown"><span>准备好了吗</span><strong>{Math.max(1,Math.ceil((round.startsAt-now)/1000))}</strong><p>{playable?'箭头抵达亮线时，按下同方向键':'加入舞池，下一拍就位'}</p></div>}
  </section>;
}
