# 发版指南

本项目已配置 GitHub Actions 自动构建，支持自动打包 Android APK 和 macOS DMG 安装包。

## 快速发版

使用快速发版脚本可以一键完成版本更新和发布：

```bash
# 发布 patch 版本（默认）
pnpm quick-release

# 或者指定版本类型
pnpm quick-release patch   # 0.1.1 -> 0.1.2
pnpm quick-release minor   # 0.1.1 -> 0.2.0
pnpm quick-release major   # 0.1.1 -> 1.0.0
```

脚本会自动：
1. 同步更新所有文件的版本号
2. 使用 changelogen 更新版本号、生成 changelog 并创建 GitHub release
3. 流更改到远程仓库
4. 触发 GitHub Actions 构建并将构建产物上传到现有 release

## 自动发版流程

### 1. 创建发版标签

```bash
# 更新版本号（可选）
# 编辑 src-tauri/tauri.conf.json 中的 version 字段

# 创建并流标签
git tag v1.0.0
git push origin v1.0.0
```

### 2. 自动构建

流标签后，GitHub Actions 会自动触发构建流程：

- **macOS 构建器**：构建 Universal macOS DMG（支持 Intel 和 Apple Silicon）
- **Ubuntu 构建器**：构建 Android APK（ARM64 架构）

### 3. 自动发布

构建完成后，GitHub Actions 会自动：

1. 检测到 changelogen 已创建的 release
2. 将构建后的 DMG 和 APK 文件上传到现有 release
3. 更新 release 描述和资产文件
4. 标记为最新版本

> **注意**：changelogen 负责创建 release 和标签，GitHub Actions 只负责上传构建产物到现有 release，确保每个版本只有一个 release 且包含所有必要的构建文件。

## 手动触发构建

如需手动触发构建（无需创建标签）：

1. 访问 GitHub Actions 页面
2. 选择 "Release" 工作流
3. 点击 "Run workflow"
4. 选择分支并运行

## 构建产物

### macOS
- **文件格式**：`.dmg`
- **架构支持**：Universal Binary（Intel + Apple Silicon）
- **最低系统要求**：macOS 10.13+

### Android
- **文件格式**：`.apk`
- **架构支持**：ARM64
- **最低 API 级别**：24 (Android 7.0+)
- **目标 API 级别**：34 (Android 14)

## 本地构建

### 前置要求

```bash
# 安装依赖
pnpm install

# 安装 Tauri CLI
cargo install tauri-cli --version "^2.0"
```

### macOS 本地构建

```bash
# 构建 macOS 应用
cargo tauri build --target universal-apple-darwin
```

### Android 本地构建

```bash
# 初始化 Android 项目（首次）
cargo tauri android init

# 构建 APK
cargo tauri android build --apk
```

## 版本管理

### 版本号规范

遵循语义化版本控制（SemVer）：

- `v1.0.0` - 主要版本
- `v1.1.0` - 次要版本（新功能）
- `v1.0.1` - 补丁版本（bug 修复）

### 更新版本号

发版前需要更新以下文件中的版本号：

1. `src-tauri/tauri.conf.json` - `version` 字段
2. `package.json` - `version` 字段
3. `src-tauri/Cargo.toml` - `version` 字段

## 故障排除

### 常见问题

1. **Android 构建失败**
   - 检查 NDK 版本兼容性
   - 确认 Java 版本为 17
   - 验证 Android SDK 配置

2. **macOS 构建失败**
   - 检查 Xcode 版本
   - 确认代码签名配置
   - 验证依赖项安装

3. **发布权限问题**
   - 确认 GitHub Token 权限
   - 检查仓库 Actions 权限设置

### 调试构建

查看详细构建日志：

1. 访问 GitHub Actions 页面
2. 点击失败的工作流运行
3. 展开相关步骤查看日志
4. 根据错误信息进行修复

## 安全注意事项

- 所有构建都在 GitHub 提供的安全环境中进行
- 不会暴露任何敏感信息
- 发布的应用包经过完整性验证
- 建议用户从官方 GitHub Releases 下载

## 支持的平台

| 平台 | 架构 | 状态 |
|------|------|------|
| macOS | Universal (Intel + Apple Silicon) | ✅ 支持 |
| Android | ARM64 | ✅ 支持 |
| Windows | x64 | 🚧 计划中 |
| Linux | x64 | 🚧 计划中 |

---

如有问题，请在 GitHub Issues 中反馈。