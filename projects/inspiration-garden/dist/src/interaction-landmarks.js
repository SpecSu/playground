// Authored instrument landmarks use full-frame coordinates, independent of alpha bounds.
export function landmarkScreenPoint(art,point){
 const x=(point[0]-art.anchor[0])*art.width*art.sx,y=(point[1]-art.anchor[1])*art.height*art.sy,c=Math.cos(art.angle),s=Math.sin(art.angle);
 return {x:art.x+c*x-s*y,y:art.y+s*x+c*y};
}
export function landmarkContactPoint(art,point){
 const dx=point.x-art.x,dy=point.y-art.y,c=Math.cos(art.angle),s=Math.sin(art.angle);
 return {x:(c*dx+s*dy)/art.sx/art.width+art.anchor[0],y:(-s*dx+c*dy)/art.sy/art.height+art.anchor[1]};
}
export function nearestLandmark(points,x,y,{horizontal=false}={}){
 let selected=0,distance=Infinity;
 for(const [index,[px,py]]of points.entries()){const d=(x-px)**2+(horizontal?0:(y-py)**2);if(d<distance){selected=index;distance=d;}}
 return selected;
}
