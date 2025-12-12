# 成就系统设计方案

## 一、核心设计理念

### 1.1 设计目标
- ✅ **可扩展性**：轻松添加新成就类型和分类
- ✅ **无上限成长**：进阶成就可无限升级
- ✅ **情绪价值**：积分持续膨胀，给予正反馈
- ✅ **灵活规则**：支持多种触发条件和计算方式

### 1.2 成就分类
- **创作类**（writing）：笔记、文章
- **社交类**（moment）：动态、分享
- **资源类**（asset）：图片、文件上传
- **阅读类**（reading）：资讯浏览（未来）
- **生活类**（lifestyle）：运动、旅行（未来）
- **质量类**（quality）：字数、深度
- **习惯类**（habit）：连续性、频率

---

## 二、数据库设计

### 2.1 成就定义表 `achievements`

存储所有成就的元数据和规则配置。

```sql
CREATE TABLE achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,              -- 唯一标识，如 "writer_novice_lv1"
  category TEXT NOT NULL,                -- 分类：writing/moment/asset/reading/lifestyle
  type TEXT NOT NULL,                    -- 类型：milestone/progressive/streak/rare
  
  name TEXT NOT NULL,                    -- 显示名称
  description TEXT,                      -- 描述
  icon TEXT,                             -- 图标名称（lucide图标）
  
  rule_type TEXT NOT NULL,               -- 规则类型：count/streak/rate/quality/composite
  rule_config TEXT NOT NULL,             -- JSON：规则配置详情
  
  reward_points INTEGER DEFAULT 0,       -- 奖励积分
  reward_exp INTEGER DEFAULT 0,          -- 奖励经验值
  
  level INTEGER DEFAULT 1,               -- 等级（用于进阶成就）
  max_level INTEGER,                     -- 最大等级（NULL表示无上限）
  parent_key TEXT,                       -- 父成就key（系列成就）
  series_name TEXT,                      -- 系列名称
  
  rarity TEXT DEFAULT 'common',          -- 稀有度：common/rare/epic/legendary
  display_order INTEGER DEFAULT 0,       -- 显示顺序
  
  is_active INTEGER DEFAULT 1,           -- 是否启用
  is_hidden INTEGER DEFAULT 0,           -- 是否隐藏（神秘成就）
  
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_achievements_category ON achievements(category);
CREATE INDEX idx_achievements_type ON achievements(type);
CREATE INDEX idx_achievements_parent ON achievements(parent_key);
```

### 2.2 用户成就表 `user_achievements`

记录用户获得的成就和进度。**采用"取最大值"合并策略**。

```sql
CREATE TABLE user_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  achievement_key TEXT NOT NULL,         -- 成就key
  device_id TEXT NOT NULL,               -- 解锁设备标识
  
  progress TEXT,                         -- JSON：当前进度
  current_value INTEGER DEFAULT 0,       -- 当前数值
  target_value INTEGER,                  -- 目标数值
  
  status TEXT DEFAULT 'locked',          -- 状态：locked/in_progress/unlocked
  level INTEGER DEFAULT 1,               -- 当前等级（进阶成就）
  
  unlocked_at INTEGER,                   -- 解锁时间
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,                    -- 软删除时间（同步用）
  version INTEGER DEFAULT 0,             -- 版本号（同步用）
  
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, achievement_key)
);

CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_status ON user_achievements(status);
CREATE INDEX idx_user_achievements_version ON user_achievements(version);
```

**同步合并规则**：
- 相同 `achievement_key`：取 `level` 更高的记录
- `current_value`：取两端较大值
- `unlocked_at`：取较早的解锁时间（首次解锁时间）
- `status`：优先级 `unlocked` > `in_progress` > `locked`

### 2.3 用户统计表 `user_stats`

记录用户的各项统计数据。**采用"累加合并"策略，由 points_log 计算得出**。

```sql
CREATE TABLE user_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  
  stat_key TEXT NOT NULL,                -- 统计键：notes_count/total_words/login_streak等
  stat_value REAL DEFAULT 0,             -- 数值（支持小数）
  stat_type TEXT NOT NULL,               -- 类型：counter/max/last/date
  
  stat_date TEXT,                        -- 日期（YYYY-MM-DD，用于按日统计）
  stat_metadata TEXT,                    -- JSON：额外元数据
  
  last_operation_id TEXT,                -- 最后更新的操作ID（去重用）
  device_id TEXT,                        -- 最后更新设备
  
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,                    -- 软删除时间（同步用）
  version INTEGER DEFAULT 0,             -- 版本号（同步用）
  
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, stat_key, stat_date)
);

CREATE INDEX idx_user_stats_user ON user_stats(user_id);
CREATE INDEX idx_user_stats_key ON user_stats(stat_key);
CREATE INDEX idx_user_stats_date ON user_stats(stat_date);
CREATE INDEX idx_user_stats_version ON user_stats(version);
CREATE INDEX idx_user_stats_operation ON user_stats(last_operation_id);
```

**统计类型说明**：
- `counter`：累加型（如总笔记数）→ 同步时两端相加
- `max`：最大值型（如最长连续登录）→ 取两端较大值
- `last`：最新值型（如最后登录时间）→ 取时间戳较新的
- `date`：日期型（如首次使用日期）→ 取较早日期

