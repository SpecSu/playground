// Invitation presentation only. No tokens, personal state, or access grants.
export const GARDEN_INVITE=Object.freeze({title:'贝壳的花园',text:'邀请你一起种点喜欢的东西。',url:'https://inspiration-garden.mythicgleam32.chatgpt.site/'});
export async function shareGardenInvitation({navigator:nav=globalThis.navigator,copyOnly=false}={}){
 if(!copyOnly&&typeof nav?.share==='function')try{await nav.share({...GARDEN_INVITE});return 'shared';}catch(error){if(error?.name==='AbortError')return 'cancelled';}
 if(typeof nav?.clipboard?.writeText!=='function')return 'unavailable';
 try{await nav.clipboard.writeText(GARDEN_INVITE.url);return 'copied';}catch{return 'unavailable';}
}
