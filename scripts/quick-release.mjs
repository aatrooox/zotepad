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

if (!versionType || !['patch', 'minor', 'major'].includes(versionType)) {
  console.error('请指定版本类型: patch, minor, 或 major')
  console.error('使用方法: pnpm release:patch / release:minor / release:major')
  process.exit(1)
}

console.log(`🚀 开始 ${versionType} 版本发布...`)

// 1. 读取当前版本号
const packageJsonPath = join(rootDir, 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
const currentVersion = packageJson.version
const [major, minor, patch] = currentVersion.split('.').map(Number)

// 2. 计算新版本号
let newVersion
if (versionType === 'major') {
  newVersion = `${major + 1}.0.0`
}
else if (versionType === 'minor') {
  newVersion = `${major}.${minor + 1}.0`
}
else {
  newVersion = `${major}.${minor}.${patch + 1}`
}

console.log(`📦 版本号: ${currentVersion} → ${newVersion}`)

// 3. 更新 package.json
packageJson.version = newVersion
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
console.log('✅ 已更新 package.json')

// 4. 更新 tauri.conf.json
const tauriConfPath = join(rootDir, 'src-tauri/tauri.conf.json')
try {
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'))
  tauriConf.version = newVersion
  writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`)
  console.log('✅ 已更新 src-tauri/tauri.conf.json')
}
catch (error) {
  console.error('❌ 更新 tauri.conf.json 失败', error)
  process.exit(1)
}

// 5. 更新 Cargo.toml
const cargoTomlPath = join(rootDir, 'src-tauri/Cargo.toml')
try {
  let cargoToml = readFileSync(cargoTomlPath, 'utf-8')
  cargoToml = cargoToml.replace(/^version = "[^"]+"/m, `version = "${newVersion}"`)
  writeFileSync(cargoTomlPath, cargoToml)
  console.log('✅ 已更新 src-tauri/Cargo.toml')
}
catch (error) {
  console.error('❌ 更新 Cargo.toml 失败', error)
  process.exit(1)
}

// 6. 生成 CHANGELOG（基于最近的 commits）
console.log('📝 生成更新日志...')
try {
  // 获取上一个 tag
  let lastTag
  try {
    lastTag = execSync('git describe --tags --abbrev=0', { cwd: rootDir, encoding: 'utf-8' }).trim()
  }
  catch {
    lastTag = '' // 没有之前的 tag
  }

  // 获取自上个 tag 以来的 commits
  const gitLogCmd = lastTag
    ? `git log ${lastTag}..HEAD --pretty=format:"- %s"`
    : 'git log --pretty=format:"- %s" -10' // 如果没有 tag，取最近 10 条

  const commits = execSync(gitLogCmd, { cwd: rootDir, encoding: 'utf-8' })
    .split('\n')
    .filter(line => line && !line.includes('chore(build): release')) // 过滤发版 commit
    .join('\n')

  // 生成 CHANGELOG 内容
  const changelogEntry = `## v${newVersion} (${new Date().toISOString().split('T')[0]})

${commits || '- 常规更新'}

`

  // 读取现有 CHANGELOG 或创建新的
  const changelogPath = join(rootDir, 'CHANGELOG.md')
  let existingChangelog = '# 更新日志\n\n'
  try {
    existingChangelog = readFileSync(changelogPath, 'utf-8')
  }
  catch {
    // CHANGELOG 不存在，使用默认标题
  }

  // 将新条目插入到标题后
  const updatedChangelog = existingChangelog.replace(
    /^(# .*\n\n)/,
    `$1${changelogEntry}`,
  )

  writeFileSync(changelogPath, updatedChangelog)
  console.log('✅ 已更新 CHANGELOG.md')
}
catch (error) {
  console.warn('⚠️ CHANGELOG 生成失败，将跳过', error.message)
}

// 7. Git 提交和推送
console.log('💾 提交更改...')
try {
  execSync('git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml CHANGELOG.md', { stdio: 'inherit', cwd: rootDir })
  execSync(`git commit -m "chore(build): release v${newVersion}"`, { stdio: 'inherit', cwd: rootDir })
  execSync(`git tag v${newVersion}`, { stdio: 'inherit', cwd: rootDir })
  console.log('✅ 已创建 commit 和 tag')
}
catch (error) {
  console.error('❌ Git 操作失败', error)
  process.exit(1)
}

// 7. 推送到远程
console.log('⬆️ 推送到远程仓库...')
try {
  execSync('git push --follow-tags', { stdio: 'inherit', cwd: rootDir })
  console.log('🎉 发布完成！')
  console.log('📋 GitHub Actions 将自动构建并创建 Release')
}
catch (error) {
  console.error('❌ 推送失败', error)
  console.error('💡 请手动执行: git push --follow-tags')
  process.exit(1)
}
