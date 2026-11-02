# 仓库清单

[`legacy-demos/`](legacy-demos/) 只覆盖云蹦迪、云钓鱼、火人节三个旧版 Demo。各项目自己的清单仍位于各项目目录，不能将这里的历史结果当成全仓验收结论。

- `versions.json`、`archive-adjustments.json`：原始发布版本、来源与归档差异。
- `assets.json`：运行素材清单，`path` 相对于仓库根目录；用根目录的 `python3 scripts/verify-assets.py` 校验。
- `source-files.sha256`：旧版 Demo 及其共用交接文件的当前校验和，路径相对于仓库根目录；目录整理时按已审查的路径和文档改动刷新。在仓库根执行 `shasum -a 256 -c manifests/legacy-demos/source-files.sha256`。
- `dependencies.json`：归档时锁文件中的依赖与许可字段。
- `builds.json`、`checks.json`、`http-smoke.json`、`privacy-check.json`、`archive-metadata-tests.json`：原归档的历史检查结果，不代表本次重新运行了这些检查。

2026-11-02 的目录调整只迁移文件、更新当前路径与受影响的校验和；原发布 commit、版本与历史验证结论保持原义。原始文件和旧哈希可在 Git 历史中查阅。
