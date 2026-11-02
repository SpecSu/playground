#!/usr/bin/env python3
"""Resumable Tripo v3 client. Credentials stay in the process environment."""
import argparse
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work/tripo'
PUBLIC = ROOT / 'scene-lab/assets/models'
BASE = 'https://openapi.tripo3d.ai/v3'
SPECS = {
    'dog': {'reference':'art/v0.1/assets/dog/primary.png','faces':50000,'detail':True,'name':'狗狗'},
    'tree': {'reference':'art/v0.1/assets/tree/primary.png','faces':65000,'detail':True,'name':'松树'},
    'ground': {'reference':'art/v0.2/assets/ground/primary.png','faces':26000,'detail':False,'name':'方形地块'},
    'shrub': {'reference':'art/v0.1/assets/shrub/primary.png','faces':35000,'detail':True,'name':'花灌木'},
    'dock': {'reference':'art/v0.1/assets/dock/primary.png','faces':35000,'detail':False,'name':'码头'},
    'boat': {'reference':'art/v0.1/assets/boat/primary.png','faces':30000,'detail':False,'name':'小船'},
    'rock': {'reference':'art/v0.1/assets/rock/primary.png','faces':18000,'detail':False,'name':'岸石'},
    'fish': {'reference':'art/v0.1/assets/fish/primary.png','faces':6000,'detail':False,'name':'鱼'},
}

def credit_estimate(asset, kind):
    return (40 if SPECS[asset]['detail'] else 20) if kind == 'geometry' else 20

def plan(assets):
    """Offline only. Does not load credentials, upload images, or query the API."""
    entries=[]
    for asset in assets:
        spec=SPECS[asset]
        path=ROOT/spec['reference']
        entries.append({'asset':asset,'name':spec['name'],'reference':spec['reference'],
                        'reference_exists':path.is_file(),'face_limit':spec['faces'],
                        'geometry_credits_estimate':credit_estimate(asset,'geometry'),
                        'texture_credits_estimate':credit_estimate(asset,'texture')})
    return {'mode':'offline_plan','paused':(read(WORK/'control.json') or {}).get('paused',True),
            'assets':entries,'estimated_total_credits':sum(e['geometry_credits_estimate']+e['texture_credits_estimate'] for e in entries),
            'note':'估算非报价。先狗狗/松树灰模，验收后才做纹理；其余资产须通过首批样板门槛。'}

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.' + uuid.uuid4().hex + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(path)

def read(path):
    return json.loads(path.read_text()) if path.exists() else None

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def api(path, payload=None, binary=None, content_type=None):
    key = os.environ.get('TRIPO_API_KEY')
    if not key:
        raise RuntimeError('TRIPO_API_KEY 未加载。通过本机凭据管理器注入进程环境；不要将密钥写入源码或日志。参见 docs/02-tripo-generation.md。')
    assert path.startswith('/') and '://' not in path
    headers = {'Authorization':'Bearer ' + key}
    body = binary
    if payload is not None:
        body = json.dumps(payload).encode()
        headers['Content-Type'] = 'application/json'
    if content_type:
        headers['Content-Type'] = content_type
    req = urllib.request.Request(BASE + path, data=body, headers=headers)
    try:
        for attempt in range(3):
            try:
                with urllib.request.build_opener(NoRedirect()).open(req, timeout=90) as response:
                    value = json.load(response)
                break
            except (urllib.error.URLError, TimeoutError):
                # Reads can safely reconnect. Never retry a paid POST with unknown outcome.
                if body is not None or attempt==2: raise
                time.sleep(2*(attempt+1))
    except urllib.error.HTTPError as exc:
        message = exc.read().decode(errors='replace').replace(key, '[REDACTED]')[:1200]
        raise RuntimeError(f'Tripo HTTP {exc.code}: {message}') from None
    if value.get('code') != 0:
        raise RuntimeError('Tripo: ' + json.dumps(value, ensure_ascii=False).replace(key, '[REDACTED]')[:1200])
    return value['data']

def balance():
    value = api('/account/balance')
    save(WORK / 'balance.json', {'checked_at':time.time(), **value})
    return value

def upload(asset):
    source = ROOT / SPECS[asset]['reference']
    data = source.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    record = WORK / asset / 'upload.json'
    old = read(record)
    if old and old['sha256'] == digest:
        return old['file_token']
    assert len(data) < 20*1024*1024
    boundary = 'island-' + uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{asset}.png"\r\nContent-Type: image/png\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
    output = api('/files', binary=body, content_type='multipart/form-data; boundary=' + boundary)
    token = output['file_token']
    save(record, {'reference':SPECS[asset]['reference'],'sha256':digest,'file_token':token})
    return token

