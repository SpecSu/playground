/** Completed, solid rectangles only. Equal total area, holes and construction reservations do not count. */
export function findTankRectangle(cells,n,m=n,rotate=true){const set=new Set(cells.map(c=>`${c.x},${c.z}`));for(const [width,depth,rotated]of [[n,m,false],...(rotate&&n!==m?[[m,n,true]]:[])])for(const c of cells){let fits=true;for(let x=0;x<width&&fits;x++)for(let z=0;z<depth;z++)if(!set.has(`${c.x+x},${c.z+z}`)){fits=false;break;}if(fits)return {x:c.x,z:c.z,width,depth,rotated};}return null;}
export const containsTankRectangle=(cells,n,m=n)=>!!findTankRectangle(cells,n,m);
export const containsTankSquare=(cells,n)=>containsTankRectangle(cells,n,n);
export function tankSquareSize(cells){for(let n=Math.floor(Math.sqrt(cells.length));n>=1;n--)if(containsTankSquare(cells,n))return n;return 0;}
export function tankRectangleArea(cells){let area=0;for(let n=1;n<=cells.length;n++)for(let m=1;m<=Math.floor(cells.length/n);m++)if(n*m>area&&findTankRectangle(cells,n,m,false))area=n*m;return area;}
export const rectangleWaterHeight=(n,m=n)=>2.6+3*Math.max(0,Math.max(n,m)-1);
export const squareWaterHeight=n=>rectangleWaterHeight(n,n);
export function tankWaterHeight(cells){let longest=1;for(let n=2;n<=cells.length;n++)if(containsTankRectangle(cells,n,1))longest=n;return rectangleWaterHeight(longest,1);}
