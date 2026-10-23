import{FISH_SPACE_PROFILES}from'./fish-space-profiles.js';
import{SPECIES_BY_ID}from'./catalogue.js';
import{fishWorldLength,SHARED_CELL_SIZE,TANK_OUTER_EDGE_INSET}from'../art/physical-contract.js';
import{findTankRectangle,containsTankSquare,tankWaterHeight,rectangleWaterHeight}from'./tank-space.js';
export{containsTankSquare,containsTankRectangle}from'./tank-space.js';
export const RESTRICTED_TURN_ANGLE=.12;
/** Same physical envelope and margins in UI, authoritative placement and the swimmer. No tank-dependent scaling. */
export function fishSpaceRequirement(item){
 const p=FISH_SPACE_PROFILES[item.speciesId];if(!p)throw new Error('Unknown fish envelope');
 const length=fishWorldLength(item.finalSize,item.standardSize??SPECIES_BY_ID[item.speciesId].standardSize),halfLength=p.halfLength*length,halfWidth=p.halfWidth*length;
 const height=2*p.halfHeight*length+.16,swimRadius=p.radius*length+.035;
 const turnX=halfLength+halfWidth*Math.sin(RESTRICTED_TURN_ANGLE),turnZ=halfWidth+halfLength*Math.sin(RESTRICTED_TURN_ANGLE),border=2*TANK_OUTER_EDGE_INSET+.035;
 let n=Math.max(1,Math.ceil((2*turnX+.10+border)/SHARED_CELL_SIZE)),m=Math.max(1,Math.ceil((2*turnZ+.10+border)/SHARED_CELL_SIZE));
 while(rectangleWaterHeight(n,m)<height){if(n<=m)n++;else m++;}
 let fullTurnN=Math.max(1,Math.ceil((2*swimRadius+.03+border)/SHARED_CELL_SIZE));while(rectangleWaterHeight(fullTurnN,fullTurnN)<height)fullTurnN++;
 if(fullTurnN*fullTurnN<n*m){n=fullTurnN;m=fullTurnN;}
 return {requiredN:n,requiredM:m,requiredNxM:[n,m],requiredNxN:Math.max(n,m),requiredWaterHeight:height,width:2*swimRadius+.03,swimRadius,halfHeight:p.halfHeight*length,halfLength,halfWidth,turnX,turnZ,fullTurnN};
}
export function fishTankFit(game,item){const required=fishSpaceRequirement(item),rectangle=findTankRectangle(game.tank,required.requiredN,required.requiredM),freeRectangle=findTankRectangle(game.tank,required.fullTurnN,required.fullTurnN);return {...required,rectangle,freeRectangle,restricted:!freeRectangle,fitsHeight:required.requiredWaterHeight<=tankWaterHeight(game.tank),fitsFootprint:!!rectangle};}
