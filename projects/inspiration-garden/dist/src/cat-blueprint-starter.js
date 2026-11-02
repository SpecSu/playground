/** Independent free cat blueprint; one reserved slot preserves full legacy collections. */
export const CAT_BLUEPRINT_SAMPLE_ID='fluffy_cat_cottage';
export function grantCatBlueprint(state){
 if(state.catBlueprintsVersion===1)return state;
 const blueprints={...(state.blueprints??{})},next={...state,blueprints,catBlueprintsVersion:1};
 if(Object.values(blueprints).some(b=>b.sampleId===CAT_BLUEPRINT_SAMPLE_ID&&b.authorId===state.uid))return next;
 const base='example-'+CAT_BLUEPRINT_SAMPLE_ID;let id=base,n=1;while(Object.hasOwn(blueprints,id))id=base+'-'+n++;
 blueprints[id]={id,sampleId:CAT_BLUEPRINT_SAMPLE_ID,authorId:state.uid,authorName:'苏贝壳',parentId:null,rootId:id,parentAuthorName:null};
 return next;
}
