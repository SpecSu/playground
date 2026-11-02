import sys, math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_botanical import *
reset()
bpy.ops.import_scene.gltf(filepath=str(ROOT/'art-source/previews/gear.glb'))
root=empty('PreviewAssembly')
for o in list(bpy.context.scene.objects):
    if o!=root and not o.parent:o.parent=root
render(root,EVIDENCE/'dock-mature-offline.png',768,False)
# Existing helper frames a plant. Reframe actual full-size4.8m dock.
cam=bpy.context.scene.camera;cam.data.ortho_scale=8.7;cam.location=(7,-9,8);cam.rotation_euler=(Vector((0,-1,.7))-cam.location).to_track_quat('-Z','Y').to_euler()
bpy.context.scene.render.filepath=str(EVIDENCE/'dock-mature-offline.png');bpy.ops.render.render(write_still=True)