def glb_summary(path):
    data = path.read_bytes()
    if len(data)<20 or data[:4] != b'glTF':
        raise RuntimeError('下载结果不是 GLB 文件')
    version,total=struct.unpack_from('<II',data,4)
    if version != 2 or total != len(data):
        raise RuntimeError('GLB 版本或文件长度无效')
    length, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4E4F534A or 20+length>len(data):
        raise RuntimeError('GLB JSON 区块无效')
    doc = json.loads(data[20:20+length])
    if any(r.get('uri') and not r['uri'].startswith('data:') for key in ('images','buffers') for r in doc.get(key,[])):
        raise RuntimeError('GLB 包含外部资源引用；请导出内嵌纹理版本，避免不完整或意外联网。')
    tris = verts = 0
    for mesh in doc.get('meshes', []):
        for p in mesh['primitives']:
            n = doc['accessors'][p['attributes']['POSITION']]['count']
            verts += n
            if p.get('mode',4)==4:
                tris += (doc['accessors'][p['indices']]['count'] if 'indices' in p else n)//3
    return {'bytes':len(data),'triangles':tris,'vertices':verts,'meshes':len(doc.get('meshes',[])),
            'materials':len(doc.get('materials',[])),'images':len(doc.get('images',[])),
            'pbr_materials':sum('pbrMetallicRoughness' in m for m in doc.get('materials',[])),
            'normal_maps':sum('normalTexture' in m for m in doc.get('materials',[])),
            'roughness_metallic_maps':sum('metallicRoughnessTexture' in m.get('pbrMetallicRoughness',{}) for m in doc.get('materials',[])),
            'sha256':hashlib.sha256(data).hexdigest()}

def download(url, path):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise RuntimeError('拒绝非 HTTPS 的模型下载地址')
    if parsed.hostname in ('localhost','localhost.localdomain'):
        raise RuntimeError('拒绝本机模型下载地址')
    try:
        if not ipaddress.ip_address(parsed.hostname).is_global:
            raise RuntimeError('拒绝私有 IP 模型下载地址')
    except ValueError:
        pass
    # CDN downloads deliberately carry no API credential.
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read(180*1024*1024 + 1)
    if len(data)>180*1024*1024:
        raise RuntimeError('模型超过本次实验的 180 MiB 下载上限')
    path.parent.mkdir(parents=True,exist_ok=True)
    temp = path.with_suffix('.download')
    temp.write_bytes(data)
    summary = glb_summary(temp)
    temp.replace(path)
    return summary

def catalog():
    models = {}
    for asset, spec in SPECS.items():
        entry = {'name':spec['name'],'reference':'/ref/' + asset + '.png'}
        for kind in ['geometry','texture']:
            path = PUBLIC / asset / (kind + '.glb')
            if path.exists():
                entry[kind] = 'assets/models/' + asset + '/' + kind + '.glb'
                entry[kind + '_info'] = glb_summary(path)
            rec = read(WORK / asset / (kind + '.json'))
            if rec: entry[kind+'_status'] = rec.get('status','unknown')
        display=PUBLIC/asset/'display.glb'
        derivative=read(display.with_suffix('.json'))
        if display.exists() and derivative and derivative.get('source_sha256')==entry.get('texture_info',{}).get('sha256'):
            entry['texture_original']=entry.get('texture')
            entry['texture']='assets/models/'+asset+'/display.glb'
            entry['texture_info']=glb_summary(display)
        runtime=PUBLIC/asset/'runtime.glb'
        reduced=read(runtime.with_suffix('.json'))
        if runtime.exists() and reduced and reduced.get('source_sha256')==entry.get('texture_info',{}).get('sha256'):
            info=glb_summary(runtime)
            if info['sha256']==reduced.get('output_sha256'):
                entry['runtime']='assets/models/'+asset+'/runtime.glb'
                entry['runtime_info']=info
                compact=PUBLIC/asset/'compact.glb'
                compressed=read(compact.with_suffix('.json'))
                if compact.exists() and compressed and compressed.get('source_sha256')==info['sha256']:
                    compact_info=glb_summary(compact)
                    if compact_info['sha256']==compressed.get('output_sha256'):
                        entry['compact']='assets/models/'+asset+'/compact.glb'
                        entry['compact_info']=compact_info
        models[asset] = entry
    save(ROOT / 'scene-lab/assets/catalog.json', {'version':'0.3','updated_at':time.time(),
         'paused':(read(WORK/'control.json') or {}).get('paused',True),'models':models})
    return models

