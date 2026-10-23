# V6 运行时连接核实

2026-10-23 源码审计；没有调用付费生成、创建凭据、读取凭据文件或更改服务/账号权限。以下是游戏运行时能力，不是助手工具可用性。

| 能力 | 核实结果 | 源码依据 |
| --- | --- | --- |
| 真实图案生成 provider | 未连接；没有已验证的账号权益、独立生成预算、任务提交/轮询或审核调用 | `server/index.ts` 仅提供 estate 和诊断路由；`src/v5/creation.ts` 的主题为官方 preset |
| 持久生成资产 | 未连接；现有来源 assetId 不是图片持久存储服务，私有作品仅保存本地来源/场景信息 | `src/v5/creation.ts` 的 SourceAttribution、saveWork；`server/estate-store.ts` |
| 视频生成 | 没有 video submit/poll/persistent result API；不能把已有视频、静态截图或助手生成能力标为游戏已连通 | 当前 `server/index.ts` 路由和 creation 指令不含视频生成生命周期 |
| 真人账号/跨账户访问 | 未连接；Cookie 设备身份仅选择本地 SQLite 存档，没有可信登录、邀请和跨账户读写授权 | `server/index.ts` 的 farm_device；`server/estate-store.ts` 按 device 读写 |
| 旧 Demo connector 桥 | 可复用通用契约，不能当现成生成 provider | disco/fishing/festival 的 `lib/connector-contract.mts` 相同：宿主必须注入 binding；无 binding 返回 binding_unavailable；getContext 明确不是认证/健康证明 |
| 旧 Demo 登录 | 依赖 Sites 可信宿主注入身份头和登录路由；未接入农场独立 Node | 三个 Demo 的 `app/chatgpt-auth.ts`；不能信任浏览器自行提交的同名头 |

旧 Demo 的 `scripts/connector-preview/host-binding.mjs` 是临时 agent session 的只读连接器预览，不能作为常驻游戏生成服务。助手 imagegen 工具也不等于可供本地 Node 调用的运行时 API。没有对外接口时，应显示“未连接”，继续提供官方模板；不能显示额度为 0 来暗示已经取得账号预算。

## 本地项目累计授权契约

`grant` 可显式携带 `projectId`；同 ID 的多个本地访客授权共享一个 budget/spent/reserved/receipts 账本。省略时使用本次 grant ID，旧授权迁移至自身 ID，已有实际施工支出按 creationLayouts 的 paid 重建。已有项目再授权要求 budget 与原总额一致；撤权、重新邀请不会重置额度。ABC 始终是本地模拟身份。

待接受提案不预留主人材料，reserved 当前为 0。实际空间、路径、容量、组件范围和成本预检全部通过后，项目 spent 与库存扣费在同一候选事务记账；部分接受只记选中组件的实际费用。失败丢弃整个候选，不产生预算收据。

施工取消与最近提案撤销继续使用现有实付库存退款规则，但不会自动恢复项目授权额度。这是保守的累计支出上限，不是可循环消费的钱包；避免取消/撤销/重新授权产生可重复额度。扩额暂未提供命令，需要主人显式建立新项目。无实时多人、无真人邀请、无生成额度转赠。
