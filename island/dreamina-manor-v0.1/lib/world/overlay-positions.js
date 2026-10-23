/** Called after the world's render, using the same camera and object matrices.
 * React owns content, not per-frame screen coordinates. No smoothing or transition.
 */
export function applyOverlayPositions(root,positions){
 if(!root)return;const byId=new Map(positions.map(p=>[p.id,p]));
 for(const element of root.querySelectorAll('[data-overlay-id]')){const p=byId.get(element.dataset.overlayId);element.style.visibility=p?'visible':'hidden';if(!p)continue;element.style.left=`${p.x}px`;element.style.top=`${p.y}px`;if(p.opacity!==undefined)element.style.opacity=String(p.opacity);}
}
