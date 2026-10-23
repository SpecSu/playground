## 当前版本：V7.0 经营与协作

同一分支、同一设备存档与本机地址 http://127.0.0.1:5190 。保持390×844 Feed、固定2.5D、LX与不遮挡场景的动物/经营小卡。完整本轮玩法与边界见 [V7玩法](docs/V7_GAMEPLAY.md)，[验证记录](VERIFICATION.md)。

- 收获按真实稀有度产出白/绿/蓝/红/金羊毛，出售金币、合成、做披风/旗面/狗盾，买独立生产粮和品质明示羊箱。先预览粮食、占地、可达保护位与来袭档位，再确认孵化。
- 动物越多、越稀有，狼群越强；暴露物资按各品质分别最多损失20%，入库受保护。受伤/走失停产，走近照料或营救3秒，完成才支付资源；离线不补袭击。
- 顶部铃形图标打开偶遇卡：当前分身、守护者、真实经历和可编辑幻想台词。约12秒视频服务未连接，草稿及未连接任务真实保存，不扣任何生成费，不伪造视频。
- 拜访页可进入同一服务真实双设备的联合护送，或主人明确开放成熟普通料的10%采收。均未连接公网好友/账号；护送是无资产转移、无金币奖励训练原型。
- 五档品质边框、本机估值与旧库存兑换权保留。设置可确认重置当前存档从头演示，更新不自动重置。
- Chrome/WebGL真实画面、触控与听感未验收。真实生成、全服榜单、真人好友、幼鸭和托管尚未接通/集成，不兑换即梦积分。

# 绒绒庄园 · 用户 Mac 本地版本

打开 <http://127.0.0.1:5190>。仍使用原三个Demo的390×844 Feed、LX、摇杆/点地移动与底部抽屉。

先看庄园与狼靠近的短演出，再选刀盾狗/喵脆角/奶蛙，看幼崽沿真实路线回棚；完成教学后点羊卡片喂奶，再去草场、池岸、工作台走走。底部“+”进入布置/主题/本地拜访/私有作品。完整规则、策略借鉴、可用与未实现边界：[GAMEPLAY.md](./GAMEPLAY.md)。

## 运行

服务以独立后台进程运行，仅监听127.0.0.1，不安装登录项。若停了，在此目录：

```sh
python3 scripts/local-preview.py
python3 scripts/local-preview.py --check
```

Node24.9位于`.local/runtime/node`。日志`.local/server.log`，PID`.local/server.pid`，存档`.local/farm.sqlite`。保留数据库和设备Cookie；没有跨设备账号。

V5使用`estates`和`estate_commands`表，读取旧`farms`作一次迁移来源，原记录不覆盖。名字、身份、关系阶段、习惯、真实经历、外观迁入；旧羊毛/舞台/手账保存在`legacy`和原表，没有重复换成新材料。升级前一致性备份位于`.local/backups/`。

## 开发与验证

```sh
PATH="$PWD/.local/runtime:$PATH" npm test
PATH="$PWD/.local/runtime:$PATH" npm run lint
PATH="$PWD/.local/runtime:$PATH" npm run typecheck
PATH="$PWD/.local/runtime:$PATH" npm run build
```

构建默认输出dist。开发中可用隔离目录，避免正在运行的前后端版本不一致：

```sh
PATH="$PWD/.local/runtime:$PATH" npm run build -- --outDir .local/v7-dist
PORT=5193 FARM_DB=/tmp/farm-v7-test.sqlite FARM_DIST="$PWD/.local/v7-dist" PATH="$PWD/.local/runtime:$PATH" npm start
# 另一个终端，同一目录
FARM_URL=http://127.0.0.1:5193 FARM_DIST="$PWD/.local/v7-dist" PATH="$PWD/.local/runtime:$PATH" npm run test:http
FARM_URL=http://127.0.0.1:5193 FARM_DB=/tmp/farm-v7-test.sqlite .local/runtime/node --experimental-strip-types scripts/v7-http-smoke.mjs
FARM_URL=http://127.0.0.1:5193 FARM_DIST="$PWD/.local/v7-dist" PATH="$PWD/.local/runtime:$PATH" npm run test:dom
FARM_TEST_URL=http://127.0.0.1:5193 .local/runtime/node scripts/v7-convoy-http.mjs
.local/runtime/node scripts/v7-harvest-http.mjs
FARM_URL=http://127.0.0.1:5193 FARM_DB=/tmp/farm-v7-test.sqlite FARM_DIST="$PWD/.local/v7-dist" .local/runtime/node --experimental-strip-types scripts/v7-entry-dom-smoke.mjs
```

HTTP/Node DOM脚本拒绝5190，使用临时测试存档。真实Chrome/WebGL与手机触控尚未验收：独立Chrome插件工具缺失，没有使用CUA或其他浏览器绕行。标准Node SQLite ExperimentalWarning不代表保存失败。

实现/验收清单：[V5_PLAN.md](./V5_PLAN.md)；外部AI/好友接口边界：[V5_INTEGRATION.md](./V5_INTEGRATION.md)；实际验证证据：[VERIFICATION.md](./VERIFICATION.md)；进展：[PROGRESS.md](./PROGRESS.md)。本轮不发布Sites、不改旧三个Demo；按用户授权正常推送原开发分支，不推main或force。

开放山谷与疏散后连续引导：见 [OPEN_VALLEY.md](./OPEN_VALLEY.md)。现存档刷新后可继续；要演示全开场，用设置中的“重置当前存档 · 从头演示”，确认后才清空该档。声音需首次用户交互，顶部可静音。
