## 当前本机版本：V5.2.1 可玩性修复

地址仍为 http://127.0.0.1:5190 。刷新加载新入口，保留原390×844 Feed、固定2.5D镜头与设备存档。

- 结束开场的旧存档会自动解除移动锁；进入途中点击不再使用过期会话。
- 羊、狼和伙伴沿连续分数位置寻路；快照按时间插值，转弯和步态使用实际路程，开卡和切目标不重置动画时钟。
- 进出保护棚经过开门；刷新恢复喂养对象；切演示档关闭旧面板；动作抽屉切目标不跳成卡片；不可达等原因显示在场景内。
- 已验证313项自动回归、lint、类型检查、生产构建和隔离HTTP/实际React入口。Chrome/WebGL画面、触控和帧率仍未验收，不能以这些检查代替。
- 试玩路线、确切修复及后续完成顺序：[PLAYABILITY.md](./PLAYABILITY.md)。自然事件、托管、幼鸭仍未集成，不宣称完整V5已完成。

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
PATH="$PWD/.local/runtime:$PATH" npm run build -- --outDir .local/v5-dist
PORT=5193 FARM_DB=/tmp/farm-v5-test.sqlite FARM_DIST="$PWD/.local/v5-dist" PATH="$PWD/.local/runtime:$PATH" npm start
# 另一个终端，同一目录
FARM_URL=http://127.0.0.1:5193 FARM_DIST="$PWD/.local/v5-dist" PATH="$PWD/.local/runtime:$PATH" npm run test:http
FARM_URL=http://127.0.0.1:5193 FARM_DIST="$PWD/.local/v5-dist" PATH="$PWD/.local/runtime:$PATH" npm run test:dom
```

HTTP/Node DOM脚本拒绝5190，使用临时测试存档。真实Chrome/WebGL与手机触控尚未验收：独立Chrome插件工具缺失，没有使用CUA或其他浏览器绕行。标准Node SQLite ExperimentalWarning不代表保存失败。

实现/验收清单：[V5_PLAN.md](./V5_PLAN.md)；外部AI/好友接口边界：[V5_INTEGRATION.md](./V5_INTEGRATION.md)；实际验证证据：[VERIFICATION.md](./VERIFICATION.md)；进展：[PROGRESS.md](./PROGRESS.md)。本轮不发布Sites、不推原GitHub、不改旧三个Demo。
