/** Independent gift of three personal directions; their reserved slots never evict owned work. */
export const PERSONAL_EXHIBIT_SAMPLE_IDS=Object.freeze(['xt50_memory_camera','scallop_shell_house','camping_tarp_pavilion']);
export function grantPersonalExhibitBlueprints(state){
 if(state.personalExhibitsVersion===1)return state;
 const blueprints={...(state.blueprints??{})},next={...state,blueprints,personalExhibitsVersion:1};
 for(const sampleId of PERSONAL_EXHIBIT_SAMPLE_IDS){
  if(Object.values(blueprints).some(b=>b.sampleId===sampleId&&b.authorId===state.uid))continue;
  const base='example-'+sampleId;let id=base,n=1;while(Object.hasOwn(blueprints,id))id=base+'-'+n++;
  blueprints[id]={id,sampleId,authorId:state.uid,authorName:'苏贝壳',parentId:null,rootId:id,parentAuthorName:null};
 }
 return next;
}
