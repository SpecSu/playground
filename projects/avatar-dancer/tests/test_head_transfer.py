import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('head_transfer',Path(__file__).parents[1]/'scripts/head_transfer.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class HeadTransferTest(unittest.TestCase):
 def test_neck_blend_clamps_and_normalizes(self):
  self.assertEqual(m.neck_weights(.7,.8,.03),(0,1));self.assertEqual(m.neck_weights(.9,.8,.03),(1,0));h,n=m.neck_weights(.815,.8,.03);self.assertAlmostEqual(h,.5);self.assertAlmostEqual(h+n,1)
 def test_target_mask_keeps_shoulder_even_above_cut(self):
  self.assertFalse(m.target_head_mask(.86,0.1,0.0,.80));self.assertTrue(m.target_head_mask(.86,.9,0,.80));self.assertFalse(m.target_head_mask(.79,.9,0,.80))
 def test_collar_weighted_to_neck_is_not_deleted(self):
  self.assertFalse(m.target_head_mask(.83,.1,.9,.80))
 def test_uv_packing_preserves_aspect_and_nonoverlap(self):
  rects=[(.2,.3),(.1,.15),(.25,.1)];positions,gain=m.pack_rectangles(rects,128,3)
  self.assertGreater(gain,0)
  for i,(x,y,w,h) in enumerate(positions):
   self.assertGreaterEqual(x,0);self.assertGreaterEqual(y,0);self.assertLessEqual(x+w,128);self.assertLessEqual(y+h,128)
   for j,(xx,yy,ww,hh) in enumerate(positions):
    if j>i:self.assertTrue(x+w<=xx or xx+ww<=x or y+h<=yy or yy+hh<=y)
if __name__=='__main__':unittest.main()
