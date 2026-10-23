"""Publish only local asset facts, hashes, and cost totals. No credentials or signed URLs."""
import json
from pathlib import Path
import tripo_pipeline as p
if not any((p.WORK/asset/(kind+'.json')).exists() for asset in p.SPECS for kind in ('geometry','texture')):
 raise SystemExit('未找到本地生成任务记录，保留现有历史 manifest。归档清单请用 build_handoff_manifest.py，不把缺失账单改写为 0 积分。')
rows=[]
for asset,spec in p.SPECS.items():
 row={'id':asset,'name':spec['name'],'reference':spec['reference'],'geometry':None,'texture':None,'display':None,'cost_credits':0}
 for kind in ('geometry','texture','display'):
  path=p.PUBLIC/asset/(kind+'.glb')
  if path.exists():row[kind]={'path':str(path.relative_to(p.ROOT)),**p.glb_summary(path)}
  if kind!='display':
   record=p.read(p.WORK/asset/(kind+'.json')) or {}
   if record.get('status')=='success':row['cost_credits']+=record.get('credits_consumed',0)
   row[kind+'_task_id']=record.get('task_id');row[kind+'_status']=record.get('status','not_submitted')
 rows.append(row)
manifest={'workflow':'0.3','asset_count':len(rows),'actual_success_credits':sum(r['cost_credits'] for r in rows),'assets':rows}
p.save(p.ROOT/'scene-lab/assets/manifest.json',manifest)
text=['# 资产清单 · Tripo 流程 v0.3','','原始几何、原始 PBR 和展示压缩版分别保留。展示版只重采样纹理，不改变拓扑、UV 或模型部件关系。','','| 资产 | 三角面 | 原始 PBR | 展示版 | 已完成任务积分 |','|---|---:|---:|---:|---:|']
for r in rows:
 g=r['geometry'] or {};t=r['texture'] or {};d=r['display'] or {}
 text.append(f"| {r['name']} | {g.get('triangles','待生成')} | {t.get('bytes',0)/1048576:.2f} MiB | {d.get('bytes',0)/1048576:.2f} MiB | {r['cost_credits']} |")
text+=['',f"已完成任务实际积分合计：{manifest['actual_success_credits']}。未完成任务不计入此数。",'','逐件路径、任务 ID、SHA-256 与材质统计见 `assets/manifest.json`。纹理优化记录在每件资产的 `display.json`。','']
(p.ROOT/'scene-lab/docs/ASSET-MANIFEST.md').write_text('\n'.join(text))
print(json.dumps({'assets':len(rows),'actual_success_credits':manifest['actual_success_credits']}))
