> 历史阶段资料：保留当时的设计与结果，不代表当前状态。当前入口见 [流程框架 0.1](../../README.md)。

# 小岛美术资产 v0.1

这一版包含 10 类资产的 14 张参考图、原始场景图、尺寸说明、完整流程与生成记录。

## 从这里开始

- [图片索引](index.html)：浏览 10 类资产的主图与补充视图。
- [流程 v0.1](docs/WORKFLOW-v0.1.md)：分工、步骤、尺寸约定与验收门槛。
- [逐图检查记录](docs/IMAGE_REVIEW.md)：用途、已知差异和淘汰原因。
- [资产清单](metadata/ASSET_MANIFEST.json)：名称、尺寸与相对路径。
- [全部生成提示词](metadata/PROMPTS.json)：内置 image_gen 的 16 次生成记录。
- [归档完整性检查](metadata/FILE_CHECK.json)：文件散列和链接校验。

## 目录

```text
v0.1/
├── index.html                    # 图片浏览入口
├── README.md
├── assets/                       # 10 类资产，各自独立文件夹
│   ├── dog/                      # primary.png / back.png
│   ├── tree/                     # primary.png / back.png
│   ├── shrub/
│   ├── ground/
│   ├── dock/                     # primary.png / side.png
│   ├── boat/                     # primary.png / back.png
│   ├── rock/
│   ├── fish/
│   ├── rod/
│   └── grass/
├── references/                   # 原场景图、独立尺寸比例图
├── docs/                         # 流程与图片检查记录
├── tripo-pilot-inputs/            # 仅狗狗、松树主图，分别提交两个任务
├── metadata/                     # 清单、提示词、完整性检查
└── review/rejected/              # 2 张淘汰图，不用于生成
```

## 使用规则

先用 `tripo-pilot-inputs/DOG-primary.png` 与 `TREE-primary.png` 分别试制两个独立模型。两图不能当作同一资产的不同视角。

补充图仅作设计说明，不保证三维对应；尤其松树叶片和码头绳圈有差异。图片不是 PBR 通道，尚未进行新一轮 3D 或真机验收。

首次生成参考包保留在原对话输出目录。本目录为已整理的项目归档，图片字节未改变。后续新版本使用 `art/v0.2/` 等新目录，避免覆盖本版。
