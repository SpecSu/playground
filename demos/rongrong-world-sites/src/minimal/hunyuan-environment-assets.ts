export type HunyuanEnvironmentAssetId='pine'|'rounded-rock'|'rounded-bush'|'desert-dunes'|'glacier-outcrop';
export type HunyuanEnvironmentAsset={url:string;sha256:string;maxDimension:number;triangleBudget:number;source:'hunyuan-generated'};
/** Actual mobile derivatives of HY3D3.1 originals. Never substitute a procedural mesh as generated. */
export const HUNYUAN_ENVIRONMENT_ASSETS:Partial<Record<HunyuanEnvironmentAssetId,HunyuanEnvironmentAsset>>={
 pine:{url:'/models/environment/hunyuan/pine-mobile.glb',sha256:'c111d109a0c64b4074ad494349a5d992c9ca78668fc20972682d579d91a5cb33',maxDimension:1.45,triangleBudget:5000,source:'hunyuan-generated'},
 'rounded-rock':{url:'/models/environment/hunyuan/rounded-rock-mobile.glb',sha256:'bda09d449197b71bdfaefd296eb06a601c3e07b410e1c3a3d8252064f020d281',maxDimension:.8,triangleBudget:3000,source:'hunyuan-generated'},
 'rounded-bush':{url:'/models/environment/hunyuan/rounded-bush-mobile.glb',sha256:'555c87f147b455fa79186f756b1410de38631b8952cde39dd340796ff6471329',maxDimension:.8,triangleBudget:8000,source:'hunyuan-generated'},
 'desert-dunes':{url:'/models/environment/hunyuan/desert-dunes-mobile.glb',sha256:'f0c7d5eb36204036e3e4ec3ebb41e752946569226da97274bc72a5abd231a4d3',maxDimension:3.2,triangleBudget:5000,source:'hunyuan-generated'},
 'glacier-outcrop':{url:'/models/environment/hunyuan/glacier-outcrop-mobile.glb',sha256:'1d4cefee0921aa748e0395f16a471d5bfef4f1586162f3e4e94079e099079248',maxDimension:3.2,triangleBudget:8000,source:'hunyuan-generated'},
};