def valid_geometry_approval(asset):
    approval=read(WORK/asset/'geometry-approved.json')
    path=PUBLIC/asset/'geometry.glb'
    return bool(approval and path.exists() and approval.get('model_sha256')==hashlib.sha256(path.read_bytes()).hexdigest())

def valid_pilot_approval():
    approval=read(WORK/'pilot-approved.json')
    if not approval: return False
    for asset in ('dog','tree'):
        p=PUBLIC/asset/'texture.glb'
        if not valid_geometry_approval(asset) or not p.exists(): return False
        if approval.get('texture_sha256',{}).get(asset)!=hashlib.sha256(p.read_bytes()).hexdigest(): return False
    return True

def evidence_records(evidence):
    screenshots=[]
    for name in evidence:
        p=Path(name).resolve()
        if not p.is_file() or p.suffix.lower() not in ('.png','.jpg','.jpeg','.webp'):
            raise RuntimeError('验收证据必须是已保存的真实截图文件')
        screenshots.append({'file':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    return screenshots

def approve(asset, evidence, notes):
    path=PUBLIC/asset/'geometry.glb'
    info=glb_summary(path)
    screenshots=evidence_records(evidence)
    save(WORK/asset/'geometry-approved.json',{'model_sha256':info['sha256'],'reviewed_at':time.time(),
         'evidence':screenshots,'review_notes':notes,'scope':'geometry_only'})

def approve_pilot(evidence, notes):
    hashes={}
    for asset in ('dog','tree'):
        if not valid_geometry_approval(asset): raise RuntimeError(asset+' 灰模未通过或版本已变更')
        hashes[asset]=glb_summary(PUBLIC/asset/'texture.glb')['sha256']
    if len(evidence)<3: raise RuntimeError('首批样板至少保存中性光、暖阳、竖屏三类真实截图')
    save(WORK/'pilot-approved.json',{'texture_sha256':hashes,'reviewed_at':time.time(),
         'evidence':evidence_records(evidence),'review_notes':notes})

def run(asset, kind):
    if (read(WORK/'control.json') or {}).get('paused',True):
        raise RuntimeError('生成已暂停。此时不查询余额、不上传、不创建任务。确认用户恢复后使用 resume。')
    folder = WORK / asset
    record_path = folder / (kind + '.json')
    record = read(record_path)
    out_path = PUBLIC / asset / (kind + '.glb')
    if out_path.exists():
        print(asset, kind, '已存在，跳过重复计费', flush=True)
        return
    if asset not in ('dog','tree') and not valid_pilot_approval():
        raise RuntimeError('先完成狗狗、松树的灰模、材质与浏览器样板验收，再生成其余资产。')
    if kind == 'texture' and not valid_geometry_approval(asset):
        raise RuntimeError(asset + ' 尚未记录灰模截图验收；停止纹理任务。')
    if record and record.get('status') in ('submitting','outcome_unknown'):
        raise RuntimeError('上次提交结果未知：先核对 Tripo 任务，禁止自动重复付费提交。')
    if record and record.get('status') in ('failed','cancelled','banned'):
        raise RuntimeError('此前任务失败。先检查失败记录，明确修订参数后再建立新版本任务。')
    if not record or not record.get('task_id'):
        spec = SPECS[asset]
        if kind=='texture':
            geometry=read(folder/'geometry.json')
            if not geometry or geometry.get('status')!='success': raise RuntimeError('几何任务尚未完成')
        estimate = credit_estimate(asset,kind)
        available = balance().get('balance',0)
        if available < estimate:
            raise RuntimeError(f'API 可用积分 {available}，本任务预估至少 {estimate}，尚未提交。')
        token = upload(asset)
        if kind=='geometry':
            endpoint = '/generation/image-to-model'
            payload = {'input':token,'model':'v3.1-20260211','texture':False,'pbr':False,
                       'face_limit':spec['faces'],'geometry_quality':'detailed' if spec['detail'] else 'standard',
                       'auto_size':False,'quad':False,'enable_image_autofix':False}
        else:
            geometry = read(folder/'geometry.json')
            if not geometry or geometry.get('status')!='success': raise RuntimeError('几何任务尚未完成')
            endpoint = '/models/texture'
            payload = {'input':geometry['task_id'],'model':'v3.5-20260815','texture_quality':'detailed',
                       'pbr':True,'delight':True,'texture_alignment':'original_image',
                       'texture_prompt':{'image':{'file_token':token}}}
        record = {'asset':asset,'kind':kind,'status':'submitting','created_at':time.time(),
                  'endpoint':endpoint,'request':payload,'estimated_credits':estimate}
        save(record_path,record)
        try:
            created = api(endpoint,payload)
        except Exception:
            record['status']='outcome_unknown'
            save(record_path,record)
            raise
        record.update(task_id=created['task_id'],status='queued')
        save(record_path,record)
        print(json.dumps({'asset':asset,'kind':kind,'task_id':record['task_id'],'status':'queued'}),flush=True)
    deadline = time.monotonic()+1200
    last = None
    while time.monotonic()<deadline:
        result = api('/tasks/' + urllib.parse.quote(record['task_id'],safe=''))
        status = result['status']
        record.update(status=status,progress=result.get('progress',0),checked_at=time.time())
        for field in ['credits_consumed','error_code','error_message','normalize_scale']:
            if field in result: record[field]=result[field]
        save(record_path,record)
        current=(status,result.get('progress',0))
        if current!=last:
            print(json.dumps({'asset':asset,'kind':kind,'status':status,'progress':current[1]},ensure_ascii=False),flush=True)
            last=current
        if status=='success':
            output=result.get('output',{})
            url=output.get('model_url')
            if not url: raise RuntimeError('任务成功但缺少文档规定的 model_url；保留任务记录供检查。')
            summary=download(url,out_path)
            record['local_file']=str(out_path.relative_to(ROOT))
            record['model_info']=summary
            save(record_path,record)
            catalog()
            print(json.dumps({'asset':asset,'kind':kind,'saved':str(out_path.relative_to(ROOT)),**summary},ensure_ascii=False),flush=True)
            return
        if status in ('failed','cancelled','banned'):
            catalog()
            raise RuntimeError(asset+' '+kind+' '+status+': '+str(record.get('error_message','')))
        time.sleep(5)
    raise RuntimeError('本轮轮询已到 20 分钟，任务记录已保留；下次运行将接续查询，不重复提交。')

def main():
    parser=argparse.ArgumentParser()
    sub=parser.add_subparsers(dest='command',required=True)
    sub.add_parser('balance')
    sub.add_parser('catalog')
    planned=sub.add_parser('plan')
    planned.add_argument('--assets',nargs='+',choices=list(SPECS),default=list(SPECS))
    sub.add_parser('pause')
    sub.add_parser('resume')
    approved=sub.add_parser('approve-geometry')
    approved.add_argument('--asset',choices=list(SPECS),required=True)
    approved.add_argument('--evidence',nargs='+',required=True)
    approved.add_argument('--notes',required=True)
    pilot=sub.add_parser('approve-pilot')
    pilot.add_argument('--evidence',nargs='+',required=True)
    pilot.add_argument('--notes',required=True)
    generate=sub.add_parser('generate')
    generate.add_argument('--kind',choices=['geometry','texture'],required=True)
    generate.add_argument('--assets',nargs='+',choices=list(SPECS),required=True)
    generate.add_argument('--execute',action='store_true',help='明确提交付费任务；省略时仅离线显示计划')
    args=parser.parse_args()
    if args.command=='balance': print(json.dumps(balance(),ensure_ascii=False))
    elif args.command=='catalog': print(json.dumps(catalog(),ensure_ascii=False))
    elif args.command=='plan': print(json.dumps(plan(args.assets),ensure_ascii=False,indent=2))
    elif args.command in ('pause','resume'):
        save(WORK/'control.json',{'paused':args.command=='pause','updated_at':time.time()})
        catalog()
        print('生成已暂停' if args.command=='pause' else '暂停已解除；仍需 generate --execute 才提交任务')
    elif args.command=='approve-geometry':
        approve(args.asset,args.evidence,args.notes)
        print('已记录灰模检查；记录本身不代替实际看图验收')
    elif args.command=='approve-pilot':
        approve_pilot(args.evidence,args.notes)
        print('已记录首批样板检查；后续资产仍逐件验收')
    elif not args.execute: print(json.dumps(plan(args.assets),ensure_ascii=False,indent=2))
    else:
        WORK.mkdir(parents=True,exist_ok=True)
        with (WORK/'.generation.lock').open('w') as lock:
            try: fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: raise RuntimeError('另一生成进程正在运行。禁止并发重复提交。') from None
            for asset in args.assets: run(asset,args.kind)

if __name__=='__main__':
    try: main()
    except Exception as exc:
        key=os.environ.get('TRIPO_API_KEY','')
        message=str(exc)
        if key: message=message.replace(key,'[REDACTED]')
        print(message,file=sys.stderr)
        sys.exit(1)
