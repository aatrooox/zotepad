# Tauri v2 + Nuxt 4 跨平台应用模板

这是一个基于 **Tauri v2** 和 **Nuxt 4** 构建的高性能、跨平台客户端应用模板。它集成了现代化的前端技术栈和常用的桌面端能力，旨在提供开箱即用的开发体验。

## ✨ 特性

- 🚀 **Tauri v2**: 更小、更快、更安全的跨平台构建核心。
- 💚 **Nuxt 4**: 极致的 Vue 3 开发体验，支持 SSR/SSG。
- 🎨 **UI 系统**: 集成 **Tailwind CSS** 和 **Shadcn Vue** 组件库。
- 💾 **数据持久化**:
  - **SQLite**: 基于 Repository 模式封装的本地数据库支持。
  - **Store**: 简单的键值对持久化存储。
- 🔔 **系统能力**: 集成系统通知、HTTP 客户端、日志系统。
- 🏗 **架构设计**: 清晰的分层架构 (UI -> Repository -> Infrastructure)。
- 🤖 **自动化部署**: 完善的 GitHub Actions 流程，支持 macOS, Windows, Android 自动构建发布。

## 🛠 技术栈

- **Core**: Rust, Tauri v2
- **Frontend**: Vue 3, Nuxt 4, TypeScript
- **Styling**: Tailwind CSS, Shadcn Vue
- **State/Async**: Vue Composables, `useAsyncState`
- **Plugins**:
  - `@tauri-apps/plugin-sql`
  - `@tauri-apps/plugin-store`
  - `@tauri-apps/plugin-http`
  - `@tauri-apps/plugin-notification`
  - `vue-sonner` (Toast)

## 🚀 快速开始

### 环境要求

- **Node.js**: v18+
- **Package Manager**: pnpm (推荐)
- **Rust**: 最新稳定版 (用于 Tauri 构建)
- **移动端开发**: Android Studio (如果需要构建 Android 应用)

### 安装与运行

1. **克隆项目**
   ```bash
   git clone <your-repo-url>
   cd tauri2-nuxt4-app
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **开发模式**
   ```bash
   # 启动 Nuxt + Tauri 开发环境
   pnpm tauri dev
   
   # 仅启动 Web 端 (浏览器调试)
   pnpm dev
   ```

## 📂 架构与使用指南

本项目采用了 **Repository 模式** 来分离业务逻辑与底层数据访问，确保代码的可维护性。

### 1. 数据库操作 (SQLite)

不要直接在组件中编写 SQL，请使用 `composables/repositories` 中的 Repository。

**示例：用户管理**

```typescript
import { useUserRepository } from '~/composables/repositories/useUserRepository'

const { createUser, getAllUsers, isLoading } = useUserRepository()

// 创建用户
await createUser('Alice', 'alice@example.com')

// 获取列表
const users = await getAllUsers()
```

**扩展新表**：
1. 在 `src-tauri/src/lib.rs` 的 Migration 中添加建表语句。
2. 在 `app/types/models.ts` 定义类型。
3. 在 `app/composables/repositories/` 创建新的 Repository。

### 2. 持久化存储 (Store)

用于存储简单的配置项，如主题、语言等。

```typescript
const { setItem, getItem } = useTauriStore()

await setItem('theme', 'dark')
const theme = await getItem('theme')
```

### 3. HTTP 请求

封装了 Tauri 的原生 HTTP 插件，规避 CORS 问题。

```typescript
const { get, post } = useTauriHTTP()

const data = await get('https://api.example.com/data')
```

## 📦 构建与发布 (GitHub Actions)

本项目配置了自动化的 CI/CD 流程 (`.github/workflows/release.yml`)，支持自动构建并发布 Release 到 GitHub。

### 触发构建

构建流程通过 **Git Commit Message** 触发。只有符合特定格式的提交才会触发构建流程。

**触发格式：**
```text
chore(build): release vX.Y.Z
```

**示例：**
```bash
git add .
git commit -m "chore(build): release v1.0.0"
git push origin main
```

### 构建产物

GitHub Actions 会自动并行构建以下平台的安装包：

| 平台 | 产物格式 | 说明 |
|------|----------|------|
| **macOS** | `.dmg` | Universal (支持 Intel & Apple Silicon) |
| **Windows** | `.msi`, `.exe` | x64 |
| **Android** | `.apk` | arm64-v8a |

构建完成后，会自动创建一个 GitHub Release，并上传所有产物。

### 本地构建

如果你需要在本地构建：

```bash
# 构建桌面端 (macOS/Windows/Linux)
pnpm tauri build

