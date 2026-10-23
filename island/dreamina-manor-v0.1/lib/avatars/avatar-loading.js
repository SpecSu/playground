import {resolveAvatarId,avatarDefinition} from './avatar-cast.js';
function disposeTemplate(root){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:node.material?[node.material]:[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});geometries.forEach(x=>x.dispose());materials.forEach(x=>x.dispose());textures.forEach(x=>{x.dispose();x.source?.data?.close?.();});}
/** Lazy, deduplicated templates. Keep active actors alive; retain at most one spare. */
export function createAvatarLibrary(load,{limit=3,dispose=disposeTemplate}={}){
 const templates=new Map(),pending=new Map(),failed=new Map();let closed=false,retained=new Set();
 function prune(){for(const [id,template]of templates){if(templates.size<=limit)break;if(!retained.has(id)){templates.delete(id);dispose(template);}}}
 return {templates,has:value=>templates.has(resolveAvatarId(value)),get(value){const id=resolveAvatarId(value),template=templates.get(id);if(template){templates.delete(id);templates.set(id,template);}return template;},
 retain(values){retained=new Set(values.map(resolveAvatarId));prune();},
 load(value){const id=resolveAvatarId(value);if(closed)return Promise.reject(new Error('Avatar library is closed.'));if(templates.has(id))return Promise.resolve(templates.get(id));if(pending.has(id))return pending.get(id);if(Date.now()-(failed.get(id)??0)<10000)return Promise.reject(new Error(`Avatar ${id} is temporarily unavailable.`));
  const request=Promise.resolve().then(()=>load(avatarDefinition(id).modelUrl,id)).then(template=>{if(closed){dispose(template);throw new Error('Avatar library is closed.');}templates.set(id,template);failed.delete(id);prune();return template;}).catch(error=>{failed.set(id,Date.now());throw error;}).finally(()=>pending.delete(id));pending.set(id,request);return request;
 },dispose(){closed=true;for(const template of templates.values())dispose(template);templates.clear();retained.clear();},get pendingCount(){return pending.size;}};
}
