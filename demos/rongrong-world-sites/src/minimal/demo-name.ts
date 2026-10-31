/** Public test selector, never proof of identity. Authority requires a separate
 * deployment-owned loopback/verified-owner boundary and repository namespace. */
export type DemoNameSelection={kind:'none'}|{kind:'demo';name:string}|{kind:'invalid';message:string};
export function parseDemoName(search:string|URLSearchParams):DemoNameSelection{
 const params=typeof search==='string'?new URLSearchParams(search):search;
 if(!params.has('name'))return {kind:'none'};
 const values=params.getAll('name'),raw=values[0]??'';
 // Reject controls even at the trimmed edges; do not silently reinterpret them.
 if(values.length!==1||/[\u0000-\u001f\u007f-\uffff]/.test(raw))return {kind:'invalid',message:'测试名称格式无效；请使用 1–24 位英文字母、数字、短横线或下划线。'};
 const name=raw.trim().toLowerCase();
 return /^[a-z0-9][a-z0-9_-]{0,23}$/.test(name)?{kind:'demo',name}:{kind:'invalid',message:'测试名称格式无效；请以字母或数字开头，使用 1–24 位英文字母、数字、短横线或下划线。'};
}
