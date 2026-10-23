# V6 跨日经济实施报告

2026-10-23。本模块未操作运行服务、liveDB、5190、dist，也未提交 Git。

## 行为

- `Profile.production?:ProductionState` 持久保存独立生产钟。初始仅前三只在家动物启用；最多六位，每完整12小时2白，每位最多6批。演示档独立30秒一周期。
- 生产位可玩家设置；新增/替换不补历史。周期中换位需从下一个完整周期开始；恰在周期边界换位可开始一个完整周期。已有待领批次保留原动物来源。
- 离线只保留最多6周期结算，重复结算、领取、时间回退不推进。全场一个动物+方向目标；蓝/红/金分别需2/6/14周期，照料Lv3/4/5解锁。当前周期锁旧目标，切换下周期生效，每个动物方向的已得进度独立保留。
- 旧warehouse五色总数原样保留；缺失lot来源的余额标记legacy-warehouse。旧husbandry.pending与life.products.stored一次迁移到legacy-pending待领批次，保留动物ID。第一次claim加claimedBy交易ID。迁移以production存在作为一次标记。
- 羊毛有`id/tier/amount/animalId/version/source/claimedBy?`，warehouse继续为总数。`consumeWool`返回实付lots；`restoreWool`按原身份恢复。旧库存兑换须显式`woolVersion:'legacy'`，五色1/2/4/7/12保留；默认V6仅白绿可兑。加工2白→1新版绿，保留输入lot ID的来源文本。
- 纯标签cultivate暂停且不扣料，原rarity标签保留。自然安心袭击统一1狼8–14分钟，数量仅供容量提示；已有事件、警报、在线时钟与上限不改。

## 接口

`setProductionSlots {animalIds:string[]}`；`setRareTarget {target?:string,tier:'blue'|'red'|'gold'|null}`；`processGreen {amount?:number}`（amount为绿毛产出数）；`exchangeWool`增加`woolVersion?:'legacy'|'v6'`。

`consumeWool(economy,cost:Partial<MaterialStacks>) -> {economy,accepted,message,consumed:WoolLot[]}`；`restoreWool(economy,lots)->HerdEconomy`。两者同步纯函数；交易幂等由estate receipt/workshop账本保证，退款函数本身不猜交易身份。

## 验证

先增加V6行为测试，运行时因缺少v6-production模块失败（RED），再实现。经济/袭击5个测试文件共45项通过，命令：

```
.local/runtime/node --import ./tests/view-loader.mjs --experimental-strip-types --test tests/v525-economy.test.ts tests/v525-economy-integration.test.ts tests/v525-raids.test.ts tests/v525-raid-integration.test.ts tests/v6-production.test.ts
```

覆盖旧存档SQLite GET/重开/交易重放、五色迁移、仓库退款来源、3位日12白与6位日24白、72小时满仓、换位无补产、全场目标/切换/2/6/14周期/离线封顶、时钟回退、30秒演示、绿毛加工、等级门槛、自然袭击与已有事件暂停。

对应模块及测试定向ESLint通过。旧隔离husbandry函数测试明确标为legacy isolated rule；现行Estate集成已经使用V6生产，不再调用旧10分钟产量。未修改非经济回归断言以掩盖失败。全项目typecheck/全测试由主代理最终整合执行。

## 独立审查修正：固定生产位容量

审查发现按动物ID统计待领批次会允许轮换12只动物扩大仓储。已先加入真实轮换测试，确认在第二个72小时产生超额批次而失败（RED），再加入固定`slot-0`至`slot-5`身份。每个新版白毛批次保存`slotId`，容量按槽位内未领取批次数统计；换下动物的来源、批次、数量完整保留并占原槽位。关闭/重开、减少/增加生产位会复用同一组固定槽位，不能清空占用或补领。

既有V6 fixture缺少slotId时自动一次补齐；保留动物与批次ID，不删除产物。新增回归同时覆盖12动物轮换、关闭后重开、领取原动物批次后仅释放对应容量、旧V6 fixture兼容。经济/袭击原命令现共47项通过，新增两项；补丁文件定向ESLint通过。
