# 绒绒农场 · 完整本机试玩版

打开 <http://127.0.0.1:5190>。玩家默认是仓库的 **LX**，三只小羊和奶蛙是独立实体。沿用原三个Demo的390×844画布、全屏场景、原版镜头/摇杆和底部抽屉。

## 从哪里开始

1. 摇杆、WASD/方向键或点地走动。**点击羊身或名字，打开它自己的卡片**；拖动不会误开。点奶蛙打开守护者卡。
2. 在卡片喂青草、一起待20秒，或跳舞/蹦跳/表达喜欢。皮皮热情跟拍、茉茉先观察再小幅回应、豆豆自己改编。
3. 同一动作隔至少12秒做三次，从观察到模仿再到邀请。连点不刷进度；亲密不会抹平性格。
4. 奶蛙带一次合拍后，刷新再来，它们会用真实保存的舞步认出你。也可在「我的分身」体验明确标注的6小时演示快进。
5. 顶部「手账」收下已完成目标的羊毛，前七项合计8团，不必等数小时就能在底部「+」换软垫舞台，再一起蹦跳。
6. 学会舞步+合拍后，可在动物卡留下星点卷毛或恢复普通，名字、个性和关系保留。规则驱动，无付费或生成API。

每只羊的卡片显示实时状态、亲密阶段、三种动作习惯、外观和最近经历。卡片可以切换住民、关闭回场景；保存失败时可在面板内重试原指令。

喂草每羊45秒间隔；陪伴20秒后手动记下，每羊5分钟间隔。各有前三次关系成长，之后仍可陪伴但不刷分。刷新结束未完成陪伴，超过60秒不结算，不扣关系。陪伴完成/取消绑定会话ID，旧重试不会误结算另一只羊。

## 本机运行与存档

当前独立后台服务会保留在任务结束后，无登录项/开机自启，仅监听127.0.0.1。若以后停了，在此目录运行：

```sh
python3 scripts/local-preview.py
```

已在本工作区 `.local/runtime/node` 保留Node24.9运行时，启动器优先使用它，避免依赖临时目录。`python3 scripts/local-preview.py --check` 只读检查PID、工作目录、实际5190监听和页面。重复启动会复用当前进程，不杀其他程序。日志 `.local/server.log`、PID `.local/server.pid`。

`.local/farm.sqlite` 保存Cookie设备身份对应的农场，请保留文件和Cookie。旧版存档一次升级为LX，所有关系/设施/羊毛保留；以后主动切换LX/喵脆角/香蕉猫不会换玩家ID。无跨设备账户。升级前的一致性备份在 `.local/backups/`。

开发/重新构建（需要Node24.9+）：

```sh
PATH="$PWD/.local/runtime:$PATH" npm ci
PATH="$PWD/.local/runtime:$PATH" npm test
PATH="$PWD/.local/runtime:$PATH" npm run lint
PATH="$PWD/.local/runtime:$PATH" npm run typecheck
PATH="$PWD/.local/runtime:$PATH" npm run build
```

服务器逐次读取dist，前端重建后刷新同一地址即可。自然羊毛每30分钟1团、最多12团，不因缺席腐烂或扣关系，亲密度不乘产量。领取、奖励、购买和失败重试均有真实SQLite收据防重复。

## 验证与边界

完整玩法/P0/验收：[GAMEPLAY.md](./GAMEPLAY.md)；实施记录：[PROGRESS.md](./PROGRESS.md)；结果与证据：[VERIFICATION.md](./VERIFICATION.md)。

HTTP和DOM脚本必须针对**独立测试数据库**，明确拒绝5190：

```sh
PORT=5193 FARM_DB=/tmp/farm-test.sqlite PATH="$PWD/.local/runtime:$PATH" npm start
# 另一个终端
FARM_URL=http://127.0.0.1:5193 PATH="$PWD/.local/runtime:$PATH" npm run test:http
FARM_URL=http://127.0.0.1:5193 PATH="$PWD/.local/runtime:$PATH" npm run test:dom
```

真实Chrome/WebGL画面、手机触控和观感**未验收**：当前独立Chrome插件工具不可用，未用CUA或其他浏览器绕行。DOM回归使用实际构建入口和真实测试API，但没有WebGL；模型测试保留真实几何/骨骼，跳过Node不支持的图片解码。SQLite会输出Node标准ExperimentalWarning。

仅复用已有LX/喵脆角/香蕉猫/奶蛙GLB及头像；小羊、青草和农场为程序化几何。没有奶龙、抚摸/抱起、多人、云账号、付费AI等伪按钮。原三个Demo与独立Sites工程本轮未修改/发布。
