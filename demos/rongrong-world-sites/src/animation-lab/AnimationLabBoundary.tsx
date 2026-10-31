import {Component,type ReactNode} from 'react';
import PhoneViewport from '../feed/PhoneViewport.tsx';

/** Keep chunk/render failures in the isolated lab, without loading the farm. */
export class AnimationLabBoundary extends Component<{children:ReactNode},{error:string|null}>{
 state:{error:string|null}={error:null};
 static getDerivedStateFromError(error:Error){return {error:error.message||'动作预览暂时无法启动'};}
 componentDidCatch(error:Error){console.error('Animation lab render failed',error.message);}
 render(){
  if(this.state.error===null)return this.props.children;
  const returnURL=new URL(window.location.href);returnURL.searchParams.delete('animationLab');
  return <main className="app-shell animation-lab-shell"><PhoneViewport><section className="animation-lab" aria-label="动物动作预览">
   <header className="lab-header"><div className="lab-title-row"><h1>动作预览</h1><a aria-label="返回牧场" href={`${returnURL.pathname}${returnURL.search}${returnURL.hash}`}>返回牧场</a></div><p className="lab-prototype">临时模型 · Blender 骨骼动画</p></header>
   <div className="lab-stage"><div className="lab-stage-message"><p role="alert">动作预览暂未载入：{this.state.error}</p><button type="button" aria-label="重新载入动作预览" onClick={()=>window.location.reload()}>重新载入动作预览</button></div></div>
  </section></PhoneViewport></main>;
 }
}
