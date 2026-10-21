import type { FestivalEmote, FestivalMessage } from '../../lib/festival-types';

const FONT_FAMILY='"PingFang SC", "Microsoft YaHei", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});
const words=new Intl.Segmenter(undefined,{granularity:'word'});
const MAX_TEXT_WIDTH=494,PIXELS_TO_WORLD=.01;
const isSingleEmoji=(text:string)=>Array.from(graphemes.segment(text)).length===1&&/\p{Extended_Pictographic}/u.test(text);
export function speechBubbleFont(text:string){return `400 ${isSingleEmoji(text)?64:34}px ${FONT_FAMILY}`;}

/** Measure in the actual drawing font; retain graphemes and readable size when wrapping. */
export function speechBubbleLayout(text:string,measure:(text:string)=>number){
 const lines:string[]=[];
 for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')){
  let line='';
  for(const {segment:word} of words.segment(paragraph)){
   if(!line&&!word.trim())continue;
   if(measure(line+word)<=MAX_TEXT_WIDTH){line+=word;continue;}
   if(line){lines.push(line.trimEnd());line='';}
   if(!word.trim())continue;
   for(const {segment:glyph} of graphemes.segment(word)){
    if(line&&measure(line+glyph)>MAX_TEXT_WIDTH){lines.push(line);line='';}
    line+=glyph;
   }
  }
  lines.push(line.trimEnd());
 }
 const width=Math.ceil(Math.max(0,...lines.map(measure)))+56;
 const lineHeight=isSingleEmoji(text)?80:48;
 const height=lines.length*lineHeight+62;
 return {lines,width,height,lineHeight,worldWidth:width*PIXELS_TO_WORLD,worldHeight:height*PIXELS_TO_WORLD};
}

const EMOTE_ICONS:Record<FestivalEmote,string>={wave:'👋',love:'❤️',laugh:'🤣',spin:'💫',dance:'🪩'};
type BubbleActor={emote:FestivalEmote;emoteAt:number;message?:FestivalMessage;ambient?:boolean};
/** Select chronology before expiry so an expired new event cannot resurrect an older one. */
export function festivalBubbleContent(actor:BubbleActor,now:number):string{
 const message=actor.message;
 const emoteWins=actor.emoteAt>0&&(!message||actor.emoteAt>message.at||actor.emoteAt===message.at&&!actor.ambient);
 if(emoteWins)return now>=actor.emoteAt&&now<actor.emoteAt+5000?EMOTE_ICONS[actor.emote]:'';
 return message&&now>=message.at&&now<message.expiresAt?message.text:'';
}
