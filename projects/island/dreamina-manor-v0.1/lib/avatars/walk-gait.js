/** One gait cycle follows travelled world distance, never wall-clock/network ACKs. */
export function advanceWalkPhase(phase,distance,height){return phase+Math.max(0,Math.min(distance||0,1.2))/(Math.max(1.5,height)*1.55)*Math.PI*2;}
export function walkAngles(phase,side){const p=phase+(side==='R'?Math.PI:0),s=Math.sin(p);const hip=s*.62,knee=-Math.max(0,s)*.56;return {hip,knee,foot:-(hip+knee)*.35,arm:-s*.42};}
