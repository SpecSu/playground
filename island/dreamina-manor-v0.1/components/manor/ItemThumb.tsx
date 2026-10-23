'use client';
import {useEffect,useRef,useState} from 'react';
export default function ItemThumb({item,silhouette=false,defer=false}:{item:any,silhouette?:boolean,defer?:boolean}){
 const[src,setSrc]=useState(''),[visible,setVisible]=useState(!defer),host=useRef<HTMLSpanElement>(null);
 useEffect(()=>{if(!defer||visible)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'64px'});if(host.current)observer.observe(host.current);return()=>observer.disconnect();},[defer,visible]);
 useEffect(()=>{if(!visible)return;let active=true;setSrc('');import('../../lib/world/item-preview.js').then(m=>m.itemThumbnail(item)).then(url=>{if(active)setSrc(url);}).catch(()=>{});return()=>{active=false;};},[visible,item.speciesId,item.finalSize,item.mutation]);
 return <span ref={host} className={`item-thumb ${src?'':'pending-thumb'}`} aria-hidden="true">{src&&<img className={`item-thumb ${silhouette?'silhouette':''}`} src={src} alt=""/>}</span>;
}
