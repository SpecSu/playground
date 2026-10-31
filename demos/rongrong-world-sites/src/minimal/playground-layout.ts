/** This stage is visitor-only metres, never an expansion of canonical farm tiles. */
export const SCHOOL_PLAYGROUND_LAYOUT=Object.freeze({
 ground:Object.freeze({minX:-16,maxX:16,minZ:-12,maxZ:12}),
 path:Object.freeze({halfStraight:6,radius:6,length:24+Math.PI*12}),
 track:Object.freeze({innerRadius:3.9,outerRadius:8.1,surfaceY:.012}),
 group:Object.freeze({templateId:'red-scarf-person' as const,count:8,rows:4,columns:2,rowSpacing:2,columnSpacing:1.4}),
 runnerRadius:.45,
});
export type PlaygroundPathPoint={x:number;z:number;heading:number};
function input(s:number,offset:number){if(!Number.isFinite(s)||!Number.isFinite(offset)||Math.abs(offset)>2.1)throw new Error('Invalid playground path input');}
/** C1 closed capsule, clockwise from its north-west straight. Positive offset is outward. */
export function capsulePoint(distance:number,offset=0):PlaygroundPathPoint{
 input(distance,offset);const {halfStraight:h,radius:r,length}=SCHOOL_PLAYGROUND_LAYOUT.path,s=((distance%length)+length)%length;let x:number,z:number,dx:number,dz:number;
 if(s<2*h){x=-h+s;z=-r;dx=1;dz=0;}
 else if(s<2*h+Math.PI*r){const a=-Math.PI/2+(s-2*h)/r;x=h+r*Math.cos(a);z=r*Math.sin(a);dx=-Math.sin(a);dz=Math.cos(a);}
 else if(s<4*h+Math.PI*r){x=h-(s-2*h-Math.PI*r);z=r;dx=-1;dz=0;}
 else{const a=Math.PI/2+(s-4*h-Math.PI*r)/r;x=-h+r*Math.cos(a);z=r*Math.sin(a);dx=-Math.sin(a);dz=Math.cos(a);}
 return {x:x+dz*offset,z:z-dx*offset,heading:Math.atan2(dx,dz)};
}
/** Unwrapped arc length in a parallel lane. Linear sections have equal length;
 * outer runners cover more distance in bends while preserving the cross-row. */
export function laneDistance(distance:number,offset=0):number{
 input(distance,offset);const {halfStraight:h,radius:r,length}=SCHOOL_PLAYGROUND_LAYOUT.path,laps=Math.floor(distance/length),s=distance-laps*length,arc=Math.max(0,Math.min(Math.PI*r,s-2*h))+Math.max(0,s-(4*h+Math.PI*r));return laps*(length+2*Math.PI*offset)+s+arc*offset/r;
}
