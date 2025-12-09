# ZotePad – Copilot 指南

- **技术栈**：Nuxt 4 SPA（关闭 SSR）+ Tauri v2 壳。前端开发口 `http://localhost:4577`（见 `src-tauri/tauri.conf.json`）。Tailwind v4 由 `@tailwindcss/vite` 注入；shadcn 组件放在 `app/components/ui`，前缀与自动导入在 `nuxt.config.ts` 配好。
- **运行/构建**：桌面开发 `pnpm tauri dev`，Android 开发 `pnpm tauri android dev --open`，静态产物 `pnpm generate`（Tauri consume），发布构建 `pnpm tauri build` / `pnpm tauri android build`。纯 Nuxt 预览用 `pnpm dev -p 4577` 或 `pnpm preview`。
- **发布/版本号**：用 `scripts/quick-release.mjs [patch|minor|major] [--auto]`（封装 changelogen）。会更新 `package.json` 版本，同步 `src-tauri/tauri.conf.json` 与 `src-tauri/Cargo.toml`，并提交 `chore(build): release vX.Y.Z`。CI 只认该提交信息；`--auto` 会推送含 tag。
- **Android 签名**：`src-tauri/release.keystore` 与 `src-tauri/keystore.properties` 仅本地/私密。CI 需在 release environment 配 `ANDROID_*` secrets，并依赖 `src-tauri/gen/android/app/build.gradle.kts` 内的自定义签名段；若重跑 `pnpm tauri android init` 记得还原该文件。
- **运行时配置**：`nuxt.config.ts` 从环境注入 `public.cryptoSecretKey` (`NUXT_PUBLIC_CRYPTO_SECRET_KEY`)。工作流加密在 `app/lib/clientCrypto.ts` 与 `useWorkflowRunner` 里用到。
- **数据层**：数据库统一走 `useTauriSQL`（封装 `@tauri-apps/plugin-sql`），SQL 调用包一层 `useAsyncState.runAsync` 保持 `isLoading/error`。示例 CRUD 见 `app/composables/repositories/useNoteRepository.ts`。键值存储用 `useTauriStore`（单例文件 `app_settings.bin`）。避免直呼插件，保持一致的状态与错误处理。
- **HTTP**：统一用 `useTauriHTTP`（`@tauri-apps/plugin-http` 带重试/超时），不要直接 `fetch`。接口缓存+Token 管理走 `APIService`（`app/composables/useAPIService.ts`），缓存 key 形如 `cache:<key>`，提供 `fetchEndpointData` / `fetchServerData`。
- **工作流**：`useWorkflowRunner` 执行步骤流（API + JS），字符串支持 `{{ctx.xxx}}` 模板；对特定 URL 自动加密请求体；微信素材上传会先下载再转传（`@tauri-apps/plugin-http`），依赖上下文 `ctx.step1.data.accessToken` 等键。
- **环境提示**：`app/middleware/environment.global.ts` 结合 `app/config/routes.ts`，在非 Tauri 环境访问依赖客户端/数据库的页面时通过灵动岛提示，不阻拦跳转。新增受控路由请更新 `ROUTE_CONFIGS`。
- **日志/通知**：跨端日志用 `useLog`（Tauri log 插件，支持 tag/context），替代直接 `console`。通知走 `useTauriNotification`，挂载时自动检查权限。
- **UI 约定**：基础布局 `app/layouts/default.vue`；桌面/移动导航分别是 `AppNavBar` 与 `MobileTabBar`。动效常用 `gsap`、`motion-v`；新组件放 `app/components/app`；写页面优先使用 `app/components/ui`和`app/components/vue-bits`，状态提示优先用 `app/components/ui/sonner.vue`；移动端布局要合理利用屏幕空间；必要时，文字显示以简洁图标概括。
- **异步与安全**：大多 composable 暴露 `isLoading`/`error`（来自 `useAsyncState`），扩展时保持接口以兼容 UI 反馈。`useTauriServices` 负责一次性初始化（Store + SQL + 默认偏好）。
- **路由**：`ROUTE_CONFIGS` 中的路径才会标记 static/tauri-dependent/database-dependent；其他动态路由默认放行。需要 Tauri/DB 支撑的新页面记得登记以便提示。
- **开发习惯**：Tailwind 样式在 `app/assets/css/tailwind.css`，组件按 Nuxt 自动导入直接写模板。SSR 已关 (`ssr: false`)，插件调用通常包 `import.meta.client`。
- **构建故障排查**：CI Android 签名异常先看 secrets 与 `build.gradle.kts` 自定义段；HTTP 请求卡住确认 Tauri dev 端口（4577）与 env 前缀 `VITE_`/`TAURI_`。

如有缺漏或需补充具体流程，请指出要扩展的部分。
