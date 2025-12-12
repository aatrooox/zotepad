# ZotePad 数据库迁移脚本
# 从 app_v3.db 迁移到 app_v4.db

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("backup", "migrate")]
    [string]$Action = "backup"
)

$ErrorActionPreference = "Stop"

# 配置
$AppName = "com.zzaoclub.zotepad"
$AppNameDev = "com.zzaoclub.zotepad.dev"
$BackupDir = "$PSScriptRoot\database-backup-v3"
$BackupTimestamp = Get-Date -Format "yyyyMMdd_HHmmss"

# 颜色输出
function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

# 1. 备份阶段
function Backup-Database {
    Write-ColorOutput "`n=== 第一步：备份数据库 (v3) ===" "Cyan"
    
    # 创建备份目录
    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir | Out-Null
        Write-ColorOutput "✓ 创建备份目录: $BackupDir" "Green"
    }
    
    # 查找所有可能的数据库位置
    $possiblePaths = @(
        "$env:APPDATA\$AppName\app_v3.db",
        "$env:APPDATA\$AppNameDev\app_v3.db",
        "$env:LOCALAPPDATA\$AppName\app_v3.db",
        "$env:LOCALAPPDATA\$AppNameDev\app_v3.db",
        # 开发环境可能的位置
        "$PSScriptRoot\..\src-tauri\target\debug\app_v3.db",
        "$PSScriptRoot\..\src-tauri\target\release\app_v3.db"
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
        Write-ColorOutput "✗ 未找到任何 app_v3.db 文件" "Red"
        Write-ColorOutput "  可能的位置:" "Gray"
        $possiblePaths | ForEach-Object { Write-ColorOutput "  - $_" "Gray" }
        exit 1
    }
    
    # 备份所有找到的数据库
    foreach ($dbPath in $foundDatabases) {
        $fileName = Split-Path $dbPath -Parent | Split-Path -Leaf
        # 如果是 target/debug 这种，文件名可能重复，加个前缀
        if ($dbPath -match "target") {
            $prefix = "dev_"
        } else {
            $prefix = "prod_"
        }
        
        $backupName = "app_v3_${prefix}${BackupTimestamp}.db"
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
    Write-ColorOutput "1. 启动新版本应用一次（创建 app_v4.db）" "White"
    Write-ColorOutput "2. 运行迁移命令: .\migrate-v3-to-v4.ps1 -Action migrate" "Yellow"
}

