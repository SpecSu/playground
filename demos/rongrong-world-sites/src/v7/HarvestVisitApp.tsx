import PhoneViewport from '../feed/PhoneViewport.tsx';
import HarvestPanel from './HarvestPanel.tsx';
export default function HarvestVisitApp(){
 const token=new URLSearchParams(location.search).get('harvest')??undefined;
 const home=()=>location.assign('/');
 return <main className="app-shell"><PhoneViewport><section style={{width:390,height:844,overflowY:'auto',boxSizing:'border-box',padding:'28px 20px',background:'#f5efdf',color:'#354638'}} data-harvest-visit><h2>本机访客采收</h2><p>这是另一个设备开放的分享页。这里不播放、推进或跳过你自己庄园的开场剧情。</p>{token?<HarvestPanel token={token} onDone={home}/>:<p>分享地址缺少采收凭据，请向主人取得同服务的新链接。</p>}<button onClick={home}>管理我自己的庄园</button></section></PhoneViewport></main>;
}