**同步合并规则**：
- 根据 `stat_type` 选择合并策略
- 使用 `last_operation_id` 避免重复计算同一操作
- 优先从 `user_points_log` 重新计算，而非直接同步数值

### 2.4 积分记录表 `user_points_log`

记录所有积分变化，**这是同步的核心表**，采用增量累加模式。

```sql
CREATE TABLE user_points_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE,     -- 全局唯一操作ID（同步去重）
  user_id INTEGER NOT NULL,
  device_id TEXT NOT NULL,               -- 设备标识（desktop/mobile/web）
  
  points INTEGER NOT NULL,               -- 积分变化量（可正可负）
  exp INTEGER DEFAULT 0,                 -- 经验值变化量
  
  source TEXT NOT NULL,                  -- 来源：achievement/daily/bonus/penalty/action
  source_id TEXT,                        -- 来源ID（成就key/笔记ID等）
  description TEXT,                      -- 描述
  metadata TEXT,                         -- JSON：额外信息
  
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,           -- 更新时间（同步用）
  deleted_at INTEGER,                    -- 软删除时间（同步用）
  version INTEGER DEFAULT 0,             -- 版本号（同步用）
  synced INTEGER DEFAULT 0,              -- 是否已同步（0=未同步，1=已同步）
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_points_log_user ON user_points_log(user_id);
CREATE INDEX idx_points_log_operation ON user_points_log(operation_id);
CREATE INDEX idx_points_log_device ON user_points_log(device_id);
CREATE INDEX idx_points_log_synced ON user_points_log(synced);
CREATE INDEX idx_points_log_version ON user_points_log(version);
```

**关键字段说明**：
- `operation_id`：格式为 `{device_id}_{timestamp}_{counter}`，确保全局唯一
- `device_id`：区分操作来源，避免循环同步
- `synced`：标记是否已同步到其他设备
- `metadata`：存储操作上下文（如关联的笔记ID、字数等）

### 2.5 用户成就档案表 `user_achievement_profile`

存储用户在成就系统中的整体数据。**这是计算字段，不直接同步，通过 points_log 重算得出**。

```sql
CREATE TABLE user_achievement_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  
  -- 以下字段均为计算字段，不参与同步
  total_points INTEGER DEFAULT 0,        -- 总积分（从 points_log 累加）
  achievement_points INTEGER DEFAULT 0,  -- 成就积分（source='achievement' 的累加）
  daily_points INTEGER DEFAULT 0,        -- 每日积分（source='daily' 的累加）
  
  current_exp INTEGER DEFAULT 0,         -- 当前经验值（从 points_log 累加）
  level INTEGER DEFAULT 1,               -- 用户等级（由 current_exp 计算）
  
  current_title TEXT,                    -- 当前装备的称号（用户选择）
  unlocked_titles TEXT,                  -- JSON：已解锁的称号列表（从 achievements 计算）
  
  total_achievements INTEGER DEFAULT 0,  -- 已解锁成就总数（从 achievements 计数）
  achievement_categories TEXT,           -- JSON：各分类解锁数量（从 achievements 统计）
  
  last_level_up INTEGER,                 -- 上次升级时间
  last_sync_at INTEGER,                  -- 最后同步时间
  last_calculated_at INTEGER,            -- 最后计算时间
  
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,                    -- 软删除时间（预留）
  version INTEGER DEFAULT 0,             -- 版本号（预留）
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_profile_user ON user_achievement_profile(user_id);
CREATE INDEX idx_profile_level ON user_achievement_profile(level);
CREATE INDEX idx_profile_points ON user_achievement_profile(total_points);
```

**重要说明**：
- ⚠️ 该表 **不参与同步**，所有数值字段均为计算结果
- ✅ 同步完成后，调用 `recalculateProfile()` 重新计算
- ✅ `current_title` 是用户选择，可以同步（但优先级低）
- ✅ 其他字段从 `user_points_log` 和 `user_achievements` 实时计算

**设计理由**：
- ✅ 职责分离：不污染核心 `users` 表
- ✅ 易于扩展：可随意添加成就系统字段
- ✅ 性能优化：独立索引，不影响用户查询
- ✅ 可选模块：未启用成就系统时该表为空

### 2.6 同步策略设计 ⚠️ 重要

成就系统的同步与文章同步有**本质区别**：

**文章同步**：状态覆盖（版本号高的覆盖低的）
**成就同步**：增量累加（双端操作都有效，需要合并）

#### 核心原则

| 数据类型 | 同步方式 | 说明 |
|---------|---------|------|
| 积分/经验 | **增量累加** | 移动端+50，桌面端+30 → 总计+80 |
| 成就解锁 | **事件合并** | 双端解锁的成就取并集 |
| 统计数据 | **操作去重累加** | 同一操作只计一次 |
| 用户档案 | **计算字段** | 根据日志实时计算，不直接同步 |

#### 同步架构调整

##### 方案 1：基于操作日志的同步（推荐）

每个操作都有全局唯一ID，确保幂等性：

