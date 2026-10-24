'use client';
import ItemThumb from './ItemThumb';
import{tankManagementRows}from'../../lib/game/tank-management.js';
import{SPECIES_BY_ID}from'../../lib/game/catalogue.js';
export default function TankManager({game,own,onAction,onObserve,workingIds=[],money}:{game:any;own:boolean;onAction:(id:string,action:string)=>void;onObserve:(id:string)=>void;workingIds?:string[];money:(value:number)=>React.ReactNode}){
 const rows=tankManagementRows(game,own);
 return <div className="tank-list" aria-label="鱼缸鱼类管理">{rows.map((item:any,index:number)=>{const inside=item.location.kind==='tank',mutation=item.mutation==='gold'?'金色':item.mutation==='giant'?'巨型':'',name=SPECIES_BY_ID[item.speciesId]?.name??item.speciesId;return <div className={`tank-row ${inside?'tank-row-inside':''} ${!inside&&(index===0||rows[index-1].location.kind==='tank')?'tank-bag-start':''}`} key={item.id} data-item-id={item.id}>
 <button className="tank-row-thumb" aria-label={`${name}${inside?'，观察':''}`} onClick={()=>{if(inside)onObserve(item.id);}}><ItemThumb item={item} fit/></button>
 <div className="tank-row-copy"><b title={name}>{name}</b><small>{mutation&&<span>{mutation} · </span>}{item.finalSize.toFixed(1)}cm{item.location.kind==='hand'?' · 手持':!inside?' · 背包':''}</small></div>
 {own&&<div className="tank-row-actions"><button className={inside?'tank-retrieve':'tank-display'} disabled={workingIds.includes(item.id)} aria-label={`${inside?'收回':'展示'}${mutation}${name}`} onClick={()=>onAction(item.id,inside?'bag':'display')}>{inside?'收回':'展示'}</button><button disabled={workingIds.includes(item.id)} aria-label={`卖出${mutation}${name}，${item.value}金币`} onClick={()=>onAction(item.id,'sell')}><span>卖出</span>{money(item.value)}</button></div>}
 </div>;})}{!rows.length&&<p className="empty">{own?'收获一条鱼后，就可以放进来了':'鱼缸里还没有鱼'}</p>}</div>;
}
