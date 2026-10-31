import {Component,type ReactNode} from 'react';
export class FarmBoundary extends Component<{children:ReactNode},{error:string}>{
 state={error:''};
 static getDerivedStateFromError(error:Error){return {error:error.message||'页面启动失败'};}
 componentDidCatch(error:Error){console.error('Farm render failed',error.message);}
 render(){if(this.state.error)return <main style={{padding:40,fontFamily:'system-ui',color:'#50654a'}}><h1>绒绒世界</h1><p>页面没有成功启动，请刷新重试。</p><pre style={{whiteSpace:'pre-wrap'}}>{this.state.error}</pre><button onClick={()=>location.reload()}>重新打开</button></main>;return this.props.children;}
}