```
操作ID格式：{device_id}_{timestamp}_{counter}
例如：desktop_1702345678901_001
```

**关键表设计调整**：

#### 同步流程详解

##### 1️⃣ **积分/经验同步**（核心：增量累加）

```typescript
// 移动端操作
async function addPoints(userId: number, points: number, source: string) {
  const operationId = `${deviceId}_${Date.now()}_${counter++}`
  
  await sql.execute(`
    INSERT INTO user_points_log 
    (operation_id, user_id, device_id, points, exp, source, ...)
    VALUES (?, ?, ?, ?, ?, ?, ...)
  `, [operationId, userId, deviceId, points, exp, source, ...])
  
  // 标记为待同步
  markForSync('user_points_log', operationId)
}

// 同步时（移动端 → 桌面端）
async function syncPointsLog() {
  // 1. 获取未同步的操作
  const unsyncedOps = await getUnsyncedOperations(deviceId)
  
  // 2. 推送到桌面端
  await pushToDesktop(unsyncedOps)
  
  // 3. 桌面端接收
  for (const op of receivedOps) {
    // 检查 operation_id 是否已存在（幂等性）
    const exists = await checkOperationExists(op.operation_id)
    if (!exists) {
      // 插入操作日志
      await insertPointsLog(op)
      // 重新计算档案
      await recalculateProfile(userId)
    }
  }
  
  // 4. 标记已同步
  markAsSynced(unsyncedOps)
}

// 重新计算档案
async function recalculateProfile(userId: number) {
  // 从 points_log 累加所有积分
  const totalPoints = await sql.execute(`
    SELECT SUM(points) as total FROM user_points_log 
    WHERE user_id = ? AND deleted_at IS NULL
  `, [userId])
  
  // 更新档案表
  await sql.execute(`
    UPDATE user_achievement_profile 
    SET total_points = ?, current_exp = ?, level = ?
    WHERE user_id = ?
  `, [totalPoints, totalExp, calculateLevel(totalExp), userId])
}
```

**关键点**：
- ✅ 每个操作有唯一 `operation_id`，避免重复计算
- ✅ 同步传输的是**操作日志**，而非最终状态
- ✅ 接收端通过 `operation_id` 去重
- ✅ 同步后重新计算档案表

##### 2️⃣ **成就解锁同步**（核心：取最大进度）

```typescript
// 同步策略
async function mergeAchievements(local: Achievement, remote: Achievement) {
  // 1. 比较等级，取更高的
  if (remote.level > local.level) {
    return remote
  }
  
  // 2. 等级相同，比较进度
  if (remote.level === local.level && remote.current_value > local.current_value) {
    return { ...local, current_value: remote.current_value }
  }
  
  // 3. 解锁时间取最早
  if (remote.unlocked_at && (!local.unlocked_at || remote.unlocked_at < local.unlocked_at)) {
    return { ...local, unlocked_at: remote.unlocked_at }
  }
  
  return local
}
```

**同步示例**：

| 场景 | 移动端 | 桌面端 | 合并结果 |
|------|--------|--------|----------|
| 场景1 | 10篇笔记，Lv1 | 5篇笔记，Lv1 | 10篇笔记，Lv1 |
| 场景2 | 25篇笔记，Lv2 | 30篇笔记，Lv2 | 30篇笔记，Lv2 |
| 场景3 | 已解锁 | 未解锁 | 已解锁（并集） |

##### 3️⃣ **统计数据同步**（核心：根据类型选择策略）

```typescript
async function mergeStat(local: Stat, remote: Stat) {
  switch (remote.stat_type) {
    case 'counter':
      // 累加型：需要从 points_log 重新计算，避免重复
      return await recalculateCounterStat(remote.stat_key)
    
    case 'max':
      // 最大值型：取两端较大值
      return { ...local, stat_value: Math.max(local.stat_value, remote.stat_value) }
    
    case 'last':
      // 最新值型：取时间戳较新的
      return remote.updated_at > local.updated_at ? remote : local
    
    case 'date':
      // 日期型：取较早日期
      return remote.stat_value < local.stat_value ? remote : local
  }
}
```

##### 4️⃣ **完整同步流程**

```
┌─────────────┐                    ┌─────────────┐
│  移动端      │                    │  桌面端      │
└─────────────┘                    └─────────────┘
       │                                  │
       │ 1. 创建笔记，获得50积分              │
       │    operation_id: mobile_xxx_001   │
       │                                  │
       │ 2. 触发同步，推送 points_log       │
       ├──────────────────────────────────>│
       │                                  │ 3. 检查 operation_id 不存在
       │                                  │ 4. 插入 points_log
       │                                  │ 5. 重新计算档案（累加50）
       │                                  │
       │                                  │ 6. 桌面端也创建笔记，获得30积分
       │                                  │    operation_id: desktop_yyy_001
       │                                  │
       │ 8. 拉取 points_log               │ 7. 标记待同步
       │<──────────────────────────────────│
  9. 检查 operation_id 不存在             │
 10. 插入 points_log                     │
 11. 重新计算档案（累加30）               │
       │                                  │
       │ 最终：两端都是 80 积分（50+30）     │
```

