import {SCHOOL_PLAYGROUND_LAYOUT as L,capsulePoint,laneDistance} from './playground-layout.ts';
export type PlaygroundRunnerFrame=Readonly<{instanceId:string;templateId:'red-scarf-person';row:number;column:number;progress:number;lateral:number;x:number;z:number;heading:number;runTime:number}>;
/** Active-time distance clock only. No RAF, scene, account, farm or persistence. */
export class PlaygroundFormation{
 private progress=0;private paused=false;private disposed=false;private readonly duration:number;private readonly stride:number;
 constructor(run:{duration:number;strideMeters:number}){if(!Number.isFinite(run.duration)||run.duration<=0||run.duration>3||!Number.isFinite(run.strideMeters)||run.strideMeters<=0||run.strideMeters>3)throw new Error('A measured run stride and duration are required');this.duration=run.duration;this.stride=run.strideMeters;}
 tick(deltaSeconds:number){if(this.disposed||this.paused||!Number.isFinite(deltaSeconds)||deltaSeconds<=0||deltaSeconds>.25)return;this.progress+=deltaSeconds*this.stride/this.duration;}
 setPaused(paused:boolean){if(!this.disposed)this.paused=paused;}
 snapshot():readonly PlaygroundRunnerFrame[]{return this.frames(this.progress);}
 preview(dt:number):readonly PlaygroundRunnerFrame[]{return this.frames(this.progress+(!this.paused&&!this.disposed&&Number.isFinite(dt)&&dt>0&&dt<=.25?dt*this.stride/this.duration:0));}
 private frames(at:number):readonly PlaygroundRunnerFrame[]{return Array.from({length:L.group.count},(_,i)=>{const row=Math.floor(i/2),column=i%2,lateral=(column-.5)*L.group.columnSpacing,progress=at-row*L.group.rowSpacing,travelled=laneDistance(progress,lateral)-laneDistance(-row*L.group.rowSpacing,lateral);return Object.freeze({instanceId:`school-runner-${i+1}`,templateId:L.group.templateId,row,column,progress,lateral,...capsulePoint(progress,lateral),runTime:row*.05*this.duration+travelled/this.stride*this.duration});});}
 dispose(){this.disposed=true;}
}
