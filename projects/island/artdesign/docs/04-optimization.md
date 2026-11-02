# 04 · 减面与贴图压缩

## 派生链与不变量

```text
geometry.glb  原始几何
    ↓ 基于通过的几何生成 PBR
texture.glb   原始带贴图高精资产
    ↓ prepare_display_glb.py
 display.glb  为屏幕尺寸调整贴图，几何/UV 不变
    ↓ mesh-tools/simplify.mjs
 runtime.glb  减面，保留 display 的贴图字节
    ↓ compress_glb_textures.py
 compact.glb  优化编码，几何和贴图分辨率不变
```

每阶段保留源文件、参数、source/output SHA-256、前后体积与检查结果。catalog 只接入哈希匹配的派生版本。一次优化只改变被验证的维度，比较时冻结机位、灯光、DPR 与动画时间。

## 准备离线工具

使用 Node.js 24.9.0 与 Python 3.12 基线；预览本身不需要这些额外包。

```sh
npm --prefix tools/mesh-tools ci --ignore-scripts
python3.12 -m venv work/texture-env
work/texture-env/bin/python -m pip install -r tools/texture-requirements.txt
```

### A. 展示贴图尺寸

原始 4K PBR 对小岛屏幕占比过大。当前角色/树基础色 2048、数据图 1024；普通物件 1024/512；鱼 512/256。`prepare_display_glb.py` 对法线降采样后重新归一化，颜色 JPEG quality 93、4:4:4，数据 PNG。透明基础色保留 alpha。按资产真实屏幕需求选择，不能机械套用所有场景。

```sh
work/texture-env/bin/python tools/prepare_display_glb.py scene-lab/assets/models/*/texture.glb
```

生成 display.glb；它是派生版，不覆盖 texture.glb。不同 Pillow/编码库版本可能产生不同字节，重新生成后更新清单并重新检查，不假定字节级跨平台可复现。

### B. 减面

```sh
npm --prefix tools/mesh-tools run build
npm --prefix tools/mesh-tools test
```

工具是 meshoptimizer 1.0.1 的属性感知简化 + glTF Transform 4.3.0。考虑法线/UV，锁住边界和模型极值，不移动保留顶点，不重算法线，不以强制目标比例破坏接缝。原包围盒保持可用，避免自动缩放和接点漂移。

不同资产目标不同：狗目标 45%、树 35%；地块和灌木受误差限制，实际只减约 15%。误差指标是 meshoptimizer 的属性误差，不是绝对像素误差或 Hausdorff 距离保证。

真实结果总三角面 253,531 → 143,571；几何缓冲减少 38.4%，总文件仅减少 17%，因为贴图尚未变化。不能只报告比例，必须看角色五官、植物轮廓、草沿和木板。完整数据见 [减面报告](../scene-lab/assets/optimization-report.json)。

### C. 图片编码压缩

```sh
work/texture-env/bin/python tools/compress_glb_textures.py
work/texture-env/bin/python tools/verify_texture_compression.py
python3 tools/tripo_pipeline.py catalog
```

- 对 PNG 数据图测试 Oxipng level 4 与 libwebp 无损，选择最小者并要求解码 RGBA 像素完全一致。法线、粗糙度等不能随意做调色板量化。
- 对 JPEG 基础色测试 MozJPEG quality 90/93、4:4:4 和 WebP quality 95。保留尺寸，以 PSNR ≥ 42 dB、平均绝对 RGB 误差 ≤ 1.5/255 为数值门槛，选择合格候选中最小文件，否则保留原图。数值门槛不是审美保证。
- 最终 4 张颜色图保留 JPEG、4 张转有损 WebP；16 张数据图均转无损 WebP。并不是所有 JPEG 转 WebP 都更适合，木纹与色边需单独看。
- 增加 EXT_texture_webp，运行前探测浏览器解码；失败回退完整 runtime.glb，避免同时下载双套贴图。

原 PNG 4.535 → 3.301 MB；颜色图 3.642 → 2.830 MB。完整 GLB 12.217 → 10.172 MB。见 [逐图压缩报告](../scene-lab/assets/texture-compression-report.json)。

## 汇报必须分开

文件下载体积 ≠ GPU 显存；三角面减少 ≠ 同比例 FPS 增加；DPR 降低带来的收益 ≠ 纯代码优化收益。PNG/JPEG/WebP 在 GPU 中通常仍是解码后像素，本例没有 KTX2，不能宣称纹理显存下降。确有 GPU 纹理瓶颈时再评估 KTX2/Basis、加载器支持和真实设备兼容性。

本例两版桌面都可能触及 60 FPS 上限，所以只证明了几何工作量、文件体积和倒影同步改善；异常慢样本仍保留。