**关键优势**：
- ✅ 双端操作互不覆盖，全部有效
- ✅ 通过 `operation_id` 确保幂等性
- ✅ 档案表不直接同步，而是计算得出
- ✅ 支持离线操作，后续批量同步

#### 实际同步配置

##### 需添加到 `sync-tables.ts`：

```typescript
export const SYNC_TABLES: Record<string, SyncableTable> = {
  // ... 现有配置 ...
  
  // ⚠️ 积分日志：核心同步表，使用 operation_id 去重
  user_points_log: {
    name: 'user_points_log',
    primaryKey: 'id',
    uniqueKey: 'operation_id',  // 新增：用于去重
    fields: ['id', 'operation_id', 'user_id', 'device_id', 'points', 'exp', 
             'source', 'source_id', 'description', 'metadata',
             'created_at', 'updated_at', 'deleted_at', 'version', 'synced'],
    jsonFields: ['metadata'],
    hasVersion: true,
    hasSoftDelete: true,
    hasUpdatedAt: true,
    syncMode: 'incremental',  // 新增：增量同步模式
  },
  
  // 成就解锁：合并模式（取最大进度）
  user_achievements: {
    name: 'user_achievements',
    primaryKey: 'id',
    uniqueKey: 'achievement_key',  // 新增：按成就key合并
    fields: ['id', 'user_id', 'achievement_key', 'device_id', 'progress', 
             'current_value', 'target_value', 'status', 'level', 'unlocked_at', 
             'created_at', 'updated_at', 'deleted_at', 'version'],
    jsonFields: ['progress'],
    hasVersion: true,
    hasSoftDelete: true,
    hasUpdatedAt: true,
    syncMode: 'merge',  // 新增：合并模式
    mergeStrategy: 'max_level',  // 新增：取最大等级
  },
  
  // 统计数据：根据类型选择策略
  user_stats: {
    name: 'user_stats',
    primaryKey: 'id',
    fields: ['id', 'user_id', 'stat_key', 'stat_value', 'stat_type', 
             'stat_date', 'stat_metadata', 'last_operation_id', 'device_id',
             'created_at', 'updated_at', 'deleted_at', 'version'],
    jsonFields: ['stat_metadata'],
    hasVersion: true,
    hasSoftDelete: true,
    hasUpdatedAt: true,
    syncMode: 'calculated',  // 新增：计算模式（从 points_log 重算）
  },
  
  // ⚠️ 档案表：不同步，同步后重新计算
  // user_achievement_profile 不添加到 SYNC_TABLES
}
```

##### 需添加到 `sync_engine.rs`：

```rust
// 扩展 TableConfig 支持不同同步模式
pub struct TableConfig {
    pub name: &'static str,
    pub primary_key: &'static str,
    pub unique_key: Option<&'static str>,  // 新增：用于去重的字段
    pub fields: &'static [&'static str],
    pub json_fields: &'static [&'static str],
    pub sync_mode: SyncMode,  // 新增：同步模式
}

pub enum SyncMode {
    Normal,        // 普通模式（状态覆盖）
    Incremental,   // 增量模式（追加，去重）
    Merge,         // 合并模式（智能合并）
    Calculated,    // 计算模式（不直接同步）
}

pub const SYNC_TABLES: &[TableConfig] = &[
    // ... 现有配置 ...
    
    TableConfig {
        name: "user_points_log",
        primary_key: "id",
        unique_key: Some("operation_id"),
        fields: &["id", "operation_id", "user_id", "device_id", "points", "exp", 
                  "source", "source_id", "description", "metadata",
                  "created_at", "updated_at", "deleted_at", "version", "synced"],
        json_fields: &["metadata"],
        sync_mode: SyncMode::Incremental,
    },
    TableConfig {
        name: "user_achievements",
        primary_key: "id",
        unique_key: Some("achievement_key"),
        fields: &["id", "user_id", "achievement_key", "device_id", "progress", 
                  "current_value", "target_value", "status", "level", "unlocked_at", 
                  "created_at", "updated_at", "deleted_at", "version"],
        json_fields: &["progress"],
        sync_mode: SyncMode::Merge,
    },
    TableConfig {
        name: "user_stats",
        primary_key: "id",
        unique_key: None,
        fields: &["id", "user_id", "stat_key", "stat_value", "stat_type", 
                  "stat_date", "stat_metadata", "last_operation_id", "device_id",
                  "created_at", "updated_at", "deleted_at", "version"],
        json_fields: &["stat_metadata"],
        sync_mode: SyncMode::Calculated,
    },
];
```

#### 同步后处理

每次同步完成后，需要重新计算档案表：