# 2. 迁移阶段
function Migrate-Database {
    Write-ColorOutput "`n=== 第二步：迁移数据 (v3 -> v4) ===" "Cyan"
    
    # 检查 SQLite 是否安装
    $sqliteCmd = Get-Command sqlite3 -ErrorAction SilentlyContinue
    if (-not $sqliteCmd) {
        Write-ColorOutput "✗ 未找到 sqlite3 命令" "Red"
        Write-ColorOutput "  请先安装 SQLite:" "Yellow"
        Write-ColorOutput "  winget install SQLite.SQLite" "Gray"
        exit 1
    }
    Write-ColorOutput "✓ SQLite 已安装: $($sqliteCmd.Source)" "Green"
    
    # 查找备份文件
    if (-not (Test-Path $BackupDir)) {
        Write-ColorOutput "✗ 备份目录不存在: $BackupDir" "Red"
        exit 1
    }
    
    $backupFiles = Get-ChildItem "$BackupDir\app_v3_*.db" | Sort-Object LastWriteTime -Descending
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
    
    # 查找 v4 数据库
    $v4Paths = @(
        "$env:APPDATA\$AppName\app_v4.db",
        "$env:APPDATA\$AppNameDev\app_v4.db",
        "$PSScriptRoot\..\src-tauri\target\debug\app_v4.db",
        "$PSScriptRoot\..\src-tauri\target\release\app_v4.db"
    )
    
    $v4Path = $null
    foreach ($path in $v4Paths) {
        if (Test-Path $path) {
            $v4Path = $path
            Write-ColorOutput "✓ 找到 app_v4.db: $v4Path" "Green"
            break
        }
    }
    
    if (-not $v4Path) {
        Write-ColorOutput "✗ 未找到 app_v4.db" "Red"
        Write-ColorOutput "  请先启动应用以创建数据库" "Yellow"
        exit 1
    }
    
    # 备份 v4（以防万一）
    $v4Backup = "$v4Path.before-migration"
    Copy-Item $v4Path $v4Backup -Force
    Write-ColorOutput "✓ 已备份 app_v4.db 到: $v4Backup" "Green"
    
    # 执行迁移
    Write-ColorOutput "`n开始迁移数据..." "Cyan"
    
    # 转义路径中的反斜杠
    $v3PathEscaped = $selectedBackup.Replace('\', '\\')
    
    $migrationSQL = @"
ATTACH DATABASE '$v3PathEscaped' AS old;

-- 迁移 settings
INSERT OR IGNORE INTO main.settings (key, value, category, created_at, updated_at)
SELECT key, value, 
       CASE WHEN (SELECT COUNT(*) FROM old.sqlite_master WHERE type='table' AND name='settings' AND sql LIKE '%category%') > 0 
            THEN category 
            ELSE 'general' 
       END, 
       created_at, updated_at
FROM old.settings;

-- 迁移 users
INSERT OR IGNORE INTO main.users SELECT * FROM old.users;

-- 迁移 notes
INSERT OR IGNORE INTO main.notes SELECT * FROM old.notes;

-- 迁移 moments
INSERT OR IGNORE INTO main.moments SELECT * FROM old.moments;

-- 迁移 assets
INSERT OR IGNORE INTO main.assets SELECT * FROM old.assets;

-- 迁移 workflows
-- 注意：v3 可能没有 schema_id，也可能没有 deleted_at (如果是在 Migration 3 之前创建的)
-- v4 肯定有 schema_id 和 deleted_at
INSERT OR IGNORE INTO main.workflows (id, name, description, steps, schema_id, type, version, deleted_at, created_at, updated_at)
SELECT 
    id, name, description, steps, 
    CASE WHEN (SELECT COUNT(*) FROM old.sqlite_master WHERE type='table' AND name='workflows' AND sql LIKE '%schema_id%') > 0 
         THEN schema_id 
         ELSE NULL 
    END,
    type, version, 
    CASE WHEN (SELECT COUNT(*) FROM old.sqlite_master WHERE type='table' AND name='workflows' AND sql LIKE '%deleted_at%') > 0 
         THEN deleted_at 
         ELSE NULL 
    END,
    created_at, updated_at
FROM old.workflows;

-- 迁移 workflow_schemas (如果存在)
INSERT OR IGNORE INTO main.workflow_schemas 
SELECT * FROM old.workflow_schemas 
WHERE EXISTS (SELECT 1 FROM old.sqlite_master WHERE type='table' AND name='workflow_schemas');

-- 迁移 workflow_envs (如果存在)
INSERT OR IGNORE INTO main.workflow_envs 
SELECT * FROM old.workflow_envs 
WHERE EXISTS (SELECT 1 FROM old.sqlite_master WHERE type='table' AND name='workflow_envs');

-- 迁移 achievements 相关表 (如果存在)
INSERT OR IGNORE INTO main.achievements SELECT * FROM old.achievements WHERE EXISTS (SELECT 1 FROM old.sqlite_master WHERE type='table' AND name='achievements');
INSERT OR IGNORE INTO main.user_achievements SELECT * FROM old.user_achievements WHERE EXISTS (SELECT 1 FROM old.sqlite_master WHERE type='table' AND name='user_achievements');
INSERT OR IGNORE INTO main.user_stats SELECT * FROM old.user_stats WHERE EXISTS (SELECT 1 FROM old.sqlite_master WHERE type='table' AND name='user_stats');
INSERT OR IGNORE INTO main.user_points_log SELECT * FROM old.user_points_log WHERE EXISTS (SELECT 1 FROM old.sqlite_master WHERE type='table' AND name='user_points_log');
INSERT OR IGNORE INTO main.user_achievement_profile SELECT * FROM old.user_achievement_profile WHERE EXISTS (SELECT 1 FROM old.sqlite_master WHERE type='table' AND name='user_achievement_profile');

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
    $tempSQL = Join-Path $BackupDir "migration_v3_v4_temp.sql"
    $migrationSQL | Out-File -FilePath $tempSQL -Encoding UTF8 -NoNewline
    
    # 执行迁移
    try {
        $output = $migrationSQL | & sqlite3 $v4Path
        Write-ColorOutput "`n✓ 迁移完成！" "Green"
        Write-ColorOutput "`n迁移结果:" "Cyan"
        Write-Output $output
    }
    catch {
        Write-ColorOutput "✗ 迁移失败: $_" "Red"
        Write-ColorOutput "  正在恢复备份..." "Yellow"
        Copy-Item $v4Backup $v4Path -Force
        Write-ColorOutput "✓ 已恢复备份" "Green"
        exit 1
    }
    finally {
        Remove-Item $tempSQL -Force -ErrorAction SilentlyContinue
    }
    
    Write-ColorOutput "`n迁移完成！请启动应用验证数据。" "Green"
    Write-ColorOutput "如果一切正常，可以删除备份文件:" "Gray"
    Write-ColorOutput "  - $v4Backup" "Gray"
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