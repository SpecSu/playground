import {matchBuildingIdeas,ownedBlueprintForSample,getBlueprint} from './blueprints.js';
import {compatibleRemixSamples,reusablePersonalVariety} from './state.js';
import {CREATIVE_SAMPLES,matchIdeas} from './catalogue.js';
/** Commit only the latest fully loaded choice; failed loads never replace the visible avatar. */
export function createSelectionLoader(){
 let revision=0;
 return {cancel(){revision++;},async select(load,commit){const token=++revision;let ready=false;try{ready=await load();}catch{}if(token!==revision)return {ok:false,stale:true};if(!ready)return {ok:false};commit();return {ok:true};}};
}
/** Hold the existing DOM/layout while a finger is playing the world object. */
export function plantGesturePhase(ui,phase,plantId){
 if(phase==='start')return {...ui,activePlantGesture:plantId};
 if(ui.activePlantGesture!==plantId)return ui;
 if(phase==='end')return {...ui,activePlantGesture:null,panel:null,selection:{kind:'plant',id:plantId}};
 if(phase==='cancel')return {...ui,activePlantGesture:null};
 return ui;
}
export function preparePlantContact(ui,phase,id,plants){
 let next=plantGesturePhase(ui,phase,id);const plant=plants.find(p=>p.id===id);
 if(!plant&&next.selection?.kind==='plant'&&next.selection.id===id)next={...next,selection:null};
 return {ui:next,plant};
}

/** A contextual route fixes the parent; the dock route always starts an original idea. */
export const newCreation=(path='invent',parentId=null)=>({path,parentId:path==='remix'?parentId:null,idea:'',error:'',reuseId:null});
export function resolveCreationIdea(state,creation,idea){
 const allowed=creation.path==='remix'?compatibleRemixSamples(state,creation.parentId):CREATIVE_SAMPLES;
 const value=String(idea??'').trim(),sample=matchIdeas(value).find(s=>allowed.some(a=>a.id===s.id))??null;
 if(!sample)return {sample:null,reuseId:null,error:value?'这个想法还不在离线样例里，未消耗水晶。':'先写下一点想法，未消耗水晶。'};
 return {sample,reuseId:reusablePersonalVariety(state,sample.id)?.id??null,error:''};
}

export const newBlueprintCreation=(parentId=null)=>({parentId,idea:'',error:'',reuseId:null,lastExampleId:null});
export function resolveBlueprintIdea(state,c,idea){if(!String(idea??'').trim())return {sample:null,reuseId:null,error:'先写个想法，或点🎲摇一句；未消耗水晶。'};const sample=matchBuildingIdeas(idea)[0]??null;if(!sample)return {sample:null,reuseId:null,error:'这个想法还不在离线建筑样例里，未消耗水晶。'};const parent=c.parentId?getBlueprint(state,c.parentId):null;if(parent?.sampleId===sample.id)return {sample:null,reuseId:null,error:'它已经是这个样子啦，未消耗水晶。'};return {sample,reuseId:ownedBlueprintForSample(state,sample.id)?.id??null,error:''};}

export const BUILDING_EXAMPLES=Object.freeze([
 {sampleId:'jiji_nocturne_manor',text:'把暗红玻璃和铁艺变成精致的哥特宅'},
 {sampleId:'black_silk_spider',text:'把黑蜘蛛变成一座轻盈织影雕塑'},
 {sampleId:'bear_fold_gallery',text:'把折环和短绒变成当代潮玩馆'},
 {sampleId:'bear_loop_rest',text:'把软胶变成回环绒座'},
 {sampleId:'lx_titanium_courtyard',text:'把钛金属曲面变成未来研究宅'},
 {sampleId:'lx_silent_wing',text:'把银色机翼变成一艘静翼穿梭艇'},
 {sampleId:'lx_nanofabricator',text:'把纳米设备变成一方精密实验台'},
 {sampleId:'lamy_memory_column',text:'把女友送的 LAMY 钢笔立成一座细长灯塔'},
 {sampleId:'airforce_memory_house',text:'把 Roadster Rocket 变成能贴地升起的小跑车'},
 {sampleId:'fluffy_cat_cottage',text:'把暖白色长毛猫变成舒展的绒云曲廊'},
 {sampleId:'xt50_memory_camera',text:'把富士 X-T50 相机折成收藏光线的瞬间镜馆'},
 {sampleId:'scallop_shell_house',text:'把扇贝的放射纹舒展成潮汐扇屋'},
 {sampleId:'camping_tarp_pavilion',text:'把露营天幕与营灯搭成风停营地'},
 {sampleId:'anime_collectors_cottage',text:'把漫画和游戏收藏变成二次元小屋'},
 {sampleId:'plush_designer_workshop',text:'把玩偶和布料变成缝纫设计工坊'},
 {sampleId:'lx_command_workshop',text:'把电子电路和雷达变成指挥工坊'},
 {sampleId:'lx_circuit_gym',text:'把运动跑道变成一座训练馆'},
 {sampleId:'calico_reading_den',text:'把三花猫变成一座会呼噜的书屋'},
 {sampleId:'camping_dog_workshop',text:'用狗狗和露营帐篷造一个小工坊'},
 {sampleId:'portrait_rehearsal_pavilion',text:'把朋友的眼镜和围巾变成钢琴排练亭'},
]);
export function rollBuildingExample(state,creation,random=Math.random){const parent=creation.parentId?getBlueprint(state,creation.parentId):null,options=BUILDING_EXAMPLES.filter(e=>e.sampleId!==parent?.sampleId&&e.sampleId!==creation.lastExampleId),index=Math.max(0,Math.min(options.length-1,Math.floor((Number(random())||0)*options.length))),example=options[index];return {...creation,idea:example.text,lastExampleId:example.sampleId,error:'',reuseId:null};}

export function rollPlantExample(state,creation,random=Math.random){const allowed=creation.path==='remix'?compatibleRemixSamples(state,creation.parentId):CREATIVE_SAMPLES,options=allowed.filter(s=>s.id!==creation.lastExampleId),sample=options[Math.max(0,Math.min(options.length-1,Math.floor((Number(random())||0)*options.length)))];return sample?{...creation,idea:`我想种${sample.name}，${sample.gesture}`,lastExampleId:sample.id,error:'',reuseId:null}:{...creation,error:'这个品种暂无更多离线改造方向。',reuseId:null};}
