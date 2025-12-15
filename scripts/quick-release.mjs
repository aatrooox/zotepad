import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

// 获取参数
const args = process.argv.slice(2)
const versionType = args[0]
const autoMode = args.includes('--auto')

if (!versionType || !['patch', 'minor', 'major'].includes(versionType)) {
  console.error('请指定版本类型: patch, minor, 或 major')
  console.error('使用方法: node scripts/quick-release.mjs [patch|minor|major] [--auto]')
  console.error('  --auto: 自动执行所有步骤（包括 git push 和创建 release）')
  process.exit(1)
}

console.log(`🚀 开始 ${versionType} 版本发布...`)
if (autoMode) {
  console.log('🤖 自动模式已启用')
}

// 1. 使用 changelogen 更新 package.json 版本号和生成 changelog
console.log('📝 使用 changelogen 更新版本号和生成 changelog...')
try {
  execSync(`pnpm release:${versionType}`, { stdio: 'inherit', cwd: rootDir })
}
catch {
  console.error('❌ changelogen 执行失败')
  process.exit(1)
}

// 2. 获取更新后的版本号
const packageJsonPath = join(rootDir, 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
const newVersion = packageJson.version
console.log(`📦 新版本: v${newVersion}`)

// 3. 同步更新 Tauri 相关文件的版本号
console.log(`🔧 同步 Tauri 版本号到 ${newVersion}...`)

// 更新 tauri.conf.json
const tauriConfPath = join(rootDir, 'src-tauri/tauri.conf.json')
try {
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'))
  tauriConf.version = newVersion
  writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`)
  console.log('✅ 已更新 src-tauri/tauri.conf.json')
}
catch (error) {
  console.error('❌ 更新 tauri.conf.json 失败', error)
}

// 更新 Cargo.toml
const cargoTomlPath = join(rootDir, 'src-tauri/Cargo.toml')
try {
  let cargoToml = readFileSync(cargoTomlPath, 'utf-8')
  cargoToml = cargoToml.replace(/^version = "[^"]+"/m, `version = "${newVersion}"`)
  writeFileSync(cargoTomlPath, cargoToml)
  console.log('✅ 已更新 src-tauri/Cargo.toml')
}
catch (error) {
  console.error('❌ 更新 Cargo.toml 失败', error)
}

// 4. 提交 Tauri 版本同步更新
console.log('💾 提交 Tauri 版本同步更新...')
try {
  execSync(`git add src-tauri/tauri.conf.json src-tauri/Cargo.toml`, { stdio: 'inherit', cwd: rootDir })
  execSync(`git commit -m "chore(build): release v${newVersion}"`, { stdio: 'inherit', cwd: rootDir })
}
catch (error) {
  console.error('❌ Git 提交失败', error)
  // 不退出，可能没有文件变更
}

console.log('✅ 版本号更新完成！')

if (autoMode) {
  console.log('🔄 自动执行后续步骤...')
  console.log('⬆️ 流到远程仓库...')
  try {
    execSync('git push --follow-tags', { stdio: 'inherit', cwd: rootDir })
    console.log('🎉 自动发布完成！')
    console.log('📋 GitHub Actions 将自动构建并更新现有 Release')
  }
  catch (error) {
    console.error('❌ 流失败', error)
    process.exit(1)
  }
}
else {
  console.log('')
  console.log('📋 接下来请手动执行以下步骤:')
  console.log('1. 检查生成的 CHANGELOG.md 和 package.json 文件')
  console.log('2. 流更改和标签:')
  console.log('   git push --follow-tags')
  console.log('3. GitHub Actions 将自动构建并更新现有 Release')
  console.log('')
  console.log('🎉 发布准备完成！')
  console.log('💡 提示: 使用 --auto 参数可自动执行所有步骤')
}
