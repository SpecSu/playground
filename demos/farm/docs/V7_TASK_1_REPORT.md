# V7 Task 1：经济、承载、估值与风险集成

2026-10-23，基线89d6033，同分支本地实现。未访问5190、未读写生产数据库、未清档、未部署/提交/推送。

## 实现与持久接口

- 新增 `v7-economy.ts`。`Profile.v7`保存schema version 7、经济revision、独立生产粮、明示品质sheep领养箱、每动物时钟、经济命令回执及风险模块共用的recovery/raidLosses/recoveryReceipts。
- materials是唯一金币余额，旧值1:1延续。出售新羊毛白/绿/蓝/红/金=2/6/18/54/162；默认或指定V6/V7出售不会消费legacy库存。显式legacy兑换继续1/2/4/7/12。邻阶3→1加2金币；买10生产粮花10金币；一次迁移赠24生产粮。健康奶/饲料库存不进入生产粮账本。
- 初次ensureV7保留现有animal IDs、名字、关系、rarity与所有legacy/V6库存、待领批次；V6时钟退休，不补V6历史。V7每只living动物都可生产，不再使用6位或稀有目标。自然12h、演示30s；品质即产物品质，2份基础+少年/成年1份+9次有效照料1份，上限4。
- 每动物最多6个正常待领批次、离线最多6完整周期；按成熟时间、原动物稳定顺序结算付费粮1/2/3/5/8。缺粮、受伤/走失、无可达独立床位时不产出、不扣生产粮、不留可补领历史；满仓也不消耗粮食。旧legacy持权批次不占新的正常批次容量。
- V7批次带version `v7`、animalId、cycle、来源，及同成熟时刻共享的稳定batchId，供授权普通采收按真实成熟批次核算。
- box明示sheep品质及60/180/500/1400/4000价格；买箱不产生动物或估值。服务器预览无扣款、不增经济revision；孵化要求该box服务器预览仍存在、版本/布局/数量一致，再重验24h生产粮、步行土地2/3/4/6/9格/动物、每动物可达独立庇护位和12只上限。取消保留箱并使迟到确认失效；成功后仅产一个稳定ID新动物，从完整周期开始。
- 估值label固定“本机估值”：living animal 10/30/80/180/400，同种同档前3全额、后续20%；有效连通设施按官方cost、同kind最多3；真实装配cape4/shield16。金币/粮/毛/箱/纹样/签名不计分；不读任意paidCost估价。动物、设施与装备共享已计资产ID集合，防跨类别或重复装配刷分；工作坊旗/路标placements不冒充设施。所有实际动物均为sheep，AI外观、名字或附加species/quality字段不改变真实husbandry品质或同档折扣。

导出：`ensureV7`、`settleV7`、`v7Command`、`previewHatch(p,tier)`、`estateValuation`、`v7Summary`、`productionStatus`、`advanceV7Recovery`、`recoveryPoint`及各持久类型。summary.version与preview.version都是经济revision；所有summary/preview/status纯读。

经济命令：`v7-buy-feed {packs}`、`v7-sell-wool {tier,amount,version?:'v6'|'v7'}`、`v7-synthesize {tier,amount}`、`v7-buy-box {species:'sheep',tier}`、`v7-preview-hatch {boxId}`、`v7-cancel-hatch {boxId}`、`v7-hatch {boxId,expectedVersion,expectedLayoutVersion,expectedCount}`。

旧adopt、2白→1绿、生产位设置、稀有目标设置安全拒绝，不再作为V7绕过入口。旧标签培育继续暂停。存档交易失败回执与成功回执均可持久化；读档与每个mutation前先结算过去时段，避免购买粮或修路后补产过去。

## Task 2与其他模块集成

- 自然createThreat传实际pressureBand，之后beginV7Raid冻结开场暴露批次；已验证admitted的动物保留safe+reservation，不进入暴露快照。step前/后observe；自然事件进行时禁止瞬间claim。
- 付费恢复沿用rescue或新`v7-recover {target}`：实际近距1.5、静止、连续3在线秒，injury8金币+2生产粮、lost16+4，只在成功完成扣款并写event/animal/kind回执，再传Threat授权。取消、远离、移动、遮挡/离线会重置连续计时；无事件时仍可治疗。资源不足保留动物、恢复记录与意图，不扣款。
- 统一recoveryPoint：safe在真实棚门互动；boundary/lost使用rescuePoint；carried追实际位置，不用过期边界点。无事件待恢复动物停止自主乱跑，健康照料仍可执行。
- 按root请求接入encounterCommand；未连接任务即使accepted:false也保存返回state，不丢真实不可用记录。根后续可接入授权采收等模块。

## RED / GREEN 证据

1. 新单元测试最初失败：ERR_MODULE_NOT_FOUND v7-economy.ts。实现独立模块后8项通过。
2. 新EstateStore集成先3项失败：V7状态undefined、V7命令未接入。接入后通过；另一个早期测试把5周期误当可耗尽24粮，修正为真实8周期（每周期3粮）才测试购买不补产。
3. 真实无事件恢复回归发现待治疗动物仍自主走开，最后remainingOnlineMs为3000且未完成。冻结待恢复动物自主移动后该测试GREEN。旅行时间不计照料，新增实际移动接近后3秒静止回归。
4. scoped review发现取消后迟到confirm仍可孵化；绑定服务器preview/box/version，新增取消和无预览确认拒绝测试。
5. scoped review发现默认出售可能先消费legacy；默认改为仅V7/V6且优先V7，新增混合版本保权测试。
6. scoped review发现safe动物内部位置不可达及旧rescuePoint复用；采用同一recoveryPoint统一寻路/计时，补safe内部动物实际门口治疗测试。

最后定向合跑69项全部通过：

```
.local/runtime/node --import ./tests/view-loader.mjs --experimental-strip-types --test tests/v7-economy.test.ts tests/v7-economy-integration.test.ts tests/v7-risk.test.ts tests/v525-economy-integration.test.ts tests/v525-estate-cycle.test.ts tests/v6-production.test.ts tests/v525-raid-integration.test.ts
```

其中新V7经济15单元+7隔离EstateStore集成，风险模块14项（由Task2维护）；其余是保留与明确升级后的旧回归。经济/estate及这些测试定向ESLint通过。并行施工期间曾见tests/v7-convoy.test.ts:133 THREE namespace错误；最终交接前全项目tsc --noEmit已exit 0。全项目测试与生产构建最终集成复核由root执行。

旧回归升级未削弱迁移保障：旧adult的4白legacy仍保留，新12h产物按V7成年+1应为3白（总7而非V6总6），现同时断言两笔版本/动物/来源；旧档fixture明确删V7状态以模拟真旧档。旧adopt改购买+服务器预览+孵化，保持容量、稳定名/ID和交易重放断言；旧免费lost改真实三秒并只付16+4一次。

## 关注点

- 数值都是Task1配置试验值；未创造额外货币、概率品质、生产补贴或无限扩展。
- 生产粮、金币都耗尽且没有可卖资源时，合同未指定新增破产救济；本实现保持免费健康照料与已存在探索奖励，未擅自添加免费生产粮或免费V7恢复绕过。
- 未做Chrome真实画面验收，未做生产库迁移或部署；最终权限与发布操作留给root。
