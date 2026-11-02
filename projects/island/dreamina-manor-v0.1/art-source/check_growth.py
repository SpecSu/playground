import bpy,runpy
from pathlib import Path
path=Path(__file__).parent/'build_botanical.py';a=runpy.run_path(str(path));a['reset']();root=a['radish']();scene=bpy.context.scene
for frame,label in ((1,'sprout'),(51,'half'),(101,'mature')):
 scene.frame_set(frame)
 # The camera is generated per frame, but artwork/root remain identical.
 a['render'](root,a['EVIDENCE']/('radish-'+label+'-detail.png'),size=512,with_tile=False)
 for ob in list(bpy.data.objects):
  if ob.type in ('LIGHT','CAMERA') or ob.name=='preview ocean':bpy.data.objects.remove(ob,do_unlink=True)
