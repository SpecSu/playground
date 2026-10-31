import {Leaf,Droplets,Trees,Star} from 'lucide-react';
import {foodSiteRating,type FoodResource,type FoodQuality} from './food-resources.ts';
import type {Building,Layout} from './layout.ts';
import './food-site.css';
export const FOOD_RESOURCE_LABEL:Record<FoodResource,string>={grassland:'肥沃草地',freshwater:'淡水',forest:'天然树林'};
export const FOOD_QUALITY_LABEL:Record<FoodQuality,string>={plain:'家常',fresh:'新鲜',rich:'丰盛'};
const icons={grassland:Leaf,freshwater:Droplets,forest:Trees};
export default function FoodSiteCard({building,layout,planned=false,valid=true}:{building:Building;layout:Pick<Layout,'buildings'>;planned?:boolean;valid?:boolean}){
 const rating=foodSiteRating(building,layout),missing=(Object.keys(FOOD_RESOURCE_LABEL) as FoodResource[]).filter(r=>!rating.resources.includes(r));
 return <section className="food-site-card" data-food-site={planned?'planned':'current'} data-food-stars={rating.stars} aria-live={planned?'polite':undefined}>
  <div className="food-site-heading"><b>{planned?'选址预览':'饲料坊（小食堂）· 当前'}</b><span className="food-site-stars" aria-label={`${rating.stars}星，共3星`}>{[1,2,3].map(n=><Star key={n} size={13} fill={n<=rating.stars?'currentColor':'none'}/>)}<small>{rating.stars}/3</small></span></div>
  <div className="food-site-resources">{(Object.keys(FOOD_RESOURCE_LABEL) as FoodResource[]).map(resource=>{const Icon=icons[resource],active=rating.resources.includes(resource);return <span key={resource} className={active?'active':''}><Icon size={12}/>{FOOD_RESOURCE_LABEL[resource]}{active?' +1':' 未相邻'}</span>;})}</div>
  <p>每{rating.production.intervalMs/1000}秒 · {rating.production.batchSize}份{FOOD_QUALITY_LABEL[rating.production.quality]}照料餐 · 每份营养{rating.production.nutrition}</p>
  <small>{missing.length?`缺少：${missing.map(r=>FOOD_RESOURCE_LABEL[r]).join('、')}`:'三类自然资源齐全'}{planned&&!valid?' · 此处不可建，调整位置再确认':''}</small>
  <details><summary>相邻怎么算？</summary><p>离线也备餐，库存与在途食物合计最多12份。建筑占地的四边贴邻才算，斜角不算。每类最多1星；池塘和河流同算1类淡水。普通草坪、装饰树不算自然资源。营养是单份饱食补充量，自动进食最多维持70饱食，不改变稀有度。</p></details>
 </section>;
}
