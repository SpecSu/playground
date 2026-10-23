# V7 Task 2 风险与损失

依据 docs/V7_TASK_2.md；仅改 raid-cycle.ts、threat.ts、新 v7-risk.ts 与风险测试。没有修改 estate.ts / estate-cycle.ts / UI，没有部署、提交、读取5190或动用户档。

## 规则与兼容

raidRisk 从去重动物推导 pressure=count+sum(rarity-1)*0.75。低档<6：1狼、8–14分钟；中档<11：2狼、5–9分钟；高档：3狼、3–6分钟。财富不入压力。原12秒在线预警、每日12次/在线小时6次上限保留。

createThreat 接受可选 pressureBand；仅 reassure 捕获该字段，实际寻路移动速度分别1/1.1/1.2，真实攻击前摇2/1.8/1.5秒，事件提示与前摇相符。旧保存事件没有pressureBand，继续原速度和前摇；教学与演练忽略新档位。

beginV7Raid仅在home、natural-事件ID、reassure且带pressureBand时记录开场仍暴露的存活动物pending批次。没有重建已有ledger的路径。observeV7Raid检测该动物与活跃狼距离<=1.5或实际受伤/叼走，按稳定lot ID顺序从该动物开场lot扣整数；总额最多floor(开场暴露总量*0.2)。新生产lot不进入快照、其他动物lot不能代扣、仓库从不访问。结束后ledger关闭，刷新/重复begin/observe不重复扣。

## 与经济agent确定的接口

风险函数就地修改调用者事务副本，不读时钟：

- `beginV7Raid(p,event)`：自然createThreat成功后、任何在线step前调用。
- `observeV7Raid(p,event)`：每次权威stepThreat后调用。
- `recoverySummary(p)`：数组 `{id,kind,remainingOnlineMs,lastOnlineMs,eventId,cost:{coins,productionFeed}}`。
- `canRecoverV7(p,target)`：检查记录与当前余额，不扣款；返回 `{ok,reason?,kind?,cost?}`。

V7共享结构：`recovery:Record<animalId,{kind:'injury'|'lost',remainingOnlineMs:3000,lastOnlineMs,eventId}>`；`raidLosses:Record<eventId,{opening,cap,taken,deductions,closed}>`；`recoveryReceipts:Record<eventId:animalId,'injury'|'lost'>`。金币唯一余额为Profile.materials，生产粮为v7.productionFeed。受伤cost8金币+2生产粮，叼走/边界/丢失cost16+4。完成伤疗后后来丢失会升级为lost记录；旧伤事件重放不重建完成记录。

经济负责近距连续3秒治疗/营救、离开重置、完成时一次扣款并写receipt/删除recovery，以及生产停工/当前事件禁止领取。完成付款后传stepThreat `recoveryAuthorizedActorId`；lost同时传findBackActorId。新事件没有授权不能用旧免费findBack或自动边界营救完成。授权carried会在狼实际位置release，授权伤疗记录careCompletedAt以解除0.7速度惩罚，同时保留injuredAt事实。旧无pressureBand事件免费找回兼容。

## TDD与验证

首次RED：v7-risk模块缺失。第二轮两个RED覆盖付费恢复完成标记与carried实际解救；补实现后通过。

执行 `.local/runtime/node --import ./tests/view-loader.mjs --experimental-strip-types --test tests/v7-risk.test.ts tests/v5-threat.test.ts tests/v6-shield.test.ts tests/v525-raids.test.ts`：50/50通过，其中V7风险14项、旧威胁20、折翼盾7、raid9。覆盖实际狼移动/前摇伤害、opening lot/20%整数/分动物/新lot/仓库/重试、暂停、旧存档/教学演练、lost授权、carried实际解救、恢复凭据。

旧raid第一项“V6稀有不加压”与本轮要求相反，已先报告主代理，经明确授权改为V7三档，保留财富不影响断言；没有削弱其余旧测试。全仓typecheck当前被并行V7经济/护送模块尚未落地的类型阻塞；本风险源码无类型报错。经济实际3秒/扣款/生产停工链待其接入完成后复核。

集成审查新增RED→GREEN：complete事件的伤疗授权在早退前记录careCompletedAt，不重启威胁、保留injuredAt历史；无当前事件的纯照料由经济层处理。

追加真实路径链：未直接搬动狼，按实际high速度沿导航前进到暴露生产者，触发attack-windup/injury，同时opening批次扣到20%上限并产生injury恢复记录；自然事件不永久删除动物。

## 审查追加：每品质分别20%

新快照增加capByTier，每种品质独立floor(该品质开场暴露数量×0.2)，每次扣损同时受该品质剩余额和原总量cap限制。不能把白毛额度转成金毛：金1+白99时仅可损失白19、金0，总损失19≤floor(100×0.2)=20。稳定lot扣损顺序与per-event/lot去重保留。旧已开启ledger若没有capByTier，不补算、不重分配、不增加任何既有taken/deductions；仅冻结后续扣损，恢复流程不变。两项新增测试先RED后GREEN；当前50/50回归通过，完整tsc --noEmit通过。
