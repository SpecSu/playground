/** Safe metadata only: no raw save bytes, user names, prompts or unknown fields. */
export type FarmSaveDiagnostic={
 source:'isolated-local'|'v3-source'|'v2-source'|'migration-choice';
 reason:'invalid-json'|'invalid-save'|'future-version'|'unexpected-version'|'invalid-migration-record';
 version?:number;
};
/** Describe only a save already rejected by the strict decoder; never opens or writes storage. */
export function diagnoseRejectedFarmSave(raw:string,source:FarmSaveDiagnostic['source'],expectedVersion:2|3):FarmSaveDiagnostic{
 try{
  const value:unknown=JSON.parse(raw),candidate=value&&typeof value==='object'&&'version'in value?value.version:undefined;
  const version=typeof candidate==='number'&&Number.isFinite(candidate)?candidate:undefined;
  const reason=version!==undefined&&version>3?'future-version':version!==undefined&&version!==expectedVersion?'unexpected-version':'invalid-save';
  return {source,reason,...(version!==undefined?{version}:{})};
 }catch{return {source,reason:'invalid-json'};}
}
export function farmSaveDiagnosticMessage(diagnostic:FarmSaveDiagnostic|undefined):string{
 if(!diagnostic)return '存档格式暂不支持，原始进度已保留，请勿清除浏览器数据。';
 const label={'isolated-local':'本机独立存档','v3-source':'原v3存档','v2-source':'旧v2存档','migration-choice':'升级选择记录'}[diagnostic.source];
 const version=diagnostic.version===undefined?'':`（版本 ${diagnostic.version}）`;
 const reason={
  'invalid-json':'读取格式异常，暂时无法解析',
  'invalid-save':'内容未通过完整校验，暂时无法安全载入',
  'future-version':'来自较新版本，请使用兼容版本打开',
  'unexpected-version':'版本与所在位置不符，未自动降级或覆盖',
  'invalid-migration-record':'格式暂不支持，未自动替换升级选择'
 }[diagnostic.reason];
 return `${label}：${reason}${version}。原始进度已保留，请勿清除浏览器数据。`;
}
