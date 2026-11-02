# 02 · Tripo 几何、灰模与 PBR

## 先分清复现与新生成

本包已有完整模型；验证场景和离线优化无需 Tripo。以下是**新生产任务**的执行方法，不是让 agent 在读文档后自动付费。已有用户授权可继续执行，无须重复确认；没有预算/范围时先准备输入和离线计划。

历史参考：八类单轮实际 380 积分，首批狗狗+树约 120；这些不是现价或现余额。新任务执行前查实时余额、模型支持与计价，检查 CLI `--help` / `tripo docs`。本例几何 v3.1，纹理 v3.5-20260815，CLI 0.7.2；服务端回执为准。

## 环境与记录

- CLI 通过官方登录流程配置。API 客户端只从进程环境 `TRIPO_API_KEY` 取凭据，由本机安全存储注入。不要提交账户 profile 或作者电脑专用脚本。
- `work/tripo/` 存任务状态、task_id、输入哈希、参数、费用、失败状态与检查记录；不进 Git。归档保留模型和公开摘要，**不包含可自动续跑的私人任务日志**。
- 生成、上传、计费与下载分开判断。CDN 下载不得附带 Tripo API Bearer。
- 不改写原样例。新版本在独立工作副本中制作；归档旧模型与任务记录后再开始，不能删除记录来伪装首次提交。

## 实际跑通的主路径

所有命令在 artdesign 根目录运行。默认暂停，未授权阶段只运行离线命令：

```sh
python3 tools/tripo_pipeline.py plan --assets dog tree
python3 tools/tripo_pipeline.py generate --kind geometry --assets dog tree
```

第二条没有 `--execute`，只显示计划。授权与当前预算已成立后：

```sh
tripo doctor --json
tripo balance --json
python3 tools/tripo_pipeline.py resume
python3 tools/tripo_cli_run.py --kind geometry --assets dog tree
```

**tripo_cli_run.py 没有 dry-run 开关，运行就可能提交付费任务。** 它有暂停、样板与灰模门槛、已有文件/任务记录防重提检查；纹理示例主路径使用下方 API 客户端。

首批只做狗狗与松树几何：独立单主图、texture=false、pbr=false、auto_size=false，保留原始 geometry.glb。高精几何用于质量基准，不能直接当浏览器预算。逐项目标与输入见 tools/tripo_pipeline.py 的 SPECS。

## 灰模验收

工作台模型检查切灰模，查看主视角、侧面、背面，转动并放大接点。检查头颈、四肢、五官、叶片厚度与分层、树根、甲板/支柱、船舱开口、岩石体积和地块四边。先修最大的三个问题，不靠材质遮盖结构。

实际保存截图并形成结论后记录：

```sh
python3 tools/tripo_pipeline.py approve-geometry --asset dog   --evidence scene-lab/evidence/my-round/dog-front.png scene-lab/evidence/my-round/dog-back.png   --notes '填写实际看到的结构结论、问题与可接受范围'
```

树同理。审批记录绑定模型哈希；脚本不判断美术质量。若换输入/几何，重新看图。两轮定向生成/修订仍不合格时停止无目标重抽，转模型师、Blender 清理或同风格成熟 GLB，并重新检查许可与风格。

## 生成材质与样板

本轮曾遇到 CLI 0.7.2 拒绝新纹理版本参数，**没有提交/扣费就停止，改用官方 API**。不能反复执行同一失败命令，也不能把本包的 CLI texture 分支当成已跑通保证。

```sh
# 先通过本机安全机制注入 TRIPO_API_KEY；不要把实际值写在文档/源码里。
python3 tools/tripo_pipeline.py generate --kind texture --assets dog tree --execute
```

纹理参数：PBR、detailed、original_image、delight；基于通过的 geometry task_id，而不是重新生成整件几何。保存 texture.glb，检查 UV、基础色、normal、粗糙度/金属度及参数。去光照开关不是去光照质量保证。用中性光和反向光验证高光/阴影随灯光变化，避免把烘焙阴影误判为真实体积。

首批看图成立后记录 `approve-pilot --evidence <至少三张真实截图> --notes <实际结论>`，再生成其余六类，每件仍执行几何 → 截图 → PBR。不要把八类一次性盲投。

## 中断与失败

| 情况 | 应做 | 禁止 |
|---|---|---|
| 提交结果未知 | 保存日志，查 CLI history / task get，确认是否已创建任务 | 自动再次 POST 或 redo |
| 已有 task_id、轮询中断 | 查询原任务，等待或下载原结果 | 当新任务重抽 |
| 下载不完整 | GLB 长度校验拒绝，重新查询同一任务下载 | 用不完整文件进入场景 |
| 输入变化/想重做 | 归档旧版本、说明目的与预算，创建新版本记录 | 删除历史规避防重提 |
| 图片/模型不合格 | 记录具体缺陷并定向修订 | 用灯光宣称修好结构 |

CLI 查询例：`tripo task get <task-id> --json`、`tripo task watch <task-id> --json`。参数以当前安装帮助为准。恢复日志可能含上传 token/下载签名，只保存在 work，不直接贴入仓库或聊天。
