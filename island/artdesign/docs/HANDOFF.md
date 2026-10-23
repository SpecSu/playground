# 接手说明

## 选择入口

- **只看效果**：根 README 的两条预览命令。没有 Tripo、npm 依赖和云端服务的前置要求。
- **复现优化**：04-optimization.md。原始与派生 GLB 均已随仓库保存，可以直接核对，无须消耗生成积分。
- **制作下一批**：01 → 02 → 03 → 05，满足当前授权范围后执行；样例的历史通过结论不自动批准新模型。
- **修改现有场景**：主要读 layout.json、src/main.js、asset.js、materials.js、lighting.js、lagoon.js、motion.js；只动本次需要的模块。

## 事实来源优先级

1. 用户当前任务与明确约束；2. 本框架 docs/ 与 manifests/asset-inventory.json；3. 实际模型和当前 layout；4. 真实浏览器截图与采样 JSON；5. 历史 art/、scene-lab/docs/ 的阶段记录。发生冲突时先查文件/证据，不凭旧叙述覆盖新事实。

关键更正：

- art/v0.1 的 2×2 连体地块是旧方案。有效输入是 v0.2 单块地块；场景里才复制成 2×2。
- 图像中“无光照”应理解为中性、弱明暗的建模参考；体积提示光仍存在，不能直接当纯基础色贴图。
- 旧规范中狗高 1.20 m / 树高 4.00 m 已改为场景布局 1.55 m / 3.50 m，均属美术设计决定。
- 旧报告反射约 15 Hz 是卡顿来源；当前相机运动时每帧更新，静止约 30 Hz。
- 当前默认 compact.glb，兼容回退 runtime.glb；不是仍默认 display.glb。

## 运行与依赖

预览需要 Python 3.9+（标准库；本次使用 3.14.2）。离线核验模型几何工具需要 Node.js 24.9.0（或支持 node:module registerHooks 的兼容版本），固定 npm 依赖在 tools/mesh-tools/package-lock.json。图片工具基线 Python 3.12、Pillow 12.3.0、NumPy 2.3.5、pyoxipng 9.1.1。Tripo 付费生成才需要独立安装/配置官方 CLI 或注入 API 凭据。

```sh
python3 tools/verify_handoff.py
python3 tools/tripo_pipeline.py plan --assets dog tree
python3 tools/tripo_pipeline.py catalog
python3 scene-lab/server.py --port 8772
```

plan/catalog 都离线。catalog 会重新生成派生索引，但不会恢复历史账户任务记录；运行后仓库 catalog 变化是预期现象。基线校验用干净检出，开发后不要把文件改动误判为传输损坏。

## 目录的职责

本包独立自洽，不需要原作者电脑的绝对路径。work/、node_modules/、虚拟环境为本地生成目录并被忽略。原始任务日志、上传 token、下载签名和账户配置没有迁入仓库。已保存可公开给项目协作者的任务 ID、参数摘要、模型哈希和费用历史，见 manifests/ 与 scene-lab/assets/manifest.json。

## 建议给下一个 agent 的任务文字

> 阅读 island/artdesign/SKILL.md、README.md 和 docs/HANDOFF.md，使用本目录的小岛美术资产搭建流程 0.1。先明确当前阶段、复用素材与缺口；使用现有示例验证流程，再执行我指定的新资产/场景任务。保留原始文件与哈希、真实浏览器证据和未测项。不要默认重生成已有模型；涉及新的 Tripo 付费任务时遵循我提供的预算与范围。

当前最有价值的品质工作是定向修复狗尾、叶片粘连、灌木孔洞和规则地块边界，随后做真实移动设备验证。它们是后续建议，不是本归档已完成的事项。
