// 水族箱每条鱼的屏幕包围盒（占屏宽比例 / 是否出屏 / 距镜头距离）
const aq = G.aq, cam = aq.camera || aq.cam;
const out = [];
const V = cam.position.constructor;
const v = new V(), W = innerWidth, H = innerHeight;
const fish = G.meta.tankFish();
const roots = [];
(aq.scene || aq.world)?.traverse?.((o) => { if (o.userData?.uid && fish.some((f) => f.uid === o.userData.uid)) roots.push(o); });
for (const r of roots) {
  r.updateMatrixWorld(true);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  r.traverse((o) => { if (!o.isMesh || !o.visible) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 7) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); v.project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); } });
  const f = fish.find((q) => q.uid === r.userData.uid), wp = r.getWorldPosition(new V());
  out.push(`${f.sp}(${Math.round(f.cm)}cm) 宽${((x1 - x0) / 2 * 100).toFixed(0)}%屏 中心(${((x0 + x1) / 2).toFixed(2)},${((y0 + y1) / 2).toFixed(2)}) ${x0 < -1 || x1 > 1 ? '出屏' : ''} d=${wp.distanceTo(cam.position).toFixed(1)}`);
}
return out.join('\n') || ('no roots; aq keys=' + Object.keys(aq).join(','));
