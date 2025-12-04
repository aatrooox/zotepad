#!/bin/bash

# 快速发布脚本
# 使用方法: ./scripts/quick-release.sh [patch|minor|major] [--auto]

set -e

# 检查参数
if [ $# -eq 0 ]; then
    echo "请指定版本类型: patch, minor, 或 major"
    echo "使用方法: ./scripts/quick-release.sh [patch|minor|major] [--auto]"
    echo "  --auto: 自动执行所有步骤（包括 git push 和创建 release）"
    exit 1
fi

VERSION_TYPE=$1
AUTO_MODE=false

# 检查是否有 --auto 参数
if [ $# -eq 2 ] && [ "$2" = "--auto" ]; then
    AUTO_MODE=true
fi

# 验证版本类型
if [[ "$VERSION_TYPE" != "patch" && "$VERSION_TYPE" != "minor" && "$VERSION_TYPE" != "major" ]]; then
    echo "错误: 版本类型必须是 patch, minor, 或 major"
    exit 1
fi

echo "🚀 开始 $VERSION_TYPE 版本发布..."
if [ "$AUTO_MODE" = true ]; then
    echo "🤖 自动模式已启用"
fi

# 使用 changelogen 更新 package.json 版本号和生成 changelog
echo "📝 使用 changelogen 更新版本号和生成 changelog..."
case $VERSION_TYPE in
    "patch")
        pnpm release:patch
        ;;
    "minor")
        pnpm release:minor
        ;;
    "major")
        pnpm release:major
        ;;
esac

# 获取更新后的版本号
NEW_VERSION=$(node -p "require('./package.json').version")
echo "📦 新版本: v$NEW_VERSION"

# 同步更新 Tauri 相关文件的版本号
echo "🔧 同步 Tauri 版本号到 $NEW_VERSION..."

# 更新 tauri.conf.json
node -e "
const fs = require('fs');
const path = require('path');
const tauriConfPath = path.join(__dirname, 'src-tauri/tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = '$NEW_VERSION';
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
console.log('✅ 已更新 src-tauri/tauri.conf.json');
"

# 更新 Cargo.toml
node -e "
const fs = require('fs');
const path = require('path');
const cargoTomlPath = path.join(__dirname, 'src-tauri/Cargo.toml');
let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
cargoToml = cargoToml.replace(/^version = \"[^\"]+\"/m, 'version = \"$NEW_VERSION\"');
fs.writeFileSync(cargoTomlPath, cargoToml);
console.log('✅ 已更新 src-tauri/Cargo.toml');
"

# 提交 Tauri 版本同步更新
echo "💾 提交 Tauri 版本同步更新..."
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore(build): release v$NEW_VERSION"

echo "✅ 版本号更新完成！"

if [ "$AUTO_MODE" = true ]; then

    echo "🔄 自动执行后续步骤..."
    
    # changelogen 已自动创建标签和 release，只需要流
    echo "⬆️ 流到远程仓库..."
    git push --follow-tags
    
    echo "🎉 自动发布完成！"
    echo "📋 GitHub Actions 将自动构建并更新现有 Release"
else
    # 手动模式：提示用户手动执行
    echo ""
    echo "📋 接下来请手动执行以下步骤:"
    echo "1. 检查生成的 CHANGELOG.md 和 package.json 文件"
    echo "2. 流更改和标签:"
    echo "   git push --follow-tags"
    echo "3. GitHub Actions 将自动构建并更新现有 Release"
    echo ""
    echo "🎉 发布准备完成！"
    echo "💡 提示: 使用 --auto 参数可自动执行所有步骤"
fi
