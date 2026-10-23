# V7 联合护送实现记录

本轮为**同服务、两独立设备身份的训练护送原型**。不是好友账号系统，也没有公网匹配；不会转移自家动物、库存，不发金币。正式货运和协作奖励账本待后续接入。

## 已实现

- `?convoy=new` 选狗/猫/蛙与路线；创建持久房间。复制房间链接，用同一Mac的Chrome无痕窗口或另一独立浏览器身份加入，真实接管守护角色。同Cookie的普通标签页仍是原角色，第三个身份不能占位。
- 运货者控制现有 LX，负责路线与车队；守护者操控所选真实模型。角色权限由服务端检查，运货者不能同时开门、侦察或施放守护技能。
- 短路12格，掩护路26格。四邻接路径、关闭的门和中间地形阻挡真实移动；守护者要到门旁开门，尾随车队全部过门后才能关闭。地图点击、WASD、停下等待与路线小图均可用。
- 最多180秒有效在线时间。狼第6秒开始行动；短路速度1.4格/秒，南侧草丛按0.48倍率减速。车队速度0.85，LX速度1，守护者1.8。货物受接触攻击每秒失去15完整度。均为可配置试验值，不是已平衡参数。
- 狗在4格内阻挡狼8秒；猫引开狼6秒；蛙减慢狼10秒，同时保护4格内货物。共同16秒冷却；范围/冷却/角色均由服务器检查。观察点可提前发现狼。
- 无第二设备时明确标NPC；成员断线后超过5秒由NPC接管。两人都不在线不追算危险；显式后台暂停会停止该角色心跳，异常断线有最多5秒在线宽限。重连恢复同角色、当前事件及结果。
- `convoy_rooms`、`convoy_receipts` 独立SQLite表，房间、成员、命令序列与回执一起事务提交。重复ID重放回执，相同ID换内容被拒，旧序列被拒，结果只生成一次。无任何farm库存读写。
- 390×844竖屏界面、原固定2.5D相机、LX/三守护者模型、程序化训练羊/车/狼。渲染沿服务端50ms轨迹插值，保留转角；测试检查实际场景的avatar方法，而非只匹配文本。

## 接口

- `ConvoyStore(file).command(device,command,now)` / `get(device,roomId,now)` / `close()`。
- 同源 `/api/convoy`，沿用 `farm_device` Cookie。GET `?room=ID` 返回统一 `ConvoyReply`。
- POST: `{id,type,roomId?,sequence?,...}`。`create`带`guardian`及`route`；`join`、`pulse`、`pause`不要求序列。`move`带`x,z`；`stop`；`route`；`gate`带`open`；`scout`；`ability`要求递增序列。
- 返回`{accepted,message,duplicate,snapshot}`；snapshot包含去设备ID的公共room、selfRole、sequence、serverNow、NPC/真人控制状态。
- 默认导出`ConvoyApp`，无props，自己读取query。root负责服务路由与主入口集成。

## 验证证据

- 最终定向测试18/18：身份/角色/闭门寻路/不同路线/幂等/旧序列/后台与重连/结算/时间分片等；复现并修复carrier键盘目标落到斜向草地、反复点地折返、stop退到格心、站门边无法关门等问题。
- 真实Three.js正交投影往返（390×844、390×600、360×780）通过；真实LX/狗/猫/蛙GLB骨架经本`ConvoyWorld.avatar`方法逐帧运动，位置连续、矩阵有限、停止位置稳定。纹理解码和WebGL画面不在此测试范围。
- 最新全app `npm run typecheck` 通过；本组源文件/服务器/测试的ESLint通过。
- `scripts/v7-convoy-http.mjs` 拒绝5190，只接受显式`FARM_TEST_URL`。已对root隔离5193服务和隔离SQLite跑过真实双Cookie流程：room `d46fd24a-1004-4bad-998d-c39e8f74c6c1`，独立角色、第三人拒绝、开门回执去重、离线暂停、技能冷却、15.224在线秒送达100%、重连结果相同，`reward=0/assetTransfer=false`。
- 上述HTTP之后补了键盘及关门尾随队列修复，已定向测试；最终整合需要root重新构建并重启5193后回归。没有碰运行5190、生产SQLite、部署、commit或push。

## 真实边界

没有可调用的Chrome控制入口，**实际WebGL画面、触屏手感及双窗口视觉协作未验收**；未使用CUA/Playwright。训练中跟随羊是沿车队轨迹的NPC展示，货物结算以车队整体完整度为准，未实现逐只NPC独立伤害。无好友关系、跨服务账户、协作经济奖励、语音聊天或生成视频。长短路线目前通常十几秒至几十秒可完成，180秒是上限，不强制等待三分钟。

## 文件与接手命令

`src/v7/convoy.ts`、`ConvoyApp.tsx`、`ConvoyWorld.ts`、`convoy.css`；`server/convoy-store.ts`；`tests/v7-convoy.test.ts`；`scripts/v7-convoy-http.mjs`。

```sh
.local/runtime/node --import ./tests/view-loader.mjs --experimental-strip-types --test tests/v7-convoy.test.ts
FARM_TEST_URL=http://127.0.0.1:5193 .local/runtime/node scripts/v7-convoy-http.mjs
```
