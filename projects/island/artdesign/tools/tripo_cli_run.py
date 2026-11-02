"""Use the official CLI for submission/polling/download; keep local review gates and records."""
import argparse
import fcntl
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time
import tripo_pipeline as p

def cli(args):
    r=subprocess.run(['tripo',*args,'--json','--no-open'],capture_output=True,text=True)
    lines=[line for line in r.stdout.splitlines() if line.startswith('{')]
    value=json.loads(lines[-1]) if lines else {}
    if r.returncode: raise RuntimeError(f'CLI exit {r.returncode}: '+str(value.get('error','查看本地任务日志以恢复，不自动重试')))
    return value

def run(asset,kind):
    if (p.read(p.WORK/'control.json') or {}).get('paused',True): raise RuntimeError('生成仍暂停')
    if asset not in ('dog','tree') and not p.valid_pilot_approval(): raise RuntimeError('先验收狗狗/松树样板')
    if kind=='texture' and not p.valid_geometry_approval(asset): raise RuntimeError('先验收本版本灰模')
    target=p.PUBLIC/asset/(kind+'.glb'); recpath=p.WORK/asset/(kind+'.json')
    if target.exists(): p.glb_summary(target); print(asset,kind,'已有文件，跳过'); return
    if recpath.exists(): raise RuntimeError('已有任务记录，先恢复已有 task_id，禁止自动重提')
    balance=cli(['balance']); estimate=p.credit_estimate(asset,kind)
    if balance['balance']<estimate: raise RuntimeError('可用积分不足')
    p.save(p.WORK/'balance.json',{'checked_at':time.time(),**balance})
    folder=p.WORK/asset/('cli-'+kind); folder.mkdir(parents=True,exist_ok=True)
    spec=p.SPECS[asset]
    if kind=='geometry':
        args=['make',str(p.ROOT/spec['reference']),'-p','texture=false','-p','pbr=false',
              '-p','geometry_quality='+('detailed' if spec['detail'] else 'standard'),'-p','face_limit='+str(spec['faces']),
              '-p','auto_size=false','-p','enable_image_autofix=false','--seed',str(41023+list(p.SPECS).index(asset)*10000)]
    else:
        geometry=p.read(p.WORK/asset/'geometry.json')
        uploaded=cli(['files','upload',str(p.ROOT/spec['reference'])])
        token=uploaded.get('file_token') or uploaded.get('data',{}).get('file_token')
        if not token: raise RuntimeError('上传参考图未返回 file_token，停止纹理提交')
        args=['model','texture',geometry['task_id'],'--texture-quality','detailed','--texture-alignment','original_image',
              '-p','model=v3.5-20260815','-p','pbr=true','-p','delight=true',
              '-p','texture_prompt='+json.dumps({'image':{'file_token':token}})]
    args+=['--out',str(folder),'--name',f'island-{asset}-{kind}-r1','--timeout','1800','--json','--no-open']
    record={'asset':asset,'kind':kind,'status':'submitting','created_at':time.time(),'runner':'official-cli-0.7.2',
            'estimated_credits':estimate,'reference_sha256':hashlib.sha256((p.ROOT/spec['reference']).read_bytes()).hexdigest(),
            'cli_args':args,'balance_before':balance}
    p.save(recpath,record)
    print(json.dumps({'asset':asset,'kind':kind,'status':'submitted_to_cli','estimate':estimate}),flush=True)
    with (folder/'stdout.jsonl').open('w') as out,(folder/'progress.log').open('w') as err:
        result=subprocess.run(['tripo',*args],stdout=out,stderr=err)
    lines=[line for line in (folder/'stdout.jsonl').read_text().splitlines() if line.startswith('{')]
    value=json.loads(lines[-1]) if lines else {}
    record['cli_exit_code']=result.returncode
    if value.get('task_id'): record['task_id']=value['task_id']
    if result.returncode:
        record['status']='outcome_unknown'; record['error']=str(value.get('error','检查 CLI 日志与历史任务'))
        p.save(recpath,record); raise RuntimeError(f'{asset} CLI exit {result.returncode}，不自动重试')
    record.update(status=value.get('status','unknown'),credits_consumed=value.get('credits_consumed'),completed_at=time.time())
    p.save(recpath,record)
    if record['status']!='success': raise RuntimeError('任务未成功，保留记录')
    source=Path(value['model_file'])
    info=p.glb_summary(source)
    target.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(source,target)
    record.update(local_file=str(target.relative_to(p.ROOT)),model_info=info)
    p.save(recpath,record); p.catalog()
    print(json.dumps({'asset':asset,'kind':kind,'status':'success','task_id':record['task_id'],'credits':record['credits_consumed'],**info}),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--assets',nargs='+',choices=list(p.SPECS),required=True); parser.add_argument('--kind',choices=['geometry','texture'],required=True)
    args=parser.parse_args(); p.WORK.mkdir(parents=True,exist_ok=True)
    with (p.WORK/'.generation.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        for asset in args.assets: run(asset,args.kind)
