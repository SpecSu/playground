# 颈部闭合与动作验证

## 根因

旧的头部复用流程只删除原头并放入供体，不缝合裁剪边界。LX 的语义裁剪还残留卫衣的黑色纹理及折返边缘；两圈顶点的黑色圆柱内领无法补齐后颈。单独给新几何换肤色仍会留下黑 U 形边缘或皮肤翻片，因此没有采用这一中间候选。

## 最终修复

- LX：从实际开放边界计算平滑的角向上包络，仅清理下颈残留；在切线处插值位置、UV、法线与骨骼权重。曲线以上的原头部顶点属性和完整三角面保留，脸、眼镜、耳朵、头发不重新生成。
- 六套：沿清理后的实际边界创建九圈连续颈部网格。上缘与供体位置及权重一致，末端深入躯干并闭合；权重平滑过渡至 Neck/Spine2，而非单绑 Head 或靠相机遮挡。
- 新颈部肤色取自现有供体皮肤纹理；LX 窄颈边界的卫衣残留单独处理，不修改原图像。吉吉的红发下缘保留红发色，小发片边界局部封口，不挤出第二根脖子；封口重合点使用同一平均权重，避免动作时裂开。
- 原身体、23 骨骼、inverse bind matrices 与三段动画不变。高质量保留现有 2K 图像；低配仍为 1K，所有非图像 bufferView 字节与对应高质量文件完全一致。

## 可复现工具

```sh
# 仅 LX 先清理；输入为修复前的 GLB，输出放在非 public 的临时目录。
python scripts/clean_neck_rim.py INPUT/lx-0.glb CLEAN/lx-0.glb
python scripts/repair_neck_attachment.py CLEAN/lx-0.glb OUTPUT/lx-0.glb
# 吉吉直接使用原 GLB。
python scripts/repair_neck_attachment.py INPUT/jiji-0.glb OUTPUT/jiji-0.glb
python scripts/optimize_glb.py OUTPUT/lx-0.glb OUTPUT/lx-0_low.glb --diffuse-max 1024 --data-max 1024
python scripts/test_neck_attachment.py OUTPUT/*.glb
blender -b --python scripts/inspect_neck_motion.py -- --input OUTPUT/lx-0.glb --output EVIDENCE/lx-0
```

`clean_neck_rim.py` 与其参数是本次 LX 专用，不能盲用于其他供体。`repair_neck_attachment.py` 拒绝未经清理的 LX 输入，避免再次挤出旧的破碎边缘。

## 验证证据与边界

- `docs/audit/neck/*-contact.jpg`：每套 22 张实际导出 GLB 回读渲染：静态四面、3 段真实舞蹈各 3 个相位 × 侧/后视角。不是 AI 图片，不是浏览器截图。
- 拓扑回归检查验证无大型开放裁剪环、上缘位置与权重匹配、权重归一化、有效 joint 索引及颈部底端深度；不是宣称整个重建模型每个微小退化面都已重新拓扑。
- 每套高/低资源还抽样 3 × 17 个动画相位，以变形后真实身体网格的射线包含率检查颈部底圈与躯干重叠。衣服为复杂重建薄壳，局部少量射线奇偶值会变化，须结合实际侧/后视图验收，不能单以某一数值宣称无穿插。
- 独立 Three.js 与 Blender 骨骼位置对照及纹理哈希记录在 `docs/audit/`。
- 既有服装领口的轻微锯齿与极端舞姿的头发/帽饰穿插不是本次完全重建对象。云浏览器没有可用 WebGL，因此不把这些离线结果称为手机实测。

本次没有调用付费模型 API、没有新生成头像、没有公开发布。
