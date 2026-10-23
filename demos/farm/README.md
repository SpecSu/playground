## 当前版本：V6.0 羊毛工作坊

地址仍为 http://127.0.0.1:5190 。刷新加载新版，保留原390×844 Feed、固定2.5D镜头与设备存档。

- 建东西：选设施后拖动场景中的悬空半透明模型，绿色可放、红色不可放，确认才扣材料；取消不扣。
- 做第一件作品：点“羊毛·守护→做一件作品”或布置里的创作入口，选披风和纹样，保存图案、领取免费首件，再点“穿给伙伴”。卡片会收起，披风实际跟随守护者。旗面可预览和拖动摆放，作品、来源和版本保存在本机。
- 自然档每12小时每生产位2白毛，初始3位、最多6位，每位保留6批；白2加工绿1。蓝/红/金按选定动物目标累计2/6/14周期；旧库存单独保留原1/2/4/7/12材料兑换权。新蓝毛做狗盾、金毛解锁永久签名；红毛配方尚未开放。演示档生产周期30秒，独立存档。
- 伙伴披风/庭院旗4材料+白1；路标8+绿1；狗盾16+蓝1；动物签名8+金1。首件披风或旗面赠送；拆解按实付返80%材料和原羊毛，赠品不生料。演示档可免费借狗盾，定点展开6秒路障，不能与贴身拦截叠加。
- 第一顿后每天在线可能多次不定时来袭；安心区固定1狼、约8–14在线分钟一轮，稀有标签和财富不增加压力。预警12秒，后台/离线暂停，自然档不会永久失去动物。更多动物仍需要足够保护位与可达路线。
- 动物卡保持轻量，点击喂养/玩耍/救援后收起看动作。设置里可以确认重置当前档，从开场重新演示；代理更新不会重置存档。
- 验证证据在 [VERIFICATION.md](./VERIFICATION.md) 和 `verification/v6*.json`。真实Chrome/WebGL画面、触控和听感仍未验收，未使用其他浏览器绕行。
- 真实AI、账号生成预算、审核与持久生成资产、真人好友、偶遇卡视频均未接通；工作坊明确显示未连接，模板可独立使用，不兑换即梦积分。源码调查见 [连接核实](docs/V6_CONNECTIVITY.md)。托管、幼鸭水域生活、猫铃/蛙帐等仍未集成。

# 绒绒庄园 V5 · 用户 Mac 本地版本

打开 <http://127.0.0.1:5190>。仍使用原三个Demo的390×844 Feed、LX、摇杆/点地移动与底部抽屉。

先选刀盾狗/喵脆角/奶蛙，看幼崽沿真实路线回棚；完成教学后点羊卡片喂奶，再去草场、池岸、工作台走走。底部“+”进入布置/主题/本地拜访/私有作品。完整规则、策略借鉴、可用与未实现边界：[GAMEPLAY.md](./GAMEPLAY.md)。

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
PATH="$PWD/.local/runtime:$PATH" npm run build -- --outDir .local/v6-dist
PORT=5193 FARM_DB=/tmp/farm-v6-test.sqlite FARM_DIST="$PWD/.local/v6-dist" PATH="$PWD/.local/runtime:$PATH" npm start
# 另一个终端，同一目录
FARM_URL=http://127.0.0.1:5193 FARM_DIST="$PWD/.local/v6-dist" PATH="$PWD/.local/runtime:$PATH" npm run test:http
FARM_URL=http://127.0.0.1:5193 .local/runtime/node scripts/v6-http-smoke.mjs
FARM_URL=http://127.0.0.1:5193 FARM_DIST="$PWD/.local/v6-dist" PATH="$PWD/.local/runtime:$PATH" npm run test:dom
```

HTTP/Node DOM脚本拒绝5190，使用临时测试存档。真实Chrome/WebGL与手机触控尚未验收：独立Chrome插件工具缺失，没有使用CUA或其他浏览器绕行。标准Node SQLite ExperimentalWarning不代表保存失败。

实现/验收清单：[V5_PLAN.md](./V5_PLAN.md)；外部AI/好友接口边界：[V5_INTEGRATION.md](./V5_INTEGRATION.md)；实际验证证据：[VERIFICATION.md](./VERIFICATION.md)；进展：[PROGRESS.md](./PROGRESS.md)。本轮不发布Sites、不推原GitHub、不改旧三个Demo。

开放山谷与疏散后连续引导：见 [OPEN_VALLEY.md](./OPEN_VALLEY.md)。现存档刷新后可继续；要演示全开场，用设置中的“重置当前存档 · 从头演示”，确认后才清空该档。声音需首次用户交互，顶部可静音。
