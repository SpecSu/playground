import {PanelHelp} from './PanelHelp.tsx';
import './ambient-sound-controls.css';
export type AmbientSoundControlsProps={volume:number;onVolumeChange:(value:number)=>void;reducedMotion:boolean;onReducedMotionChange:(value:boolean)=>void};
/** Small controlled settings, deliberately independent of an audio device or saved game. */
export default function AmbientSoundControls({volume,onVolumeChange,reducedMotion,onReducedMotionChange}:AmbientSoundControlsProps){
 const value=Math.max(0,Math.min(1,Number.isFinite(volume)?volume:0));
 return <div className="egg-atmosphere-controls">
  <div className="egg-atmosphere-heading"><b>声音与动态</b><PanelHelp title="声音与动态说明"><p>音乐、雨声、风声和近处流水声一起调节；静音开关会关闭全部声音。</p><p>首次操作后播放，切到后台自动暂停。减少天气动态会降低飘落粒子并关闭雨点涟漪和闪光，不改变天气规则或环境声。</p></PanelHelp></div>
  <label className="egg-atmosphere-volume"><span>总音量 <output>{Math.round(value*100)}%</output></span><input data-audio-toggle aria-label="牧场总音量" type="range" min="0" max="1" step="0.05" value={value} onChange={event=>onVolumeChange(Number(event.currentTarget.value))}/></label>
  <button className="egg-atmosphere-motion" type="button" aria-pressed={reducedMotion} onClick={()=>onReducedMotionChange(!reducedMotion)}>减少天气动态 · {reducedMotion?'开':'关'}</button>
 </div>;
}
