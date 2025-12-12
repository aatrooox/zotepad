# ZotePad 数据库迁移脚本
# 从 app_v2.db 迁移到 app_v3.db

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("backup", "migrate")]
    [string]$Action = "backup"
)

$ErrorActionPreference = "Stop"

# 配置
$AppName = "com.zzaoclub.zotepad"
$AppNameDev = "com.zzaoclub.zotepad.dev"
$BackupDir = "$PSScriptRoot\database-backup"
$BackupTimestamp = Get-Date -Format "yyyyMMdd_HHmmss"

# 颜色输出
function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

# 1. 备份阶段
function Backup-Database {
    Write-ColorOutput "`n=== 第一步：备份数据库 ===" "Cyan"
    
    # 创建备份目录
    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir | Out-Null
        Write-ColorOutput "✓ 创建备份目录: $BackupDir" "Green"
    }
    
    # 查找所有可能的数据库位置
    $possiblePaths = @(
        "$env:APPDATA\$AppName\app_v2.db",
        "$env:APPDATA\$AppNameDev\app_v2.db",
        "$env:LOCALAPPDATA\$AppName\app_v2.db",
        "$env:LOCALAPPDATA\$AppNameDev\app_v2.db"
    )
    
    $foundDatabases = @()
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $foundDatabases += $path
            $size = (Get-Item $path).Length / 1KB
            Write-ColorOutput "  找到数据库: $path ($([math]::Round($size, 2)) KB)" "Yellow"
        }
    }
    
    if ($foundDatabases.Count -eq 0) {
        Write-ColorOutput "✗ 未找到任何 app_v2.db 文件" "Red"
        Write-ColorOutput "  可能的位置:" "Gray"
        $possiblePaths | ForEach-Object { Write-ColorOutput "  - $_" "Gray" }
        exit 1
    }
    
    # 备份所有找到的数据库
    foreach ($dbPath in $foundDatabases) {
        $fileName = Split-Path $dbPath -Parent | Split-Path -Leaf
        $backupName = "app_v2_${fileName}_${BackupTimestamp}.db"
        $backupPath = Join-Path $BackupDir $backupName
        
        Copy-Item $dbPath $backupPath -Force
        Write-ColorOutput "✓ 备份成功: $backupName" "Green"
        
        # 验证备份
        if (Test-Path $backupPath) {
            $originalSize = (Get-Item $dbPath).Length
            $backupSize = (Get-Item $backupPath).Length
            if ($originalSize -eq $backupSize) {
                Write-ColorOutput "  验证通过: 大小一致 ($([math]::Round($originalSize/1KB, 2)) KB)" "Green"
            } else {
                Write-ColorOutput "  警告: 备份文件大小不一致!" "Red"
            }
        }
    }
    
    Write-ColorOutput "`n备份完成！备份位置: $BackupDir" "Green"
    Write-ColorOutput "`n下一步操作:" "Cyan"
    Write-ColorOutput "1. 卸载 ZotePad 应用" "White"
    Write-ColorOutput "2. 删除应用数据目录:" "White"
    Write-ColorOutput "   - $env:APPDATA\$AppName" "Gray"
    Write-ColorOutput "   - $env:APPDATA\$AppNameDev" "Gray"
    Write-ColorOutput "3. 安装新版本应用" "White"
    Write-ColorOutput "4. 启动应用一次（创建 app_v3.db）" "White"
    Write-ColorOutput "5. 运行迁移命令: .\migrate-database.ps1 -Action migrate" "Yellow"
}

