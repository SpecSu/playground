# 素材与来源

本目录包含运行所需素材及来源工程已有的可编辑美术文件。所有文件 SHA-256 见 ARCHIVE-MANIFEST.json；人物还保留原 cast/portrait manifests。

- 12 位人物 GLB 与 12 张头像 WebP：由原钓鱼工程 `55de7c92b90d54665d4f4772b793aa5be46e856b` 按所有者要求沿用，详见 `public/assets/avatars/cast-v1/PROVENANCE.txt`。已归档必要演示副本；未附原人物建模工程或私人参考图，不假定可由本仓库生成器重新生成。
- 10 株植物、地块、10 个种子/鱼饵图标：生产文件在 public；Blender 工程、生成脚本与规范在 art-source。
- 20 种鱼、码头、鱼缸和海洋场景：由 `lib/art/` / `lib/world/` 中的代码生成，保留生成代码即保留运行资产。
- 海浪：`lib/client/ocean-audio.js` 的程序化合成，不依赖音频文件或第三方音乐下载。
- 保留 package-lock、vendored Sites 插件 MIT 许可和 shadcn CSS 许可。依赖遵循各自包内 LICENSE；本目录没有擅自给整个工程或用户素材附加统一开源许可。

用户授权归档到此仓库不代表所有人物/资产都已获通用再分发或商业授权。来源工程没有完整提供人物建模原件或独立素材许可，应在进一步公开分发/商业使用前确认权利或替换未知项。
