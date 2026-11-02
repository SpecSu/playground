/** Collection records remain after an instance is sold or gifted. They never confer ownership. */
export function recordDiscovery(state,item){
 state.discovered??={};state.discovered[item.speciesId]=(state.discovered[item.speciesId]??0)+1;
 if(!['giant','gold'].includes(item.mutation))return;
 state.discoveredVariants??={};const previous=state.discoveredVariants[item.speciesId]??[];
 if(!previous.includes(item.mutation))state.discoveredVariants[item.speciesId]=[...previous,item.mutation];
}
export function collectionVariants(state){
 const result=structuredClone(state.discoveredVariants??{});
 // Existing development saves can safely recover facts from owned, already-harvested items.
 // Pending production is intentionally excluded, so it never unlocks a catalogue card early.
 for(const item of state.items??[])if(['giant','gold'].includes(item.mutation)){
  const known=result[item.speciesId]??[];if(!known.includes(item.mutation))result[item.speciesId]=[...known,item.mutation];
 }
 return result;
}
