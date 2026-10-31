import type {BoardingTarget} from './boarding-target.ts';
import {terrainAppearanceIssue} from './terrain-appearance.ts';
import {createMinimalState,type MinimalState,type MinimalAnimal,type Point,type Terrain,type Species} from './model.ts';
/** Authored showcase realms, never contacts, actual identities or UID aliases. */
export type SampleTarget=Extract<BoardingTarget,{kind:'sample'}>;
export type SampleTheme='desert'|'glacier'|'wetland'|'lunar';
export type FriendCard={target:SampleTarget;name:string;farmName:string;avatar?:string;badge:'示例';identityStatus:'unlinked-account';themeId:SampleTheme;today:number;week:number;theme:string;accent:string};
// Display-only mapping follows the supplied portrait/name order and can be corrected.
// It never links a real account, friend code or 3D model to these stable sample IDs.
export const SAMPLE_FRIENDS:readonly FriendCard[]=[
 {target:{kind:'sample',sampleId:'oasis'},name:'贝壳',avatar:'/assets/friends/beike.png',farmName:'沙丘绿洲',badge:'示例',identityStatus:'unlinked-account',themeId:'desert',today:398,week:1820,theme:'金色沙脊 · 绿洲水庭',accent:'#b18c58'},
 {target:{kind:'sample',sampleId:'glacier'},name:'加新',avatar:'/assets/friends/jiaxin.png',farmName:'冰川港湾',badge:'示例',identityStatus:'unlinked-account',themeId:'glacier',today:286,week:2040,theme:'冰蓝峡湾 · 极光观景台',accent:'#688e9e'},
 // Keep the historical sample key so old demo-realm references are not reassigned to a UID.
 {target:{kind:'sample',sampleId:'forest'},name:'Rummons',avatar:'/assets/friends/rummons.png',farmName:'芦苇水乡',badge:'示例',identityStatus:'unlinked-account',themeId:'wetland',today:224,week:1640,theme:'浅滩水网 · 芦苇栈道',accent:'#648d79'},
 {target:{kind:'sample',sampleId:'lunar'},name:'吉吉',avatar:'/assets/friends/jiji.png',farmName:'月球剧场',badge:'示例',identityStatus:'unlinked-account',themeId:'lunar',today:172,week:1360,theme:'环形山 · 五位DIY伙伴 · 篮球秀',accent:'#88859b'},
];
export type PendingDIYSlot={id:string;position:Point;status:'awaiting-glb';assetId?:never};
export type SampleFarm={card:FriendCard;state:MinimalState;route:readonly Point[];viewpoints:readonly Point[];restSpots:readonly Point[];pendingDIY:readonly PendingDIYSlot[]};
const points=(v:readonly (readonly [number,number])[]):Point[]=>v.map(([x,z])=>({x,z}));
const loop=points([[1,3],[2,3],[2,2],[2,1],[3,1],[4,1],[4,2],[4,3],[4,4],[3,4],[2,4],[1,4],[1,3]]);
const same=(a:Point,b:Point)=>a.x===b.x&&a.z===b.z;
export function sampleFarm(sampleId:string,now:number):SampleFarm{
 const card=SAMPLE_FRIENDS.find(f=>f.target.sampleId===sampleId);if(!card)throw new Error('未知示例牧场');const theme=card.themeId;
 const state=createMinimalState(now);state.welcomeClaimed=true;state.coins=0;state.notice='示例牧场 · 临时串门';state.nextWolfAt=Number.MAX_SAFE_INTEGER;state.wolfEvent=null;state.player={x:1,z:3};state.playerPath=[];state.hatchedCount=0;
 const route=theme==='lunar'?points([[1,3],[2,3],[3,3],[4,3],[4,4],[3,4],[2,4],[1,4],[1,3]]):loop;
 for(const tile of state.tiles){
  tile.owned=tile.x>=0&&tile.x<=5&&tile.z>=0&&tile.z<=5;
  let terrain:Terrain=theme==='desert'?'desert':theme==='wetland'?'meadow':'glacier';
  if(tile.owned){
   if(theme==='desert'&&tile.x<=1&&tile.z<=3)terrain='meadow';
   if(theme==='glacier'&&tile.x===0&&tile.z<=2)terrain='meadow';
   if(theme==='wetland'&&tile.x===5&&tile.z>=1)terrain='creek';
   if(theme==='wetland'&&tile.z===5&&tile.x>=2)terrain='creek';
   if(theme!=='lunar'&&tile.x===3&&(tile.z===2||tile.z===3))terrain='pond';
   if(theme==='glacier'&&tile.x===4&&tile.z===5)terrain='pond';
   if(theme==='lunar'&&tile.x===5&&tile.z===5)terrain='pond';
   if(route.some(p=>same(p,tile)))terrain=theme==='wetland'?'meadow':theme==='desert'?'desert':'glacier';
  }
  tile.terrain=terrain;tile.naturalTerrain=terrain;tile.level=1;
  // The appearance contract is provided by the separate terrain owner; ecology is unchanged.
  if(theme==='lunar'&&terrainAppearanceIssue(tile)===null)tile.appearance='lunar';
 }
 // Match the existing game's biome catalog, not a new biological/model claim.
 // Main-species skins still require the current verified provider; no sample bypass.
 const specs:readonly (readonly [Species,string,number,number])[]=theme==='wetland'?
 [['duck','涟漪',1,2],['duck','芦芽',2,4],['duck','小帆',4,2],['duck','水团',4,4],['cow','水岸奶糖',5,0]]:
 theme==='glacier'?[['penguin','雪团',1,2],['penguin','冰糖',2,4],['penguin','小冰山',4,2],['penguin','极光',4,4]]:
 theme==='desert'?[['alpaca','沙绒',1,2],['alpaca','金穗',2,4],['alpaca','驼铃',4,4],['bunny','绿洲栗栗',0,2],['bunny','绿洲月牙',0,3]]:
 [];
 state.animals=specs.map(([species,name,x,z],i):MinimalAnimal=>({id:`sample:${sampleId}:${species}-${i}`,name,species,sex:i%2?'male':'female',size:'normal',rarity:i===0?'blue':'white',position:{x,z},activity:i%2&&species!=='penguin'&&state.tiles.some(t=>t.x===x&&t.z===z&&t.terrain==='meadow')?'graze':'rest',energy:80,bond:10,bornAt:now-600_000,activityUntil:now+12_000+i*1_000}));
 const pendingDIY:PendingDIYSlot[]=[];
 return {card:structuredClone(card),state,route:structuredClone(route),viewpoints:points([[4,1],[4,4]]),restSpots:points([[0,2],[1,4]]),pendingDIY};
}
