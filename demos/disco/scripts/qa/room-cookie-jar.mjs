/** Minimal per-client cookie jar for this single-origin HTTP QA flow. */
export function mergeResponseCookies(currentHeader, setCookies) {
  const cookies=new Map();
  const readPair=(pair)=>{const equals=pair.indexOf('=');return equals>0?[pair.slice(0,equals).trim(),pair.slice(equals+1).trim()]:null;};
  for(const pair of (currentHeader||'').split(';')){const parsed=readPair(pair);if(parsed)cookies.set(...parsed);}
  for(const cookie of setCookies){
    const [pair,...attributes]=cookie.split(';');const parsed=readPair(pair);if(!parsed)continue;
    if(attributes.some((v)=>/^\s*max-age\s*=\s*0\s*$/i.test(v)))cookies.delete(parsed[0]);
    else cookies.set(...parsed);
  }
  return Array.from(cookies,([name,value])=>`${name}=${value}`).join('; ');
}