# 2. 迁移阶段
function Migrate-Database {
    Write-ColorOutput "`n=== 第二步：迁移数据 ===" "Cyan"
    
    # 检查 SQLite 是否安装
    $sqliteCmd = Get-Command sqlite3 -ErrorAction SilentlyContinue
    if (-not $sqliteCmd) {
        Write-ColorOutput "✗ 未找到 sqlite3 命令" "Red"
        Write-ColorOutput "  请先安装 SQLite:" "Yellow"
        Write-ColorOutput "  winget install SQLite.SQLite" "Gray"
        Write-ColorOutput "  或" "Gray"
        Write-ColorOutput "  scoop install sqlite" "Gray"
        exit 1
    }
    Write-ColorOutput "✓ SQLite 已安装: $($sqliteCmd.Source)" "Green"
    
    # 查找备份文件
    if (-not (Test-Path $BackupDir)) {
        Write-ColorOutput "✗ 备份目录不存在: $BackupDir" "Red"
        exit 1
    }
    
    $backupFiles = Get-ChildItem "$BackupDir\app_v2_*.db" | Sort-Object LastWriteTime -Descending
    if ($backupFiles.Count -eq 0) {
        Write-ColorOutput "✗ 未找到备份文件" "Red"
        exit 1
    }
    
    Write-ColorOutput "`n找到 $($backupFiles.Count) 个备份文件:" "Yellow"
    for ($i = 0; $i -lt $backupFiles.Count; $i++) {
        $file = $backupFiles[$i]
        Write-ColorOutput "  [$i] $($file.Name) ($([math]::Round($file.Length/1KB, 2)) KB, $($file.LastWriteTime))" "Gray"
    }
    
    $selection = Read-Host "`n请选择要迁移的备份 (0-$($backupFiles.Count-1))"
    $selectedBackup = $backupFiles[[int]$selection].FullName
    Write-ColorOutput "✓ 选择: $($backupFiles[[int]$selection].Name)" "Green"
    
    # 查找 v3 数据库
    $v3Paths = @(
        "$env:APPDATA\$AppName\app_v3.db",
        "$env:APPDATA\$AppNameDev\app_v3.db"
    )
    
    $v3Path = $null
    foreach ($path in $v3Paths) {
        if (Test-Path $path) {
            $v3Path = $path
            Write-ColorOutput "✓ 找到 app_v3.db: $v3Path" "Green"
            break
        }
    }
    
    if (-not $v3Path) {
        Write-ColorOutput "✗ 未找到 app_v3.db" "Red"
        Write-ColorOutput "  请先启动应用以创建数据库" "Yellow"
        exit 1
    }
    
    # 备份 v3（以防万一）
    $v3Backup = "$v3Path.before-migration"
    Copy-Item $v3Path $v3Backup -Force
    Write-ColorOutput "✓ 已备份 app_v3.db 到: $v3Backup" "Green"
    
    # 执行迁移
    Write-ColorOutput "`n开始迁移数据..." "Cyan"
    
    # 转义路径中的反斜杠
    $v2PathEscaped = $selectedBackup.Replace('\', '\\')
    
    $migrationSQL = @"
ATTACH DATABASE '$v2PathEscaped' AS old;

-- 迁移 settings
INSERT OR IGNORE INTO main.settings (key, value, category, created_at, updated_at)
SELECT key, value, COALESCE(category, 'general'), created_at, updated_at
FROM old.settings;

-- 迁移 notes（使用负数时间戳作为版本号，表示未同步）
INSERT OR IGNORE INTO main.notes (id, title, content, tags, version, deleted_at, created_at, updated_at)
SELECT id, title, content, COALESCE(tags, '[]'), -strftime('%s', created_at) * 1000, NULL, created_at, updated_at
FROM old.notes
WHERE deleted_at IS NULL OR deleted_at = '';

-- 迁移 moments（使用负数时间戳作为版本号）
INSERT OR IGNORE INTO main.moments (id, content, images, tags, version, deleted_at, created_at, updated_at)
SELECT id, content, COALESCE(images, '[]'), COALESCE(tags, '[]'), -strftime('%s', created_at) * 1000, NULL, created_at, updated_at
FROM old.moments
WHERE deleted_at IS NULL OR deleted_at = '';

-- 迁移 assets（使用负数时间戳作为版本号）
INSERT OR IGNORE INTO main.assets (id, url, path, filename, size, mime_type, storage_type, version, deleted_at, updated_at, created_at)
SELECT id, url, path, filename, size, mime_type, COALESCE(storage_type, 'cos'), -strftime('%s', created_at) * 1000, NULL, COALESCE(updated_at, created_at), created_at
FROM old.assets
WHERE deleted_at IS NULL OR deleted_at = '';

-- 迁移 workflows（使用负数时间戳作为版本号）
INSERT OR IGNORE INTO main.workflows (id, name, description, steps, schema, type, version, deleted_at, created_at, updated_at)
SELECT id, name, description, steps, COALESCE(schema, '[]'), COALESCE(type, 'user'), -strftime('%s', created_at) * 1000, NULL, created_at, updated_at
FROM old.workflows
WHERE (deleted_at IS NULL OR deleted_at = '') AND (type IS NULL OR type = 'user' OR NOT type LIKE 'system:%');

-- 迁移 workflow_schemas（如果表存在，不指定 deleted_at 使用默认值）
INSERT OR IGNORE INTO main.workflow_schemas (id, name, description, fields, created_at, updated_at)
SELECT id, name, description, fields, created_at, updated_at
FROM old.workflow_schemas
WHERE EXISTS (SELECT 1 FROM old.sqlite_master WHERE type='table' AND name='workflow_schemas');

-- 迁移 workflow_envs（如果表存在，字段名：key, value，不指定 deleted_at 使用默认值）
INSERT OR IGNORE INTO main.workflow_envs (id, key, value, created_at, updated_at)
SELECT id, key, value, created_at, updated_at
FROM old.workflow_envs
WHERE EXISTS (SELECT 1 FROM old.sqlite_master WHERE type='table' AND name='workflow_envs');

DETACH DATABASE old;

-- 查询迁移结果
.mode line
.headers on
SELECT 'notes' as table_name, COUNT(*) as count FROM notes
UNION ALL SELECT 'moments', COUNT(*) FROM moments
UNION ALL SELECT 'assets', COUNT(*) FROM assets
UNION ALL SELECT 'workflows', COUNT(*) FROM workflows
UNION ALL SELECT 'workflow_schemas', COUNT(*) FROM workflow_schemas
UNION ALL SELECT 'workflow_envs', COUNT(*) FROM workflow_envs
UNION ALL SELECT 'settings', COUNT(*) FROM settings;
"@
    
    # 创建临时 SQL 文件
    $tempSQL = Join-Path $BackupDir "migration_temp.sql"
    $migrationSQL | Out-File -FilePath $tempSQL -Encoding UTF8 -NoNewline
    
    # 执行迁移（直接传递 SQL 而不是通过文件）
    try {
        $output = $migrationSQL | & sqlite3 $v3Path
        Write-ColorOutput "`n✓ 迁移完成！" "Green"
        Write-ColorOutput "`n迁移结果:" "Cyan"
        Write-Output $output
    }
    catch {
        Write-ColorOutput "✗ 迁移失败: $_" "Red"
        Write-ColorOutput "  正在恢复备份..." "Yellow"
        Copy-Item $v3Backup $v3Path -Force
        Write-ColorOutput "✓ 已恢复备份" "Green"
        exit 1
    }
    finally {
        Remove-Item $tempSQL -Force -ErrorAction SilentlyContinue
    }
    
    Write-ColorOutput "`n迁移完成！请启动应用验证数据。" "Green"
    Write-ColorOutput "如果一切正常，可以删除备份文件:" "Gray"
    Write-ColorOutput "  - $v3Backup" "Gray"
    Write-ColorOutput "  - $BackupDir" "Gray"
}

# 主逻辑
switch ($Action) {
    "backup" {
        Backup-Database
    }
    "migrate" {
        Migrate-Database
    }
}
