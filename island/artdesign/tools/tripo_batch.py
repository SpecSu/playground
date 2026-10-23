"""Bounded independent jobs; one global process lock and persistent per-asset journals."""
import argparse,fcntl,json,sys
from concurrent.futures import ThreadPoolExecutor,as_completed
import tripo_pipeline as p
parser=argparse.ArgumentParser();parser.add_argument('--kind',choices=['geometry','texture'],required=True);parser.add_argument('--assets',nargs='+',choices=list(p.SPECS),required=True);parser.add_argument('--execute',action='store_true');args=parser.parse_args()
if len(set(args.assets))!=len(args.assets):parser.error('Duplicate asset IDs are forbidden')
if not args.execute:print(json.dumps(p.plan(args.assets),ensure_ascii=False));sys.exit(0)
errors=[]
with (p.WORK/'.generation.lock').open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 with ThreadPoolExecutor(max_workers=2) as pool:
  jobs={pool.submit(p.run,a,args.kind):a for a in args.assets}
  for f in as_completed(jobs):
   try:f.result()
   except Exception as e:
    msg=str(e);key=p.os.environ.get('TRIPO_API_KEY','');msg=msg.replace(key,'[REDACTED]') if key else msg
    errors.append({'asset':jobs[f],'error':msg})
for e in errors:print(json.dumps(e,ensure_ascii=False))
sys.exit(bool(errors))
