/** A gentle simulated ranch climate, not a real-world weather forecast. */
export const WEATHER_KINDS=['sunny','cloudy','rain','snow','storm'] as const;
export type WeatherKind=typeof WEATHER_KINDS[number];
export type WeatherOverride={weather?:WeatherKind|'auto';time?:'auto'|'day'|'night'};
export type WeatherState={kind:WeatherKind;label:string;localHour:number;daylight:number;phase:'day'|'dawn'|'dusk'|'night';slot:number};
export const WEATHER_LABELS:Record<WeatherKind,string>={sunny:'晴天',cloudy:'多云',rain:'雨天',snow:'雪天',storm:'雷雨'};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{const a=clamp(x);return a*a*(3-2*a);};
/** Stable for each four-hour UTC+8 slot; independent of login/save state. */
export function automaticWeather(slot:number):WeatherKind{
 let n=(slot^0x51f15e)>>>0;n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);const roll=((n^(n>>>16))>>>0)%100;
 return roll<45?'sunny':roll<68?'cloudy':roll<85?'rain':roll<95?'snow':'storm';
}
export function deriveWeather(now:number,override:WeatherOverride={}):WeatherState{
 const safe=Number.isFinite(now)?now:0,local=safe+8*3600000;
 const localHour=((local%86400000)+86400000)%86400000/3600000,slot=Math.floor(local/14400000);
 const daylight=override.time==='day'?1:override.time==='night'?0:smooth((localHour-5.5)/1.5)*(1-smooth((localHour-17.5)/1.5));
 const phase=override.time==='day'?'day':override.time==='night'?'night':localHour<5.5||localHour>=19?'night':localHour<7?'dawn':localHour>=17.5?'dusk':'day';
 const kind=override.weather&&override.weather!=='auto'?override.weather:automaticWeather(slot);
 return {kind,label:WEATHER_LABELS[kind],localHour,daylight,phase,slot};
}
/** A single soft illumination pulse every 18 seconds, never a strobe. */
export function lightningStrength(seconds:number,kind:WeatherKind,reducedMotion=false):number{
 if(kind!=='storm'||reducedMotion||!Number.isFinite(seconds)||seconds<0)return 0;
 const t=seconds%18;if(t<12||t>12.8)return 0;
 return Math.sin((t-12)/.8*Math.PI)**2*.16;
}
export const WEATHER_PALETTES={
 sunny:{sky:'#DCECCF',ground:'#92A079',cloud:'#FFF9E9',overcast:0},
 cloudy:{sky:'#C6D4D4',ground:'#8A9B83',cloud:'#E5E9E5',overcast:.24},
 rain:{sky:'#AABFC6',ground:'#849585',cloud:'#B8C7CA',overcast:.38},
 snow:{sky:'#DFE8EC',ground:'#A5B4B2',cloud:'#F1F5F4',overcast:.18},
 storm:{sky:'#91A6B5',ground:'#7B8E86',cloud:'#A5B6C2',overcast:.52},
} as const;