```typescript
async function onSyncCompleted(userId: number) {
  // 1. 重新计算总积分和经验值
  const stats = await sql.execute(`
    SELECT 
      SUM(CASE WHEN deleted_at IS NULL THEN points ELSE 0 END) as total_points,
      SUM(CASE WHEN deleted_at IS NULL THEN exp ELSE 0 END) as total_exp,
      SUM(CASE WHEN source = 'achievement' AND deleted_at IS NULL THEN points ELSE 0 END) as achievement_points
    FROM user_points_log
    WHERE user_id = ?
  `, [userId])
  
  // 2. 计算等级
  const level = calculateLevel(stats.total_exp)
  
  // 3. 统计解锁成就数
  const achievements = await sql.execute(`
    SELECT 
      COUNT(*) as total,
      category,
      COUNT(*) as count
    FROM user_achievements
    WHERE user_id = ? AND status = 'unlocked' AND deleted_at IS NULL
    GROUP BY category
  `, [userId])
  
  // 4. 更新档案表
  await sql.execute(`
    UPDATE user_achievement_profile
    SET 
      total_points = ?,
      achievement_points = ?,
      current_exp = ?,
      level = ?,
      total_achievements = ?,
      achievement_categories = ?,
      last_calculated_at = ?,
      updated_at = ?
    WHERE user_id = ?
  `, [
    stats.total_points,
    stats.achievement_points,
    stats.total_exp,
    level,
    achievements.total,
    JSON.stringify(achievements.categories),
    Date.now(),
    Date.now(),
    userId
  ])
  
  // 5. 检查是否有新成就解锁（根据新的统计数据）
  await checkAndUnlockAchievements(userId)
}
```

#### 不同步的表：

**`achievements` 表不参与同步**，理由：
- ✅ 成就定义是系统预设，双端代码内置
- ✅ 避免用户篡改成就规则
- ✅ 通过应用更新统一升级成就库
- ✅ 减少同步数据量

如需双端成就定义一致，建议：
1. 在应用启动时从预设配置初始化 `achievements` 表
2. 使用 `key` 字段作为唯一标识匹配成就
3. 应用更新时自动迁移新增成就

### 2.7 同步设计总结

#### 核心理念对比

| 方面 | 文章同步 | 成就同步 |
|-----|---------|---------|
| **数据性质** | 状态数据 | 事件数据 |
| **冲突解决** | 版本号覆盖 | 增量累加 |
| **重复操作** | 覆盖旧数据 | 去重保留 |
| **合并策略** | 取最新版本 | 累加/取最大 |
| **同步单位** | 完整记录 | 操作日志 |

#### 三种同步模式

| 模式 | 表 | 策略 | 说明 |
|-----|---|------|------|
| **Incremental** | user_points_log | 追加+去重 | 通过 operation_id 确保幂等 |
| **Merge** | user_achievements | 智能合并 | 取最大等级/进度 |
| **Calculated** | user_stats, user_achievement_profile | 不直接同步 | 同步后重新计算 |

#### 关键设计要点

✅ **幂等性保证**
- 每个操作有全局唯一 `operation_id`
- 格式：`{device_id}_{timestamp}_{counter}`
- 接收端检查 `operation_id` 是否已存在

✅ **避免重复计数**
- 统计数据记录 `last_operation_id`
- 同步时检查操作是否已处理
- 优先从操作日志重新计算

✅ **双端操作有效**
- 移动端+50分，桌面端+30分 → 最终80分
- 双端解锁的成就取并集
- 进度取最大值

✅ **计算字段不同步**
- `user_achievement_profile` 所有数值字段均为计算结果
- 同步完成后调用 `onSyncCompleted()` 重算
- 避免状态不一致

#### 实现检查清单

实现成就同步功能时，需确保：

- [ ] 每个操作生成唯一 `operation_id`
- [ ] `user_points_log` 插入时包含 `device_id`
- [ ] 同步前标记 `synced=0`，成功后更新为 `synced=1`
- [ ] 接收端检查 `operation_id` 是否存在（防重复）
- [ ] 成就合并时比较 `level` 和 `current_value`
- [ ] 统计数据根据 `stat_type` 选择合并策略
- [ ] 同步完成后调用 `recalculateProfile()`
- [ ] 支持离线累积，联网后批量同步
- [ ] 异常时支持回滚（事务保护）

---

## 三、成就类型详细设计

### 3.1 里程碑成就（Milestone）

**特点**：一次性达成，有明确目标。

**示例**：
- "初出茅庐"：发布第1篇笔记
- "百家讲坛"：发布第100篇笔记
- "字海泛舟"：累计撰写10万字

**配置示例**：
```json
{
  "key": "milestone_100_notes",
  "type": "milestone",
  "rule_type": "count",
  "rule_config": {
    "metric": "notes_total",
    "operator": ">=",
    "target": 100,
    "check_interval": "on_action"
  },
  "reward_points": 500,
  "reward_exp": 1000
}
```

### 3.2 进阶成就（Progressive）

**特点**：可无限升级，目标递增，给予持续正反馈。

**示例系列**：
- "笔耕不辍 Lv.1"：10篇笔记
- "笔耕不辍 Lv.2"：25篇笔记
- "笔耕不辍 Lv.3"：50篇笔记
- "笔耕不辍 Lv.N"：动态计算

**配置示例**：
```json
{
  "key": "progressive_note_writer",
  "type": "progressive",
  "series_name": "笔耕不辍",
  "rule_type": "count",
  "rule_config": {
    "metric": "notes_total",
    "formula": "exponential",
    "base_target": 10,
    "growth_rate": 1.5,
    "calculation": "base * (rate ^ (level - 1))",
    "max_level": null
  },
  "reward_formula": {
    "points": "50 * level * level",
    "exp": "100 * level * level"
  }
}
```

