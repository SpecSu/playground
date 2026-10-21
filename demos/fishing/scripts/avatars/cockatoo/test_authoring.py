"""Authoring geometry, rig and semantic assertions. Run inside Blender."""
import bpy,bmesh,unittest,math,argparse,sys
from mathutils import Vector
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--input-dir',type=Path);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]if '--'in sys.argv else[])
ROOT=(args.input_dir or Path(__file__).resolve().parent/'generated').resolve()
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'dj-cockatoo.blend'))
class CockatooTests(unittest.TestCase):
 def test_every_authored_surface_is_closed_and_outward(self):
  parts=[ob for ob in bpy.data.objects if ob.type=='MESH'and ob.get('avatar_part')];self.assertGreater(len(parts),55)
  for ob in parts:
   bm=bmesh.new();bm.from_mesh(ob.data)
   self.assertTrue(all(e.is_manifold for e in bm.edges),ob.name)
   self.assertGreater(bm.calc_volume(signed=True),0,ob.name);bm.free()
 def test_body_neck_head_is_one_connected_surface(self):
  ob=bpy.data.objects.get('Body_neck_head_continuous');self.assertIsNotNone(ob)
  self.assertIsNone(bpy.data.objects.get('Neck_soft_mantle'))
  bm=bmesh.new();bm.from_mesh(ob.data);remaining=set(bm.verts);components=0
  while remaining:
   queue=[remaining.pop()];components+=1
   while queue:
    v=queue.pop()
    for edge in v.link_edges:
     other=edge.other_vert(v)
     if other in remaining:remaining.remove(other);queue.append(other)
  self.assertEqual(components,1);bm.free()
 def test_named_crest_sunglasses_and_hook_are_authored(self):
  self.assertEqual(len([ob for ob in bpy.data.objects if ob.name.startswith('Crest_')]),8)
  self.assertIsNotNone(bpy.data.objects.get('Beak_upper_hook'))
  self.assertEqual(len([ob for ob in bpy.data.objects if ob.name.startswith('Sunglasses_frame_')]),2)
  beak=bpy.data.objects['Beak_upper_hook'];high=[v.co for v in beak.data.vertices if v.co.z>2.17];low=[v.co for v in beak.data.vertices if v.co.z<1.89]
  self.assertLess(min(v.y for v in low),min(v.y for v in high)-.07,'lower hooked tip curves forward')
 def test_complete_bone_skin_and_vertical_axes(self):
  arm=bpy.data.objects['Cockatoo_rig'];self.assertEqual(len(arm.data.bones),19);self.assertEqual(arm.data.bones['crest'].parent.name,'head')
  for b in arm.data.bones:self.assertLess((b.tail_local-b.head_local).normalized().angle(Vector((0,0,1))),.0001)
  blend=0
  for ob in bpy.data.objects:
   if ob.type!='MESH' or not ob.get('avatar_part'):continue
   self.assertTrue(any(m.type=='ARMATURE'and m.object==arm for m in ob.modifiers),ob.name)
   for v in ob.data.vertices:
    self.assertAlmostEqual(sum(g.weight for g in v.groups),1,places=4)
    if len([g for g in v.groups if g.weight>.01])>1:blend+=1
  self.assertGreater(blend,120)
 def test_layered_articulated_wings_and_compact_tail(self):
  for side in('L','R'):
   self.assertEqual(len([o for o in bpy.data.objects if o.name.startswith('Wing_primary_'+side)]),4)
   self.assertEqual(len([o for o in bpy.data.objects if o.name.startswith('Wing_coverts_'+side)]),3)
   self.assertEqual(len([o for o in bpy.data.objects if o.name.startswith('Wing_fingertip_'+side)]),3)
   wing=bpy.data.objects['Wing_continuous_'+side];self.assertTrue({'upperArm_'+side,'forearm_'+side,'hand_'+side}.issubset(set(wing.vertex_groups.keys())))
  tail=[v.co.y for o in bpy.data.objects if o.name.startswith('Tail_feather')for v in o.data.vertices];self.assertLess(max(tail),.65)
suite=unittest.defaultTestLoader.loadTestsFromTestCase(CockatooTests);result=unittest.TextTestRunner(verbosity=2).run(suite)
if not result.wasSuccessful():raise SystemExit(1)
