# V6 折翼盾交付

改动仅在 threat.ts、tactical-shield.ts、tests/v6-shield.test.ts。

接口：createThreat 的 tactic 为 `{kind:'folding-shield',anchor:{x,z}}`，仅狗可装备；装配在创建事件时固定，一个对象对应一个战术槽。`guardianCommand(...,{kind:'shield'})` 请求部署，目标不能覆盖锚点。装盾后所有自动/手动原 block 都禁用，结束后也不恢复。

渲染：ThreatState.tacticalShield 含 anchor、status、startedAt、until、remaining、reason、waitingActorIds。仅 status active 是实体路障；其余状态用锚点/等待/失效提示。SHIELD_ANCHORS 提供事件前的四个默认选点，调用方应使用 shieldSafety 展示不可用原因。

行为：狗沿实际导航走到锚点，等待所有预约路线中尚未通过锚点的动物，停在锚点展开固定6秒；装备等级不加时，重复请求不会续时，JSON状态恢复保留到期时间。羊狼共享删除锚点格的导航图；狼实际重寻路，羊过时路径会重预约并绕行。部署前及展开前检查所有仍暴露动物到其预约入口（未预约则任一入口）的路径。封唯一撤离路返回明确原因；狗不可达也拒绝。

验证：先新增测试并运行，RED 为 tactical-shield 模块不存在；实现后运行 `.local/runtime/node --import ./tests/view-loader.mjs --experimental-strip-types --test tests/v6-shield.test.ts tests/v5-threat.test.ts`，25/25通过（5项盾行为与20项旧威胁回归）。覆盖共享图阻挡与绕行、唯一通路拒绝、实际走位、预约等待、羊狼旧路重规划、驻点锁、锚点锁、Lv3固定6秒、到期、原block替代、JSON恢复及重复请求无续时。

全仓 typecheck 当前被并行开发中的 Profile production/workshop 及尚未落地的 world-workshop 模块阻塞；本模块没有类型报错。没有启动服务、修改存档、提交代码或做视觉验收。

## 独立审查 P1 回归修复

复现两个失败测试后修复：盾图刷新只将尚未抵达入口的狼指向入口；抵达后的狼保留当前追逐路径目的地，防止每tick强制拉回门口。叼走状态的空路径表示无路等待，必须实际抵达 spawn 才产生 boundary-rescue。

新增 reassure 实战测试：盾从 active 过期后，入口狼能实际追上羊并进入攻击前摇和受伤链；单走廊路障阻断携带狼时保持原地carrying，盾过期后真实走到 spawn 才到边界并启动救援。新增两项首先同时RED；修复后相同命令27/27通过。