**等级计算公式**：
- **线性增长**：target = base + (increment * level)
  - Lv1: 10, Lv2: 20, Lv3: 30...
- **指数增长**（推荐）：target = base * (rate ^ level)
  - Lv1: 10, Lv2: 15, Lv3: 22, Lv4: 33...
- **斐波那契**：target = fib(level) * base
  - Lv1: 10, Lv2: 10, Lv3: 20, Lv4: 30, Lv5: 50...

### 3.3 连续成就（Streak）

**特点**：考察连续性，培养习惯。

**示例**：
- "七日之约"：连续7天发布内容
- "月度精英"：连续30天活跃
- "年度传说"：连续365天打卡

**配置示例**：
```json
{
  "key": "streak_7_days",
  "type": "streak",
  "rule_type": "consecutive",
  "rule_config": {
    "action": "create_content",
    "consecutive_days": 7,
    "grace_period": 0,
    "reset_on_miss": true,
    "allowed_actions": ["create_note", "create_moment"]
  },
  "reward_points": 200,
  "reward_exp": 500
}
```

### 3.4 稀有成就（Rare）

**特点**：特殊条件触发，给予惊喜。

**示例**：
- "夜猫子"：凌晨3点发布内容
- "劳模"：单日发布10篇内容
- "厚积薄发"：单篇文章超过5000字
- "七夕快乐"：在特定日期（8月25日）发布

**配置示例**：
```json
{
  "key": "rare_night_owl",
  "type": "rare",
  "rule_type": "composite",
  "is_hidden": 1,
  "rule_config": {
    "conditions": [
      {
        "type": "time_range",
        "start_hour": 0,
        "end_hour": 5
      },
      {
        "type": "action",
        "action": "create_note"
      }
    ],
    "operator": "AND"
  },
  "rarity": "epic",
  "reward_points": 300
}
```

### 3.5 质量成就（Quality）

**特点**：衡量内容质量。

**示例**：
- "惜墨如金"：单篇500字以上
- "长篇巨制"：单篇3000字以上
- "图文并茂"：单篇包含5张图片
- "多产作家"：月产10篇

**配置示例**：
```json
{
  "key": "quality_long_article",
  "type": "milestone",
  "rule_type": "quality",
  "rule_config": {
    "metric": "note_word_count",
    "operator": ">=",
    "target": 3000,
    "scope": "single_item"
  }
}
```

---

## 四、积分与等级系统

### 4.1 双货币系统

#### 1️⃣ **积分（Points）**
- **用途**：成就奖励、日常活跃、里程碑
- **特点**：快速增长，给予即时满足感
- **获取方式**：
  - 完成成就：50-1000分
  - 每日登录：10分
  - 发布内容：20-50分
  - 连续打卡：额外奖励

#### 2️⃣ **经验值（EXP）**
- **用途**：提升等级
- **特点**：稳定增长，体现长期积累
- **等级计算**：

```typescript
// 等级公式（指数增长）
function calculateLevel(exp: number): number {
  // 公式：level = floor(sqrt(exp / 100))
  // Lv1: 0, Lv2: 100, Lv3: 400, Lv4: 900, Lv5: 1600...
  return Math.floor(Math.sqrt(exp / 100)) + 1
}

function getExpForLevel(level: number): number {
  // 到达该等级所需经验
  return (level - 1) * (level - 1) * 100
}

function getExpForNextLevel(currentExp: number): number {
  const currentLevel = calculateLevel(currentExp)
  const nextLevelExp = getExpForLevel(currentLevel + 1)
  return nextLevelExp - currentExp
}
```

**等级对照表**：
| 等级 | 所需总EXP | 本级所需 | 称号示例 |
|------|-----------|----------|----------|
| 1    | 0         | -        | 初学者 |
| 2    | 100       | 100      | 学徒 |
| 3    | 400       | 300      | 见习生 |
| 4    | 900       | 500      | 熟练者 |
| 5    | 1,600     | 700      | 专家 |
| 10   | 8,100     | 1,700    | 大师 |
| 20   | 36,100    | 3,700    | 宗师 |
| 50   | 240,100   | 9,700    | 传说 |

### 4.2 称号系统

根据成就解锁称号，可自由选择佩戴。

**称号类别**：
- **等级称号**：根据等级自动获得
  - Lv1-5: "初学者"
  - Lv6-10: "进阶者"
  - Lv11-20: "专家"
  - Lv21-50: "大师"
  - Lv51+: "传说"

- **成就称号**：完成特定成就解锁
  - "笔耕不辍"：完成写作系列成就
  - "社交达人"：完成动态系列成就
  - "资源大亨"：完成上传系列成就
  - "夜间精灵"：完成夜猫子成就

- **稀有称号**：特殊条件获得
  - "开拓者"：首批用户
  - "元老"：注册满1年
  - "全能王"：解锁所有分类成就

---

## 五、统计指标定义

### 5.1 全局统计（user_stats）

