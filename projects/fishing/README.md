# 出海钓鱼 · v0.3.5

包版本 `0.3.5`；Sites 发布版本 `7`；发布源码 commit `55de7c92b90d54665d4f4772b793aa5be46e856b`。原线上地址：https://dreamina-fishing-avatars.mythicgleam32.chatgpt.site/

当前目录为该发布源码经过归档脱敏调整的副本，范围见 [差异说明](../../docs/legacy-demos/archive-differences.md)。保留前端、服务端、SQL迁移、GLB/图片/音频、生成与处理脚本及既有测试；不包含线上数据或凭据。

## 安装、构建、初始化、启动

Node.js **24.9.0**、npm **11.6.0**，其他版本未在本轮验证。最低声明 Node 22.13.0。

```sh
npm run install:ci
npm run typecheck
npm run build
npm run db:init
npm run start -- --port 5182
```

本地地址 `http://127.0.0.1:5182`。`db:init` 强制 `--local` 并应用 `drizzle/` 下 4 个迁移，使用与 `npm start` 相同的 `.wrangler/state`。可重复执行；已经应用的迁移不会重复应用。没有这步，页面可能返回200而共享API返回503。

开发模式：`npm run dev -- --port 5182`。开发插件与生产本地Worker可能使用不同的持久化目录；要验证数据保存，固定使用上面的 build/db:init/start 链路。不要把运行数据库提交到Git。原站点身份已从 `.openai/hosting.json` 移除；本地仍保留 `d1: DB`。线上部署需另外明确目标站点、平台和数据库配置。

## 阅读入口

- `app/page.tsx` → `components/fishing/FishingFeed.tsx`：实际首页和交互。
- `lib/fishing-server.ts`：共享状态与命令规则。
- `/api/fishing?room=ocean`：本工程主要状态API；相关路由在 `app/api/`。
- `db/`、`drizzle/`：schema和数据库迁移；`lib/*d1*`：存储适配。
- `public/build-info.json`：版本信息；`public/avatars/cast-v1/manifest.json`：上传角色映射。
- `build/`：仍需保留的构建插件与Worker源码；`dist/`：可再生成的构建产物。

本轮安装、类型检查、构建、迁移、HTTP启动验证结果详见 [验证报告](../../docs/legacy-demos/verification.md)。历史测试全量套件并非全部通过；模型几何测试较重，使用 `node --experimental-strip-types --test --test-concurrency=1 tests/*.test.*` 控制并发。浏览器/手机UI未验收。

## 恢复边界

运行资产可以直接使用，不需要先安装Blender或重新生成。旧生成脚本不等于当前全部上传GLB的可重建源；原始模型工程和私有参考输入缺失项见 [素材来源](../../docs/legacy-demos/assets-and-provenance.md)。多人共享状态需要同一个服务与D1；本地偏好、设备会话、数据库持久化和跨设备账号资产是不同概念。

查看 [开发指引](../../docs/legacy-demos/development-guide.md)、[体验原则](../../docs/legacy-demos/experience-principles.md) 和 [依赖许可](../../THIRD_PARTY_NOTICES.md) 后再构建新玩法。原角色目录与ID保留为历史基线，固定示例个人主页已使用中性内容。