# 构建 Android
pnpm tauri android build
```

### 🔐 Android 签名配置

为了让别人拉取代码后也能顺利打出属于自己的 APK，需要准备本地 keystore，并在 CI 中配置相应的 Secrets：

#### 本地 keystore

1. 生成 keystore（Windows 需按实际 JDK 路径调整 `keytool` 命令）：
   ```bash
   keytool -genkeypair \
     -keystore release.keystore \
     -alias your-alias \
     -keyalg RSA \
     -keysize 2048 \
     -validity 10000
   ```
2. 将生成的 `release.keystore` 放在 `src-tauri/` 目录。
3. 在同级目录创建 `src-tauri/keystore.properties`（该文件已在 `.gitignore` 中，不会被提交），内容示例：
   ```properties
   keyAlias=your-alias
   keyPassword=your-key-password
   storeFile=release.keystore
   storePassword=your-store-password
   ```
4. 本地运行 `pnpm tauri android build --apk --target aarch64` 时会自动读取该文件完成签名。

> ⚠️ 切勿把真实的 `release.keystore` 和 `keystore.properties` 推到仓库。必要时可以提供 `keystore.properties.example` 让其他人自行复制填写。

> ⚠️ 注意：`src-tauri/gen/android/app/build.gradle.kts` 中包含了确保 GitHub Actions 正确签名 APK 的自定义逻辑。如果执行 `pnpm tauri android init` 重新生成 Android 项目，请务必用仓库里的版本覆盖该文件，否则 CI 只能得到未签名的包。

#### GitHub Secrets（Environment）

CI 会在 `release` environment 下读取以下 Secrets，请根据自己的 keystore 配置：

| Secret 名称 | 说明 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `release.keystore` 的 Base64 字符串（用于在 CI 中还原文件） |
| `ANDROID_KEY_ALIAS` | keystore 中的 Key Alias |
| `ANDROID_KEY_PASSWORD` | Key Alias 对应的密码 |
| `ANDROID_STORE_PASSWORD` | keystore 文件密码（若只设置过一个口令，则与前者相同） |

在 GitHub 仓库的 **Settings → Environments → release** 中设置上述 Secrets 后，`.github/workflows/release.yml` 会自动：

- 将 Base64 恢复成 `src-tauri/release.keystore`；
- 生成临时的 `src-tauri/keystore.properties`；
- 使用该证书完成签名并生成带版本号的 APK。

### 修改App名称

需要删除 `gen/android`，然后重新 `pnpm tauri android init`

> ⚠️ 注意：`src-tauri/gen/android/app/build.gradle.kts` 中包含了确保 GitHub Actions 正确签名 APK 的自定义逻辑。如果执行 `pnpm tauri android init` 重新生成 Android 项目，请务必用仓库里的版本覆盖该文件，否则 CI 只能得到未签名的包。

### 修改App图标

无需自己处理图片，只需要运行 `pnpm tauri icon "W:\images\AppIcons\zotepate_0.6.0.png" ` （替换为自己真实文件路径）即可自动设置所有端的图标

## 📁 目录结构

```
├── .github/            # GitHub Actions 配置
├── app/                # Nuxt 前端源码
│   ├── components/     # Vue 组件 (包含 Shadcn UI)
│   ├── composables/    # 组合式函数
│   │   ├── repositories/ # 数据访问层 (业务逻辑)
│   │   └── ...           # 基础设施层 (SQL, HTTP, Store)
│   ├── pages/          # 页面路由
│   └── utils/          # 工具函数
├── src-tauri/          # Rust 后端源码
│   ├── src/            # Rust 核心逻辑
│   ├── capabilities/   # 权限配置
│   └── tauri.conf.json # Tauri 配置文件
└── nuxt.config.ts      # Nuxt 配置
```