| stat_key | 说明 | 更新时机 |
|----------|------|----------|
| `notes_total` | 笔记总数 | 创建笔记时 +1 |
| `notes_deleted` | 删除笔记数 | 删除笔记时 +1 |
| `notes_active` | 有效笔记数 | notes_total - notes_deleted |
| `total_words` | 累计字数 | 创建/更新笔记时累加 |
| `moments_total` | 动态总数 | 创建动态时 +1 |
| `assets_total` | 资源总数 | 上传资源时 +1 |
| `assets_size` | 资源总大小（bytes） | 上传时累加 |
| `login_streak` | 连续登录天数 | 每日首次登录检查 |
| `max_login_streak` | 最长连续登录 | 超过历史记录时更新 |
| `daily_active` | 活跃天数 | 有任何操作的天数 |
| `last_active_date` | 最后活跃日期 | 每次操作更新 |

### 5.2 日度统计（stat_date 非空）

| stat_key | 说明 |
|----------|------|
| `daily_notes` | 当日创建笔记数 |
| `daily_moments` | 当日创建动态数 |
| `daily_words` | 当日撰写字数 |
| `daily_assets` | 当日上传资源数 |

### 5.3 质量统计

| stat_key | 说明 |
|----------|------|
| `max_note_words` | 单篇最高字数 |
| `avg_note_words` | 平均字数 |
| `most_productive_hour` | 最高产时段 |

---

## 六、成就检查触发机制

### 6.1 触发时机

```typescript
// 1. 同步触发（实时检查）
triggerAchievements('create_note', { noteId, wordCount, ... })
triggerAchievements('create_moment', { momentId, ... })
triggerAchievements('upload_asset', { assetId, size, ... })

// 2. 定时检查（每日凌晨）
checkDailyAchievements()  // 检查连续登录、日活跃等

// 3. 手动刷新（用户触发）
refreshAllAchievements()  // 扫描所有可能达成的成就
```

### 6.2 检查流程

```typescript
async function checkAchievements(userId: number, action: string, data: any) {
  // 1. 更新相关统计数据
  await updateUserStats(userId, action, data)
  
  // 2. 获取相关成就定义
  const achievements = await getAchievementsByAction(action)
  
  // 3. 逐个检查是否达成
  for (const achievement of achievements) {
    const result = await evaluateAchievement(userId, achievement)
    
    if (result.achieved && !result.alreadyUnlocked) {
      // 4. 解锁成就
      await unlockAchievement(userId, achievement.key, result.level)
      
      // 5. 发放奖励
      await awardRewards(userId, achievement, result.level)
      
      // 6. 通知用户
      await notifyAchievementUnlocked(userId, achievement)
    }
  }
}
```

---

## 七、前端展示设计

### 7.1 成就页面结构

```
成就中心
├── 顶部：用户信息卡片
│   ├── 等级、经验进度条
│   ├── 总积分、成就积分
│   └── 当前称号
│
├── 分类Tab
│   ├── 全部
│   ├── 创作类 📝
│   ├── 社交类 💬
│   ├── 资源类 📦
│   ├── 习惯类 ⏰
│   └── 稀有类 ⭐
│
└── 成就列表
    ├── 已解锁（彩色，显示解锁时间）
    ├── 进行中（灰色，显示进度条）
    └── 未解锁（暗淡，显示条件）
```

### 7.2 成就卡片设计

```vue
<AchievementCard>
  <Icon :name="achievement.icon" :class="{ 
    'text-primary': unlocked,
    'text-muted': !unlocked 
  }" />
  <div>
    <h3>{{ achievement.name }}</h3>
    <p>{{ achievement.description }}</p>
    
    <!-- 进度条（进行中） -->
    <Progress v-if="inProgress" :value="progress" />
    
    <!-- 奖励信息 -->
    <div class="rewards">
      <Badge>+{{ achievement.reward_points }} 积分</Badge>
      <Badge>+{{ achievement.reward_exp }} EXP</Badge>
    </div>
    
    <!-- 解锁时间 -->
    <small v-if="unlocked">{{ formatDate(unlockedAt) }} 解锁</small>
  </div>
</AchievementCard>
```

### 7.3 解锁动画

成就解锁时显示全屏弹窗：
- 成就图标放大动画
- 粒子特效
- 音效（可选）
- 奖励飘字

---

## 八、实现优先级

### Phase 1：核心功能（MVP）
- ✅ 数据库表创建
- ✅ 基础统计收集（notes_total, moments_total等）
- ✅ 里程碑成就实现
- ✅ 积分系统
- ✅ 成就页面基础UI

### Phase 2：进阶功能
- ✅ 进阶成就（可升级）
- ✅ 连续打卡成就
- ✅ 等级系统
- ✅ 称号系统
- ✅ 成就解锁动画

### Phase 3：高级功能
- ✅ 稀有成就（隐藏成就）
- ✅ 质量成就
- ✅ 每日任务（可选）
- ✅ 成就分享
- ✅ 排行榜（可选）

---

## 九、配置文件示例

### 9.1 预设成就配置（achievements.config.ts）

