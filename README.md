# ZotePad

ZotePad 是一个基于 **Tauri v2** 和 **Nuxt 4** 构建的本地优先（Local-First）跨平台笔记应用。

作为一个全栈开发者，在尝试了众多笔记工具后，我依然面临几个痛点：数据隐私顾虑、Markdown 图片上传繁琐、以及跨端应用在移动端往往缺乏原生交互感。

ZotePad 旨在解决这些问题，提供一个既拥有桌面端强大编辑能力，又具备移动端原生体验的解决方案。

## 核心特性

### 1. 优化的 Markdown 写作体验
集成 `md-editor-v3` 内核，专注于提升写作流畅度。
- **自动化图床**：解决了 Markdown 写作中图片管理的痛点。支持粘贴或选择图片后自动上传至腾讯云 COS，并自动插入链接。
- **实时预览**：所见即所得的编辑体验。

### 2. 深度适配移动端
虽然是混合开发应用，但在移动端交互上下了很大功夫。
- **原生级适配**：精确处理了刘海屏、动态岛等 Safe Area 布局。
- **符合直觉的交互**：在移动端自动切换为底部导航（Tab Bar）和抽屉式（Bottom Sheet）菜单，支持手势操作，确保单手使用的便利性。

### 3. 数据自主与混合存储
- **本地优先**：核心数据（笔记、索引）存储于本地 SQLite 数据库，不依赖第三方云服务，确保数据完全私有且离线可用。
- **混合架构**：文本数据本地存储，大文件（图片/附件）云端存储，平衡了隐私安全与存储体积。
- **局域网同步**：支持在局域网内将桌面端作为服务器，与移动端直接同步数据，无需经过公网。

### 4. 记录激励系统
内置了一个轻量级的成就系统。通过统计字数、记录天数等维度计算经验值（EXP），为单纯的记录过程增加一些正向反馈。

## 技术栈选型

本项目采用了一套现代化的混合开发技术栈，旨在平衡开发效率与应用性能：

| 模块 | 技术选型 | 考量 |
|------|----------|------|
| **App Shell** | **Tauri v2** (Rust) | 相比 Electron 拥有更小的体积和更低的内存占用，且 v2 版本原生支持 Android/iOS。 |
| **Frontend** | **Nuxt 4** (Vue 3) | 利用 Nuxt 的自动导入和模块化特性极大提升开发效率，配合 Vue 3 Composition API 处理复杂逻辑。 |
| **UI System** | **Tailwind CSS** + **Shadcn** | 实用主义的样式解决方案，保证了多端 UI 的一致性与美观度。 |
| **Database** | **SQLite** | 成熟可靠的嵌入式关系型数据库，适合本地数据持久化。 |
| **Animation** | **GSAP** | 处理复杂的 UI 过渡动画，提升应用的精致感。 |

## 快速开始

如果你对这个技术栈感兴趣，或者想部署一套自己的私有笔记系统：

### 环境准备
- Node.js (v18+)
- pnpm
- Rust (最新稳定版)
- Android Studio (仅 Android 开发需要)

### 运行项目

1. **克隆仓库**
   ```bash
   git clone <your-repo-url>
   cd zotepad
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **启动开发环境**
   ```bash
   # 桌面端
   pnpm tauri dev
   
   # Android 端 (需连接真机或模拟器)
   pnpm tauri android dev --open
   ```

## 构建与发布

项目配置了基于 GitHub Actions 的 CI/CD 流程。

- **自动构建**：提交信息包含 `chore(build): release vX.Y.Z` 时触发。
- **多端产物**：自动生成 Windows (.msi/.exe), macOS (.dmg) 和 Android (.apk) 安装包。
- **版本管理**：推荐使用内置脚本管理版本：
  ```bash
  pnpm quick-release-patch-auto
  ```

### Android 签名说明
为了生成 Release 版 APK，需配置本地 Keystore。
详细配置请参考 `src-tauri/keystore.properties` 文件注释。CI 环境需在 Secrets 中配置 `ANDROID_KEYSTORE_BASE64` 等变量以实现自动签名。

---

欢迎提交 Issue 或 PR，共同完善这个小工具。
