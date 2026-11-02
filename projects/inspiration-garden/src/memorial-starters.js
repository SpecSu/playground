/** Simulated owned keepsakes, hydrated only after the original raw save is validated. */
export const MEMORIAL_SAMPLE_IDS=Object.freeze(['lamy_memory_column','airforce_memory_house']);
export function grantMemorialBlueprints(state){
 if(state.memorialBlueprintsVersion===1)return state;
 const blueprints={...(state.blueprints??{})},next={...state,blueprints,memorialBlueprintsVersion:1};
 for(const sampleId of MEMORIAL_SAMPLE_IDS){if(Object.values(blueprints).some(b=>b.sampleId===sampleId&&b.authorId===state.uid)||Object.keys(blueprints).length>=100)continue;const base='example-'+sampleId;let id=base,n=1;while(Object.hasOwn(blueprints,id))id=base+'-'+n++;blueprints[id]={id,sampleId,authorId:state.uid,authorName:'苏贝壳',parentId:null,rootId:id,parentAuthorName:null};}
 return next;
}
