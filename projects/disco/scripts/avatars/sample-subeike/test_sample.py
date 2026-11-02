"""Structural tests for the isolated redesign. Run inside Blender after generation."""
import bpy, unittest, math, json, argparse, sys
from pathlib import Path
from mathutils import Vector

parser=argparse.ArgumentParser();parser.add_argument('--output-dir',type=Path,default=Path(__file__).resolve().parent/'generated')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT=args.output_dir.resolve()

class SampleTests(unittest.TestCase):
    def setUp(self):
        if not (ROOT/'subeike-sample.blend').exists():
            self.fail('The isolated sample has not been generated yet')
        bpy.ops.wm.open_mainfile(filepath=str(ROOT/'subeike-sample.blend'))

    def test_continuous_single_head_has_no_overlaid_jaw(self):
        head=bpy.data.objects.get('Head_continuous')
        self.assertIsNotNone(head)
        self.assertFalse(any('jaw' in ob.name.lower() for ob in bpy.data.objects))
        self.assertGreater(len(head.data.vertices),500)
        import bmesh
        bm=bmesh.new();bm.from_mesh(head.data)
        self.assertTrue(all(edge.is_manifold for edge in bm.edges))
        remaining=set(bm.verts);components=0
        while remaining:
            queue=[remaining.pop()];components+=1
            while queue:
                vertex=queue.pop()
                for edge in vertex.link_edges:
                    other=edge.other_vert(vertex)
                    if other in remaining:remaining.remove(other);queue.append(other)
        self.assertEqual(components,1)
        bm.free()

    def test_visible_mouth_conforms_outside_head(self):
        head=bpy.data.objects.get('Head_continuous');mouth=bpy.data.objects.get('Smile_opening')
        self.assertIsNotNone(mouth)
        visible=0
        for vertex in mouth.data.vertices:
            co=vertex.co
            hit,point,normal,index=head.ray_cast(Vector((co.x,-2,co.z)),Vector((0,1,0)))
            self.assertTrue(hit)
            if co.y < point.y-.001:visible+=1
        self.assertGreaterEqual(visible/len(mouth.data.vertices),.98)
        self.assertGreater(max(v.co.x for v in mouth.data.vertices)-min(v.co.x for v in mouth.data.vertices),.16)

    def test_material_hierarchy_and_compact_shoulders(self):
        roughness={name:bpy.data.materials[name].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value for name in ('Skin_peach','Hair_chestnut','Jacket_ivory','Graphic_ink')}
        self.assertGreater(roughness['Jacket_ivory']-roughness['Hair_chestnut'],.25)
        head=bpy.data.objects['Head_continuous'];head_width=max(v.co.x for v in head.data.vertices)-min(v.co.x for v in head.data.vertices)
        self.assertGreater(head_width,.66)
        arm=bpy.data.objects['subeike_rig']
        self.assertLess(abs(arm.data.bones['upperArm_L'].head_local.x),.265)

    def test_real_rig_and_normalized_skin(self):
        arm=bpy.data.objects['subeike_rig']
        names=['root','hips','spine','chest','neck','head']+[f'{joint}_{side}' for side in ('L','R') for joint in ('upperArm','forearm','hand','thigh','shin','foot')]
        self.assertTrue(set(names).issubset(set(arm.data.bones.keys())))
        blend=0
        for ob in bpy.data.objects:
            if ob.type!='MESH' or not ob.get('avatar_part'):continue
            self.assertTrue(any(m.type=='ARMATURE' and m.object==arm for m in ob.modifiers),ob.name)
            for v in ob.data.vertices:
                self.assertAlmostEqual(sum(g.weight for g in v.groups),1,places=4)
                if len([g for g in v.groups if g.weight>.01])>1:blend+=1
        self.assertGreater(blend,100)

    def test_hair_crown_has_no_open_top_ring(self):
        import bmesh
        bm=bmesh.new();bm.from_mesh(bpy.data.objects['Hair_cap'].data)
        high_boundary=[v for e in bm.edges if e.is_boundary for v in e.verts if v.co.z>1.9]
        self.assertEqual(len(high_boundary),0,'hairline may be open against skin; crown must be closed')
        bm.free()

    def test_toe_seams_are_outside_the_shoe_surface(self):
        for side in ('L','R'):
            shoe=bpy.data.objects['Sneaker_'+side];seam=bpy.data.objects['Toe_seam_'+side]
            checked=visible=0
            for vertex in seam.data.vertices:
                co=vertex.co
                hit,point,normal,index=shoe.ray_cast(Vector((co.x,-2,co.z)),Vector((0,1,0)))
                if hit:
                    checked+=1
                    if co.y<point.y-.0005:visible+=1
            self.assertGreater(checked,10)
            self.assertGreater(visible/checked,.70,'a sneaker seam should read as a continuous surface detail')

    def test_graphic_nose_and_lids_are_surface_conforming_not_tubes(self):
        self.assertIsNone(bpy.data.objects.get('Nose'))
        for name in ('Graphic_nose','Upper_eyelid_-1','Upper_eyelid_1'):
            ob=bpy.data.objects.get(name);self.assertIsNotNone(ob)
            material=ob.data.materials[0]
            self.assertGreater(material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value,.7)
            head=bpy.data.objects['Head_continuous']
            for v in ob.data.vertices:
                hit,point,normal,index=head.ray_cast(Vector((v.co.x,-2,v.co.z)),Vector((0,1,0)))
                self.assertTrue(hit)
                self.assertLess(point.y-v.co.y,.023,'facial graphics should hug the skin')

    def test_concave_facial_strokes_do_not_fill_their_negative_space(self):
        for name in ('Graphic_nose','Upper_eyelid_-1','Upper_eyelid_1','Brow_-1','Brow_1'):
            ob=bpy.data.objects[name]
            self.assertIn('outline_area',ob)
            area=0
            for p in ob.data.polygons:
                vs=[ob.data.vertices[i].co for i in p.vertices]
                area+=abs(sum(vs[i].x*vs[(i+1)%len(vs)].z-vs[(i+1)%len(vs)].x*vs[i].z for i in range(len(vs)))/2)
            self.assertAlmostEqual(area,ob['outline_area'],delta=ob['outline_area']*.025)

    def test_hair_roots_taper_under_crown_without_cutoff_caps(self):
        for name in ('Hair_sweep_main','Hair_sweep_front','Hair_fringe_center','Hair_part_right','Hair_crown_plane'):
            ob=bpy.data.objects[name]
            ring=[v.co for v in list(ob.data.vertices)[:14]];center=sum(ring,Vector())/len(ring)
            self.assertLess(max((co-center).length for co in ring),.005)

    def test_jacket_back_covers_shirt_and_hair_covers_rear_head(self):
        shirt=bpy.data.objects['Tee'];backs=[o for o in bpy.data.objects if o.name.startswith('Jacket_back')]
        for x in (-.08,0,.08):
            for z in (.80,.95,1.05):
                origin=Vector((x,2,z));direction=Vector((0,-1,0))
                hit,point,normal,index=shirt.ray_cast(origin,direction);self.assertTrue(hit)
                cover=[]
                for ob in backs:
                    found,p,_,_=ob.ray_cast(origin,direction)
                    if found:cover.append(p.y)
                self.assertTrue(cover)
                self.assertGreater(max(cover),point.y+.006)
        origin=Vector((0,2,1.48));direction=Vector((0,-1,0))
        skin,sp,_,_=bpy.data.objects['Head_continuous'].ray_cast(origin,direction)
        hair,hp,_,_=bpy.data.objects['Hair_cap'].ray_cast(origin,direction)
        self.assertTrue(skin and hair)
        self.assertGreater(hp.y,sp.y+.006)

suite=unittest.defaultTestLoader.loadTestsFromTestCase(SampleTests)
result=unittest.TextTestRunner(verbosity=2).run(suite)
if not result.wasSuccessful():raise SystemExit(1)
