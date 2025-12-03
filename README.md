# ZotePad

ZotePad 是一个基于 **Tauri v2** 和 **Nuxt 4** 构建的现代化、高性能跨平台笔记与资源管理应用。

## ✨ 功能特性

- **📝 强大的 Markdown 编辑器**
  - 集成 `md-editor-v3`，支持实时预览。
  - **图片自动上传**：支持粘贴/选择图片自动上传至腾讯云 COS，并插入 Markdown 链接。

- **📱 极致的移动端适配**
  - **沉浸式体验**：完美适配刘海屏、动态状态栏高度（Safe Area）。
  - **手势交互**：使用 Bottom Sheet（抽屉）和悬浮操作栏，符合单手操作习惯。
  - **响应式布局**：桌面端侧边栏与移动端底部导航栏自动切换。

- **💾 数据与存储**
  - **本地优先**：使用 SQLite 本地数据库存储笔记索引与元数据，离线可用。
  - **云端资源**：图片与附件对接腾讯云 COS 对象存储，轻量化本地体积。
  - **Repository 模式**：清晰的数据访问层设计，业务逻辑与数据库解耦。

- **🎨 现代化 UI 设计**
  - 基于 **Tailwind CSS** 和 **Shadcn Vue** 构建。
  - 精美的动画交互（GSAP）。
  - 支持深色/浅色模式自适应。

## 🛠 技术栈

| 领域 | 技术选型 | 说明 |
|------|----------|------|
| **Core** | Rust, Tauri v2 | 跨平台构建核心，提供系统级能力 |
| **Frontend** | Nuxt 4, Vue 3 | 极速的 Web 开发体验，SSG |
| **Language** | TypeScript | 全类型安全 |
| **UI Framework** | Tailwind CSS, Shadcn Vue | 样式与组件库 |
| **Database** | SQLite (`@tauri-apps/plugin-sql`) | 本地关系型数据库 |
| **Storage** | Tencent Cloud COS | 对象存储服务 |
| **Editor** | md-editor-v3 | Markdown 编辑器内核 |
| **Animation** | GSAP | 复杂的 UI 过渡动画 |

## 🚀 快速开始

### 环境要求

- **Node.js**: v18+
- **Package Manager**: pnpm (推荐)
- **Rust**: 最新稳定版 (用于 Tauri 构建)
- **Android Studio**: 用于 Android 模拟器调试与 SDK 管理

### 安装与运行

1. **克隆项目**
   ```bash
   git clone <your-repo-url>
   cd zotepad
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **开发模式**
   ```bash
   # 启动桌面端开发环境
   pnpm tauri dev
   
   # 启动 Android 开发环境 (打开Android Studio 以启动真机调试)
   pnpm tauri android dev --open
   ```

---

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

因此推荐使用已有脚本进行更新：

```bash
pnpm quick-release-patch-auto
pnpm quick-release-minor-auto
pnpm quick-release-major-auto
```
在更新了`package.json`后，会自动更新`src-tauri`里的版本


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

为了顺利打出属于自己的 APK，需要准备本地 keystore，并在 CI 中配置相应的 Secrets：

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
2. 将生成的 `release.keystore` 放在 [`src-tauri`](src-tauri ) 目录。
3. 在同级目录创建 [`src-tauri/keystore.properties`](src-tauri/keystore.properties )（该文件已在 [`.gitignore`](.gitignore ) 中，不会被提交），内容示例：
   ```properties
   keyAlias=your-alias
   keyPassword=your-key-password
   storeFile=release.keystore
   storePassword=your-store-password
   ```
4. 本地运行 `pnpm tauri android build --apk --target aarch64` 时会自动读取该文件完成签名。

> ⚠️ 切勿把真实的 `release.keystore` 和 `keystore.properties` 推到仓库。必要时可以提供 `keystore.properties.example` 让其他人自行复制填写。

> ⚠️ **重要提示**：[`src-tauri/gen/android/app/build.gradle.kts`](src-tauri/gen/android/app/build.gradle.kts ) 中包含了确保 GitHub Actions 正确签名 APK 的自定义逻辑。如果执行 `pnpm tauri android init` 重新生成 Android 项目，请务必用仓库里的版本覆盖该文件，否则 CI 只能得到未签名的包。

#### GitHub Secrets（Environment）

CI 会在 `release` environment 下读取以下 Secrets，请根据自己的 keystore 配置：

| Secret 名称 | 说明 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `release.keystore` 的 Base64 字符串（用于在 CI 中还原文件） |
| `ANDROID_KEY_ALIAS` | keystore 中的 Key Alias |
| `ANDROID_KEY_PASSWORD` | Key Alias 对应的密码 |
| `ANDROID_STORE_PASSWORD` | keystore 文件密码（若只设置过一个口令，则与前者相同） |

在 GitHub 仓库的 **Settings → Environments → release** 中设置上述 Secrets 后，[`.github/workflows/release.yml`](.github/workflows/release.yml ) 会自动：

- 将 Base64 恢复成 [`src-tauri/release.keystore`](src-tauri/release.keystore )；
- 生成临时的 [`src-tauri/keystore.properties`](src-tauri/keystore.properties )；
- 使用该证书完成签名并生成带版本号的 APK。

### 修改 App 名称

需要删除 `gen/android`，然后重新 `pnpm tauri android init`

> ⚠️ 注意：重新 init 后，请务必检查并恢复 `build.gradle.kts` 中的签名逻辑配置。

### 修改 App 图标

无需自己处理图片，只需要运行 `pnpm tauri icon "W:\images\AppIcons\zotepate_0.6.0.png" ` （替换为自己真实文件路径）即可自动设置所有端的图标。
