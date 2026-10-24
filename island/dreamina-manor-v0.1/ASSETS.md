# 素材与来源

本目录包含运行素材、程序化生成代码、正式来源许可与来源工程已有可编辑文件。全部逐文件 SHA-256/Git SHA 见 ARCHIVE-MANIFEST.json；授权归档到此仓库不等于授予素材通用公开再分发或商业许可。

- 12位人物的12 GLB与12 WebP：沿用所有者指定原钓鱼工程，来源提交和校验在 `public/assets/avatars/cast-v1/PROVENANCE.txt` 及人物 manifests。没有私人参考图，不假定原人物建模工程可以重建。
- 20植物：`public/assets/world/plants/` 的10原 GLB/元数据，以及 `lib/art/exotic-plants.js` 的10种程序化异植。生成/导出/对照脚本与已有 Blender 源保存在 `art-source/`；图标和种子/鱼饵袋也在 public 中。
- 20鱼、码头/鱼缸与场景：`lib/art/`、`lib/world/` 代码生成，不依赖缺失的外部鱼 GLB。
- 原授权海底装饰 fish/rock compact 与新版纹理地块保存在 `public/assets/lagoon/`、`public/assets/world/ground/`。参考来源/权利边界在 `art-source/lagoon-reference/`、`art-source/ground-reference/`，保留 notices 和 Three.js MIT 文本。文档中的来源工程路径不是本demo漏件。
- 海浪：`lib/client/ocean-audio.js` 程序合成。当前进包、金币、建造与抛竿反馈使用用户为本 Demo 提供的四段音轨，已提取为 `inventory-user-v23.wav`、`coins-user-v23.wav`、`build-user-v23.wav`、`cast-user-v23.wav` 及运行所需内嵌 PCM；来源与处理见 `public/assets/audio/USER-AUDIO-SOURCE-v23.txt`。这些音轨不是 CC0，不附原视频、视频元数据或私人参考文件。
- 投饵入水等旧录音及保留的来源素材在 `public/assets/audio/`。Kenney RPG Audio 与 rubberduck water splash 的 CC0 1.0 许可仅适用于各自具名素材，正式来源、处理方法及许可见 SOURCE.txt、ACTION-SOURCES-v22.txt、Kenney-RPG-Audio-CC0.txt。旧 Kenney 买/收/币文件的保留不表示它们仍是当前对应 cue；版本化文件名也不是当前发布版本。
- package-lock、Sites 插件 MIT、shadcn CSS 许可和依赖自身许可均保留。不擅自给整个工程或用户资产另加统一开源许可。

进一步公开分发或商业使用前，需确认未明确提供独立授权的人物/美术来源权利，或替换相应素材。具名音频的CC0许可不覆盖用户提供音轨或其他资产。
