import {PLAYER_AVATAR,OUTFIT_KEYS} from './player-style.js';
import {imageReference,avatarImageURLs,avatarHasReferences} from './avatar-references.js';
/** Atlas-backed bitmap adapter; content style can change without touching game rules. */
export class ArtAssets {
  constructor(onChange=()=>{},{timeoutMs=8000,retryDelayMs=250,maxAttempts=2,setTimer=(...args)=>globalThis.setTimeout(...args),clearTimer=(...args)=>globalThis.clearTimeout(...args),ImageCtor=null}={}){this.imagePolicy={timeoutMs,retryDelayMs,maxAttempts,setTimer,clearTimer,ImageCtor};this.manifest={sprites:{}};this.avatars={};this.images=new Map();this.onChange=onChange;this.failures=new Set();this.interactions=null;this.interactionPromise=null;this.album=null;this.albumPromise=null;this.portraitPaints=new WeakMap();this.wardrobe={outfits:{}};this.outfitKey='original';}
  async load({requiredArtKeys=null,avatarKey=null,outfitKey='original'}={}){
    const results=await Promise.allSettled([
      fetch('./assets/art-manifest.json').then(r=>{if(!r.ok)throw new Error('plant manifest');return r.json();}),
      fetch('./assets/avatar-manifest.json').then(r=>r.ok?r.json():null),
      fetch('./assets/wardrobe-manifest.json').then(r=>r.ok?r.json():null),
    ]);
    if(results[0].status==='fulfilled')this.manifest=results[0].value;
    if(this.feedingRequested)this.requestInteraction('fluffy_cat_cottage');
    if(results[1].status==='fulfilled'&&results[1].value)this.avatars=results[1].value;
    if(results[2].status==='fulfilled'&&results[2].value?.characterId===PLAYER_AVATAR)this.wardrobe=results[2].value;this.outfitKey=OUTFIT_KEYS.includes(outfitKey)?outfitKey:'original';
    const declared=Object.values(this.manifest.atlases??{}).filter(a=>a.preload===true).map(a=>a.image);
    const requested=Array.isArray(requiredArtKeys)?[...new Set(['radish',...requiredArtKeys])]:null;
    const missingArtKeys=requested?.filter(key=>!this.sprite(key))??[];
    const initial=requested?[...new Set(requested.map(key=>this.sprite(key)?.image).filter(Boolean))]:declared.length?declared:[...new Set(Object.values(this.manifest.sprites??{}).filter(s=>s.kind==='plant').map(s=>s.image))].slice(0,3);
    const selectedAvatar=this.avatar(avatarKey??this.avatars.default??'niulai'),avatarImages=avatarImageURLs(selectedAvatar);
    await Promise.all([...initial,...avatarImages].map(src=>this.loadImage(src)));const outfitFailed=avatarKey===PLAYER_AVATAR&&this.outfitKey!=='original'&&(!this.wardrobe.outfits?.[this.outfitKey]||!avatarImages.every(src=>this.images.get(src)?.ready));if(outfitFailed){this.outfitKey='original';await Promise.all(avatarImageURLs(this.avatar(PLAYER_AVATAR)).map(src=>this.loadImage(src)));}this.onChange();
    const loaded=src=>!!this.images.get(src)?.ready;return {plants:initial.length>0&&!missingArtKeys.length&&initial.every(loaded),avatar:!outfitFailed&&avatarHasReferences(selectedAvatar)&&avatarImages.length>0&&avatarImages.every(loaded),partial:initial.some(loaded),missingArtKeys,failedImages:[...this.failures]};
  }
  async warmSecondary(){
    const common=Object.values(this.manifest.atlases??{}).filter(a=>a.preload===true).map(a=>a.image);
    const urls=[...new Set([...common,...Object.values(this.manifest.sprites??{}).filter(s=>!['plant','building','exhibit','interaction'].includes(s.kind)).map(s=>s.image)])].filter(src=>!this.images.get(src)?.ready);
    const owners=['human-kelly','human-bear','human-jiji','human-lx'];
    for(const id of owners){const a=this.avatars.avatars?.[id];if(a?.portraitPreview)urls.push(imageReference(a.portraitPreview).image);}
    for(let i=0;i<urls.length;i+=2)await Promise.allSettled(urls.slice(i,i+2).map(src=>this.loadImage(src)));
  }
  async loadAvatar(key,{retry=false}={}){
    const avatar=this.avatar(key);if(!avatarHasReferences(avatar))return false;
    const results=await Promise.all(avatarImageURLs(avatar).map(src=>this.loadImage(src,{retry})));return results.length>0&&results.every(Boolean);
  }
  avatar(key){if(key===PLAYER_AVATAR){const outfit=this.wardrobe.outfits?.[this.outfitKey];if(outfit)return {...outfit,id:PLAYER_AVATAR,name:'苏贝壳'};}return this.avatars.avatars?.[key];}
  setOutfit(key){if(OUTFIT_KEYS.includes(key)&&(key==='original'||this.wardrobe.outfits?.[key]))this.outfitKey=key;}
  async loadOutfit(key,{retry=false}={}){const outfit=this.wardrobe.outfits?.[key]??(key==='original'?this.avatars.avatars?.[PLAYER_AVATAR]:null);if(!OUTFIT_KEYS.includes(key)||!avatarHasReferences(outfit))return false;if(retry&&outfit.preview?.image)this.loadImage(outfit.preview.image,{retry:true});const loaded=await Promise.all(avatarImageURLs(outfit).map(src=>this.loadImage(src,{retry})));return loaded.length>0&&loaded.every(Boolean);}
  outfitThumb(canvas,key,{selecting=false}={}){const outfit=this.wardrobe.outfits?.[key]??(key==='original'?this.avatars.avatars?.[PLAYER_AVATAR]:null);const ref=outfit?.preview??outfit?.front;this.portraitThumb(canvas,PLAYER_AVATAR,{portrait:ref,fallbackPortrait:outfit?.front});const entry=this.images.get(imageReference(ref)?.image),failed=entry?.status==='failed';canvas?.classList.toggle('is-error',failed);canvas?.classList.toggle('is-selecting',selecting);const status=canvas?.parentElement?.querySelector?.('[data-outfit-status]');if(status)status.textContent=selecting?'正在换装…':entry?.ready?'':failed?'加载失败 · 点此重试':'加载中…';}
  drawPortrait(ctx,key,x,y,w,h,override=null){
    const portrait=override??this.avatar(key);let ref=imageReference(portrait?.portraitPreview??portrait?.portrait);if(!ref)return false;
    let image=this.readyImage(ref.image);if(!image){const fallback=imageReference(portrait?.fallbackPortrait??portrait?.portrait),entry=this.images.get(fallback?.image);if(entry?.ready){ref=fallback;image=entry.image;}}if(!image)return false;const f=ref.frame??{x:0,y:0,w:image.naturalWidth??image.width??1,h:image.naturalHeight??image.height??1},scale=Math.min(w/f.w,h/f.h);
    ctx.drawImage(image,f.x,f.y,f.w,f.h,x+(w-f.w*scale)/2,y+(h-f.h*scale)/2,f.w*scale,f.h*scale);return true;
  }
  portraitThumb(canvas,key,override=null){
    if(!canvas)return;const dpr=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth||40,h=canvas.clientHeight||40,pw=Math.round(w*dpr),ph=Math.round(h*dpr),portrait=override??this.avatar(key),ref=imageReference(portrait?.portraitPreview??portrait?.portrait),paintKey=JSON.stringify([key,ref,w,h,dpr,!!this.images.get(ref?.image)?.ready,this.images.get(ref?.image)?.status,!!this.images.get(imageReference(portrait?.fallbackPortrait??portrait?.portrait)?.image)?.ready]);
    if(this.portraitPaints.get(canvas)===paintKey&&canvas.width===pw&&canvas.height===ph)return;
    canvas.width=pw;canvas.height=ph;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);canvas.classList.toggle('is-loading',!this.drawPortrait(ctx,key,0,0,w,h,override));this.portraitPaints.set(canvas,paintKey);
  }
  requestAlbum(){
    this.albumPromise??=fetch('./assets/memory-album-manifest.json').then(r=>r.ok?r.json():null).then(m=>{this.album=m;this.onChange();return m;}).catch(()=>null);return this.albumPromise;
  }
  sourceThumb(canvas,key){
    if(!canvas)return;if(!this.album){this.requestAlbum();canvas.classList.toggle('is-loading',true);return;}
    const item=this.album.frames?.[key],image=item?this.readyImage(item.image??this.album.image):null;canvas.classList.toggle('is-loading',!image);if(!item||!image)return;
    const dpr=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth||84,h=canvas.clientHeight||112;canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const f=item.frame,scale=Math.min(w/f.w,h/f.h);ctx.fillStyle='#f7f1e4';ctx.fillRect(0,0,w,h);ctx.drawImage(image,f.x,f.y,f.w,f.h,(w-f.w*scale)/2,(h-f.h*scale)/2,f.w*scale,f.h*scale);
  }
  interactionReady(key){if(key!=='fluffy_cat_cottage')return false;const images=['cat_feed_anticipation','cat_feed_fish'].map(id=>this.sprite(id)?.image);return images.every(image=>image&&this.images.get(image)?.ready);}
  requestInteraction(key,{retry=false}={}){
    if(key==='fluffy_cat_cottage'){this.feedingRequested=true;const images=['cat_feed_anticipation','cat_feed_fish'].map(id=>this.sprite(id)?.image).filter(Boolean);if(images.length!==2)return Promise.resolve(false);const signature=images.join('|');if(this.feedingSignature!==signature||retry&&images.some(image=>this.images.get(image)?.status==='failed')){this.feedingSignature=signature;this.feedingPromise=null;}return this.feedingPromise??=Promise.all(images.map(image=>this.loadImage(image,{retry}))).then(results=>results.every(Boolean));}
    if(!['puffer_tomato','sleepy_sunflower'].includes(key))return Promise.resolve(false);
    this.interactionPromise??=fetch('./assets/interaction-art-manifest.json').then(r=>r.ok?r.json():null).then(m=>{if(m?.approved){this.interactions=m;return true;}return false;}).catch(()=>false);
    return this.interactionPromise.then(async approved=>{if(!approved)return false;const frame=Object.values(this.interactions.animations?.[key]?.frames??{})[0];return frame?!!(await this.loadImage(frame.image)):false;});
  }
  hasInteractionFrame(key,state){const frame=this.interactions?.animations?.[key]?.frames?.[state];return !!frame&&!!this.images.get(frame.image)?.ready;}
  drawInteraction(ctx,key,state,x,y,width){
    const sprite=this.interactions?.animations?.[key]?.frames?.[state];if(!sprite)return false;
    const image=this.readyImage(sprite.image);if(!image)return false;const f=sprite.frame,a=sprite.anchor,w=width*(sprite.widthScale??1),h=w*f.h/f.w;
    ctx.drawImage(image,f.x,f.y,f.w,f.h,x-w*a[0],y-h*a[1],w,h);return true;
  }
  loadImage(src,{retry=false}={}){
    if(typeof src!=='string'||!src)return Promise.resolve(null);
    const previous=this.images.get(src);if(previous&&!(retry&&previous.status==='failed'))return previous.promise;
    const policy=this.imagePolicy,entry={image:null,ready:false,status:'loading',attempt:0,token:0,timer:null};let resolve;
    entry.promise=new Promise(done=>resolve=done);this.images.set(src,entry);this.failures.delete(src);
    const changed=()=>{try{this.onChange();}catch{}};
    const attempt=()=>{
      if(this.images.get(src)!==entry)return;entry.attempt++;entry.status='loading';const token=++entry.token;
      const owned=()=>this.images.get(src)===entry&&entry.token===token&&!entry.ready&&entry.status==='loading';
      const clear=()=>{if(entry.timer!==null)policy.clearTimer(entry.timer);entry.timer=null;};
      const fail=()=>{if(!owned())return;clear();entry.token++;if(entry.attempt<policy.maxAttempts){entry.status='retrying';entry.timer=policy.setTimer(attempt,policy.retryDelayMs);}else{entry.status='failed';this.failures.add(src);resolve(null);}changed();};
      try{const image=entry.image=policy.ImageCtor?new policy.ImageCtor():new Image();image.onload=()=>{if(!owned())return;clear();entry.ready=true;entry.status='ready';this.failures.delete(src);resolve(image);changed();};image.onerror=fail;entry.timer=policy.setTimer(fail,policy.timeoutMs);image.src=src;}catch{fail();}
    };attempt();if(previous?.status==='failed')changed();return entry.promise;
  }
  /** Pointer-only, one-pixel alpha read. Never loads art; unavailable/blocked readback is conservative. */
  spriteAlphaAt(key,u,v){
    if(!Number.isFinite(u)||!Number.isFinite(v))return null;if(u<0||u>=1||v<0||v>=1)return 0;
    return this.imageAlphaAt(this.sprite(key),u,v);
  }
  avatarAlphaAt(key,direction,u,v){const item=this.avatar(key)??(this.avatars.sprites??this.avatars)[key];let sprite=imageReference(item?.[direction]??item?.front??item);if(!this.images.get(sprite?.image)?.ready&&item?.front)sprite=imageReference(item.front);return this.imageAlphaAt(sprite,u,v);}
  imageAlphaAt(sprite,u,v){
    if(!Number.isFinite(u)||!Number.isFinite(v))return null;if(u<0||u>=1||v<0||v>=1)return 0;
    const entry=sprite&&this.images.get(sprite.image);if(!entry?.ready)return null;
    try{if(!this.hitCanvas){this.hitCanvas=globalThis.OffscreenCanvas?new OffscreenCanvas(1,1):globalThis.document?.createElement('canvas');if(!this.hitCanvas)return null;this.hitCanvas.width=1;this.hitCanvas.height=1;this.hitContext=this.hitCanvas.getContext('2d',{willReadFrequently:true});}const ctx=this.hitContext;if(!ctx)return null;const f=sprite.frame??{x:0,y:0,w:entry.image.naturalWidth,h:entry.image.naturalHeight};ctx.clearRect(0,0,1,1);ctx.drawImage(entry.image,f.x+Math.floor(u*f.w),f.y+Math.floor(v*f.h),1,1,0,0,1,1);return ctx.getImageData(0,0,1,1).data[3];}catch{return null;}
  }
  sprite(key){return this.manifest.sprites?.[key]??this.manifest.sprites?.[`basic_${key}`];}
  readyImage(src){const entry=this.images.get(src);if(!entry){this.loadImage(src);return null;}return entry.ready?entry.image:null;}
  draw(ctx,key,x,y,width,options={}){
    const sprite=this.sprite(key);if(!sprite)return false;
    const image=this.readyImage(sprite.image);if(!image)return false;
    const f=sprite.frame??{x:0,y:0,w:image.naturalWidth,h:image.naturalHeight};
    const anchor=sprite.anchor??[.5,1],w=width??sprite.width??84,h=w*f.h/f.w;
    ctx.drawImage(image,f.x,f.y,f.w,f.h,x-w*anchor[0],y-h*anchor[1],w,h);return true;
  }
  drawAvatar(ctx,key,direction,x,y,height=78,mirror=false){
    const entries=this.avatars.avatars??this.avatars.sprites??this.avatars;
    const item=this.avatar(key)??entries[key];let sprite=item?.[direction]??item?.front??item;
    if(typeof sprite==='string')sprite={image:sprite};
    let src=sprite?.image??sprite?.path??sprite?.src;
    let image=src?this.readyImage(src):null;
    if(!image&&item?.front?.image){sprite=item.front;src=sprite.image;image=this.readyImage(src);}
    if(image){const f=sprite.frame??{x:0,y:0,w:image.naturalWidth,h:image.naturalHeight},a=sprite.anchor??item?.anchor??[.5,1];
      const ax=Array.isArray(a)?a[0]:a.x,ay=Array.isArray(a)?a[1]:a.y,h=(item.displayHeight??78)/78*height,w=h*f.w/f.h;
      ctx.save();ctx.translate(x,y);if(mirror&&item?.mirrorForLeft)ctx.scale(-1,1);ctx.drawImage(image,f.x,f.y,f.w,f.h,-w*ax,-h*ay,w,h);ctx.restore();return true;
    }
    ctx.save();ctx.beginPath();ctx.arc(x,y-25,23,0,Math.PI*2);ctx.clip();const drawn=this.drawPortrait(ctx,key,x-24,y-49,48,48);ctx.restore();return drawn;
  }
  thumb(canvas,key){
    if(!canvas)return;const dpr=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth||72,h=canvas.clientHeight||72;
    canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    const sprite=this.sprite(key);if(!sprite)return;
    const image=this.readyImage(sprite.image);canvas.classList.toggle('is-loading',!image);if(!image)return;const f=sprite.frame,b=sprite.alphaBounds??{x:0,y:0,w:f.w,h:f.h};
    const scale=Math.min((w-8)/b.w,(h-8)/b.h);ctx.drawImage(image,f.x+b.x,f.y+b.y,b.w,b.h,(w-b.w*scale)/2,(h-b.h*scale)/2,b.w*scale,b.h*scale);
  }
}