```typescript
export const PRESET_ACHIEVEMENTS = [
  // ========== 创作类 ==========
  {
    key: 'writing_first_note',
    category: 'writing',
    type: 'milestone',
    name: '初出茅庐',
    description: '发布第一篇笔记',
    icon: 'lucide:pen-line',
    rule_type: 'count',
    rule_config: {
      metric: 'notes_total',
      target: 1,
    },
    reward_points: 50,
    reward_exp: 100,
    rarity: 'common',
  },
  {
    key: 'writing_10_notes',
    category: 'writing',
    type: 'milestone',
    name: '笔耕不辍',
    description: '发布10篇笔记',
    icon: 'lucide:file-text',
    rule_type: 'count',
    rule_config: {
      metric: 'notes_total',
      target: 10,
    },
    reward_points: 200,
    reward_exp: 500,
  },
  {
    key: 'writing_progressive',
    category: 'writing',
    type: 'progressive',
    series_name: '文章达人',
    name: '文章达人',
    description: '持续创作，不断进阶',
    icon: 'lucide:trophy',
    rule_type: 'count',
    rule_config: {
      metric: 'notes_total',
      formula: 'exponential',
      base_target: 10,
      growth_rate: 1.5,
    },
    reward_formula: {
      points: '50 * level * level',
      exp: '100 * level * level',
    },
    max_level: null, // 无上限
  },
  
  // ========== 社交类 ==========
  {
    key: 'moment_first',
    category: 'moment',
    type: 'milestone',
    name: '动态新人',
    description: '发布第一条动态',
    icon: 'lucide:message-circle',
    rule_type: 'count',
    rule_config: {
      metric: 'moments_total',
      target: 1,
    },
    reward_points: 30,
    reward_exp: 50,
  },
  
  // ========== 习惯类 ==========
  {
    key: 'streak_7_days',
    category: 'habit',
    type: 'streak',
    name: '七日之约',
    description: '连续7天发布内容',
    icon: 'lucide:calendar-check',
    rule_type: 'consecutive',
    rule_config: {
      action: 'daily_active',
      consecutive_days: 7,
    },
    reward_points: 300,
    reward_exp: 700,
    rarity: 'rare',
  },
  
  // ========== 质量类 ==========
  {
    key: 'quality_1000_words',
    category: 'quality',
    type: 'milestone',
    name: '千字文豪',
    description: '单篇文章超过1000字',
    icon: 'lucide:scroll-text',
    rule_type: 'quality',
    rule_config: {
      metric: 'note_word_count',
      target: 1000,
      scope: 'single_item',
    },
    reward_points: 100,
    reward_exp: 200,
  },
  
  // ========== 稀有成就 ==========
  {
    key: 'rare_night_owl',
    category: 'lifestyle',
    type: 'rare',
    name: '夜猫子',
    description: '凌晨3点发布内容',
    icon: 'lucide:moon-star',
    rule_type: 'composite',
    rule_config: {
      conditions: [
        { type: 'time_range', start_hour: 0, end_hour: 5 },
        { type: 'action', action: 'create_note' },
      ],
    },
    reward_points: 200,
    reward_exp: 300,
    rarity: 'epic',
    is_hidden: 1,
  },
]
```

---

## 十、技术实现要点

### 10.1 性能优化
- 统计数据采用增量更新，避免全表扫描
- 成就检查采用规则索引，快速匹配
- 使用缓存减少数据库查询
- 批量解锁成就（避免多次通知）

### 10.2 数据一致性
- 统计数据与成就进度原子性更新
- 使用事务确保积分发放准确
- 定期校验统计数据准确性

### 10.3 可扩展性
- 规则配置使用 JSON，灵活添加新规则
- 成就定义与检查逻辑解耦
- 支持自定义成就公式

---

## 十一、情绪价值设计

### 11.1 数值膨胀机制
- **积分快速增长**：初期获得感强，后期更加丰厚
- **经验递增**：等级越高，单次奖励越多
- **里程碑奖励**：大额积分激励（如"万字作者"奖励5000分）

### 11.2 正反馈循环
1. 用户完成操作 → 触发成就检查
2. 解锁成就 → 炫酷动画 + 音效
3. 获得奖励 → 积分增加，等级提升
4. 解锁新称号 → 展示个性
5. 看到下一个目标 → 继续努力

### 11.3 社交展示
- 成就墙：展示所有解锁成就
- 稀有度标识：炫耀稀有成就
- 分享功能：分享成就到社交平台（未来）
- 排行榜：查看好友排名（可选）

---

## 十二、总结

这套成就系统设计具有以下特点：

✅ **灵活**：支持多种成就类型和规则
✅ **可扩展**：轻松添加新成就和分类
✅ **无上限**：进阶成就可无限升级
✅ **情绪价值**：积分膨胀，等级提升，称号解锁
✅ **易维护**：规则配置化，逻辑清晰

建议实施步骤：
1. 先创建数据库表和基础统计
2. 实现里程碑成就（最简单）
3. 完善前端展示
4. 逐步添加进阶、连续、稀有成就
5. 优化性能和用户体验

是否需要我开始实现代码部分？我可以先创建数据库迁移脚本和核心 composable 函数。
