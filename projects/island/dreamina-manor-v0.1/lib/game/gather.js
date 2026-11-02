/** A frozen own-production selection, never an inventory or a random draw. */
export function gatherTargets(game,now,entries=[]){
 const reserved=new Set();for(const e of entries){if(e.cancelled)continue;if(e.command?.type==='harvest-batch')for(const t of e.command.targets??[])reserved.add(t.jobId);if(e.command?.action==='harvest'&&e.jobId)reserved.add(e.jobId);}
 return(game?.jobs??[]).filter(j=>j.readyAt<=now&&!reserved.has(j.id)).map(j=>({jobId:j.id,target:structuredClone(j.target)}));
}
