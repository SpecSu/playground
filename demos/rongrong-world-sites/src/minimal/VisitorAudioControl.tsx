import {Music2,VolumeX} from 'lucide-react';
import type {FarmAudioStatus} from '../v5/estate-audio.ts';
import './visitor-audio.css';

export function VisitorAudioControl({enabled,status,volume,onToggle,onUnlock}:{enabled:boolean;status:FarmAudioStatus;volume:number;onToggle:()=>void;onUnlock:()=>void}){
 const waiting=enabled&&volume>0&&status==='awaiting-gesture';
 const title=status==='unavailable'?'当前浏览器暂不支持声音':volume===0?'音量为零，可回家在设置中调整':waiting?'点一下听音乐':enabled?'关闭音乐与环境声':'开启音乐与环境声';
 return <button type="button" className="visitor-audio-control" data-audio-toggle data-audio-status={status} aria-label="好友牧场音乐" aria-pressed={enabled} title={title} disabled={status==='unavailable'} onClick={waiting?onUnlock:onToggle}>
  {enabled&&status!=='muted'?<Music2 size={18} aria-hidden="true"/>:<VolumeX size={18} aria-hidden="true"/>}<span>{status==='unavailable'?'声音不可用':waiting?'听音乐':enabled&&volume>0?'音乐':'静音'}</span>
 </button>;
}
