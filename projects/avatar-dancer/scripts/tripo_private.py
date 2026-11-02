"""Private build utility. Credentials only enter hidden stdin, never saved."""
import argparse,getpass,json,pathlib,time,urllib.request,urllib.error,uuid
p=argparse.ArgumentParser();p.add_argument('command');p.add_argument('--account',default='A');p.add_argument('--input');p.add_argument('--payload');p.add_argument('--name',default='task');a=p.parse_args()
BASE={'A':'https://openapi.tripo3d.ai/v3','B':'https://openapi.tripo3d.com/v3'}[a.account]
key=getpass.getpass('Tripo key: ')
root=pathlib.Path(__file__).resolve().parents[2]/'dance-stage-work'/'tripo';root.mkdir(parents=True,exist_ok=True)
def call(path,data=None,content='application/json'):
    req=urllib.request.Request(BASE+path,data=data,headers={'Authorization':'Bearer '+key,'Content-Type':content})
    try:r=json.loads(urllib.request.urlopen(req,timeout=120).read())
    except urllib.error.HTTPError as e:
        print(e.read().decode(),flush=True);raise SystemExit(2)
    if r.get('code')!=0:print(json.dumps(r),flush=True);raise SystemExit(2)
    return r
def save(label,r):
    (root/(a.account+'-'+label+'.json')).write_text(json.dumps(r,indent=2))
    d=r.get('data',{}); print(json.dumps({'account':a.account,'label':label,'data':{k:v for k,v in d.items() if k not in ['input','output']},'output_keys':list(d.get('output',{}))}),flush=True)
if a.command=='balance':save('balance',call('/account/balance'))
elif a.command=='upload':
    f=pathlib.Path(a.input);b='----Tripo'+uuid.uuid4().hex
    data=(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{f.name}"\r\nContent-Type: image/png\r\n\r\n').encode()+f.read_bytes()+f'\r\n--{b}--\r\n'.encode()
    save(a.name,call('/files',data,'multipart/form-data; boundary='+b))
elif a.command=='create':
    payload=json.loads(a.payload); endpoint=payload.pop('_endpoint')
    save(a.name,call(endpoint,json.dumps(payload).encode()))
elif a.command=='query':save(a.name,call('/tasks/'+a.input))
elif a.command=='monitor':
    while True:
        r=call('/tasks/'+a.input);save(a.name+'-status',r);d=r['data']
        if d['status'] in ['success','failed','cancelled']:
            if d['status']=='success':
                urllib.request.urlretrieve(d['output']['model_url'],root/(a.name+'.glb'))
                if d['output'].get('rendered_image_url'):urllib.request.urlretrieve(d['output']['rendered_image_url'],root/(a.name+'-preview.webp'))
            save('balance',call('/account/balance'));break
        time.sleep(15)
elif a.command=='pipeline':
    from concurrent.futures import ThreadPoolExecutor,as_completed
    spec=json.loads(pathlib.Path(a.input).read_text());jobs=spec['jobs']
    if len(jobs)*95>spec['budget'] or spec['budget']>380:raise SystemExit('Budget guard failed')
    def run(job):
        name=job['name']
        def post(label,endpoint,payload):
            marker=root/(a.account+'-'+name+'-'+label+'-intent.json')
            if marker.exists():raise RuntimeError('Existing intent: reconcile before retry '+str(marker))
            marker.write_text(json.dumps({'endpoint':endpoint,'payload':payload,'state':'submitting'}))
            r=call(endpoint,json.dumps(payload).encode());save(name+'-'+label,r)
            tid=r['data']['task_id'];marker.write_text(json.dumps({'task_id':tid,'state':'accepted'}))
            while True:
                result=call('/tasks/'+tid);d=result['data'];save(name+'-'+label+'-status',result)
                if d['status'] in ['success','failed','cancelled']:
                    if d['status']!='success':raise RuntimeError(name+' '+label+' '+d['status'])
                    return tid,d
                time.sleep(15)
        f=pathlib.Path(job['path']);b='----Tripo'+uuid.uuid4().hex
        data=(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{f.name}"\r\nContent-Type: image/png\r\n\r\n').encode()+f.read_bytes()+f'\r\n--{b}--\r\n'.encode()
        uploaded=call('/files',data,'multipart/form-data; boundary='+b);save(name+'-upload',uploaded)
        tid,d=post('model','/generation/image-to-model',{'input':uploaded['data']['file_token'],'model':'v3.1-20260211','texture':True,'pbr':True,'texture_quality':'detailed','face_limit':50000})
        urllib.request.urlretrieve(d['output']['model_url'],root/(name+'-base.glb'))
        if d['output'].get('rendered_image_url'):urllib.request.urlretrieve(d['output']['rendered_image_url'],root/(name+'-preview.webp'))
        _,check=post('check','/animations/rig-check',{'input':tid})
        if not check['output'].get('riggable') or check['output'].get('rig_type')!='biped':raise RuntimeError(name+' rig check failed')
        rid,rig=post('rig','/animations/rig',{'input':tid,'model':'v1.0-20240301','rig_type':'biped','spec':'mixamo','out_format':'glb'})
        aid,anim=post('dances','/animations/retarget',{'input':rid,'animations':['preset:biped:dance_01','preset:biped:dance_03','preset:biped:dance_05'],'out_format':'glb','animate_in_place':True,'export_with_geometry':True})
        urllib.request.urlretrieve(anim['output']['model_url'],root/(name+'-dances.glb'))
        return name
    with ThreadPoolExecutor(max_workers=2) as pool:
        for future in as_completed([pool.submit(run,j) for j in jobs]):
            try:print('PIPELINE_COMPLETE '+future.result(),flush=True)
            except BaseException as e:print('PIPELINE_BLOCKED '+str(e),flush=True)
    save('balance',call('/account/balance'))
