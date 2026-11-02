# 我的分身：Jiaxin 基础资产（v7，2026-10-29）

仅黑色长袖 T、白裤、皮鞋基础造型。其他妆造仅定制面板，没有额外生成或扣除 Tripo 积分。

## 当前实现
原照片直接生成的独立头部已获用户方向认可，以统一比例和刚体位置接入修正后的身体。没有继续使用被拒绝的 v5 压缩头形。肩线、腰线、腿长由原生身体与骨骼同步调整；保留实际黑色圆领，采用闭合连续蒙皮颈部过渡。只对后发际线少量异常碎片做限定清理，脸、耳、发顶保留接受的几何形状。

## 文件和预算
- public/assets/characters/jiaxin-0.glb：2K diffuse / 1K data，约8.75MB。
- public/assets/characters/jiaxin-0_low.glb：1K diffuse / 512 data，约5MB。
- public/assets/thumbs/jiaxin-0.webp：384×512，实际成品模型32采样离线渲染。
- 63,067三角形，4材质绘制批次，23骨骼，dance_01/03/05。
- manifest height=1.9；restPose=dance_01@3.475s，下垂手臂取同段1s。
- 贴图解码RGBA+mips预算约69.33/17.33MiB（估算，不是实测VRAM/FPS）。

## 验证
qa/jiaxin-v7 保存最终哈希、贴图优化、原身份/衣物几何UV、跨引擎蒙皮及shading-only比较。
最终桥接严格非邻接三角形内部交叉为0；最终shading修订相对通过版本的POSITION、indices、UV、骨骼、权重和动画完全相同。
保护区10,864个头部顶点对原头统一变换最大误差3.35e-7；24,047原身体保留顶点误差3.74e-7，UV误差2.99e-8。
高低清只压缩贴图，非图像数据一致。Three/Blender蒙皮采样通过；三舞姿与前侧后颈实际渲染已审阅。
不声称所有原衣物权重/法线逐字节相同：焊接/导出有约1%的局部权重差，部分边界法线有微量变化；几何、UV和实际舞姿通过。

## 来源与复现
scripts/jiaxin_v7 保存隔离复现脚本，ENCORE_WORKSPACE指定私有工作根。原始头直接从授权用户原照生成，Tripo task f0b85273-d78c-4917-9c96-f1acac19c960，本次40积分，B余额1325；没有额外rig或舞蹈费用。
原照片、密钥和聊天不进入public/dist。模型是近似分身，不承诺照片级身份完全一致；离线验证不等同真实WebGL帧率测试。
历史被拒绝记录单独标记在JIAXIN_ASSETS_REJECTED_V5.md，不能用于当前验收。
