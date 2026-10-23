# 来源、依赖与使用边界

本目录不因上传 GitHub 自动获得统一开源许可。目标仓库为用户指定的私有项目；用户提供的参考图和生成素材仅按本项目交接授权归档，不据此断言拥有第三方商业发行权。

- 主参考图：用户提供；资产参考图：本会话内置 image_gen 生成。提示词与检查记录保留在 art/。
- 3D 资产：使用用户授权的 Tripo 账户生成。服务条款和账户权利以实际合同/服务条款为准；本文不替其作法律结论。
- Three.js：MIT，已保留 scene-lab/vendor/THREE-LICENSE.txt。目录中 vendor 是运行依赖，不是本项目原创实现。
- meshoptimizer：MIT；glTF Transform：MIT；Sharp：Apache-2.0；libvips：LGPL-2.1-or-later；Mozilla MozJPEG：其上游许可；libwebp：BSD 风格许可；Pillow：HPND；NumPy：BSD-3-Clause；Oxipng：MIT，pyoxipng 包装器见上游许可。
- npm/Python 编码工具通过固定依赖安装，本包不包含 node_modules 或虚拟环境。发行它们的二进制时应一并遵循依赖许可，不能只引用本清单。

技术一手来源：

- [Tripo 官方开发文档](https://developers.tripo3d.ai/)
- [Three.js GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [meshoptimizer Simplifier](https://github.com/zeux/meshoptimizer/blob/master/js/README.md#simplifier)
- [glTF Transform](https://gltf-transform.dev/)
- [Oxipng](https://github.com/oxipng/oxipng)
- [MozJPEG](https://github.com/mozilla/mozjpeg)
- [WebP 编码](https://developers.google.com/speed/webp/docs/cwebp)
- [EXT_texture_webp](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_texture_webp/README.md)
