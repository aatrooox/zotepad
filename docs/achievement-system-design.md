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

## 五、统计指标系统（可扩展）

### 5.1 统计指标架构

`user_stats` 表采用**键值对存储**，完全可扩展，支持动态添加新指标。

**指标分类体系**：

| 分类前缀 | 说明 | 示例 | stat_type |
|---------|------|------|-----------|
| `content.*` | 内容创作 | `content.notes_total` | counter |
| `social.*` | 社交互动 | `social.moments_total` | counter |
| `asset.*` | 资源管理 | `asset.total_size` | counter |
| `activity.*` | 活跃度 | `activity.login_streak` | max |
| `quality.*` | 质量指标 | `quality.max_words` | max |
| `health.*` | 健康数据 | `health.steps_today` | counter |
| `travel.*` | 旅行数据 | `travel.cities_visited` | counter |
| `custom.*` | 自定义 | `custom.any_metric` | counter |

### 5.2 预设统计指标

#### 内容创作类（content.*）

| stat_key | stat_type | 说明 | 更新时机 |
|----------|-----------|------|----------|
| `content.notes_total` | counter | 笔记总数 | 创建笔记 +1 |
| `content.notes_deleted` | counter | 删除笔记数 | 删除笔记 +1 |
| `content.notes_active` | counter | 有效笔记数 | 计算值 |
| `content.total_words` | counter | 累计字数 | 创建/更新笔记累加 |
| `content.moments_total` | counter | 动态总数 | 创建动态 +1 |

#### 资源管理类（asset.*）

| stat_key | stat_type | 说明 | 更新时机 |
|----------|-----------|------|----------|
| `asset.total_count` | counter | 资源总数 | 上传 +1 |
| `asset.total_size` | counter | 总大小（bytes） | 上传时累加 |
| `asset.images_count` | counter | 图片数量 | 上传图片 +1 |
| `asset.videos_count` | counter | 视频数量 | 上传视频 +1 |

#### 活跃度类（activity.*）

| stat_key | stat_type | 说明 | 更新时机 |
|----------|-----------|------|----------|
| `activity.login_streak` | counter | 连续登录天数 | 每日首次登录检查 |
| `activity.max_login_streak` | max | 最长连续登录 | 超过历史记录更新 |
| `activity.total_days` | counter | 活跃天数 | 有操作的天数 |
| `activity.last_active_date` | last | 最后活跃日期 | 每次操作更新 |

#### 质量指标类（quality.*）

| stat_key | stat_type | 说明 | 更新时机 |
|----------|-----------|------|----------|
| `quality.max_note_words` | max | 单篇最高字数 | 创建笔记时比较 |
| `quality.avg_note_words` | counter | 平均字数 | 定期计算 |
| `quality.most_productive_hour` | last | 最高产时段 | 统计分析 |

#### 健康数据类（health.* - 预留）

| stat_key | stat_type | 说明 | 更新时机 |
|----------|-----------|------|----------|
| `health.steps_total` | counter | 累计步数 | 同步健康数据 |
| `health.steps_today` | counter | 今日步数 | 每日更新 |
| `health.distance_km` | counter | 累计距离（km） | 同步健康数据 |
| `health.calories` | counter | 累计消耗（卡路里） | 同步健康数据 |
| `health.workouts_count` | counter | 锻炼次数 | 记录锻炼 +1 |

#### 旅行数据类（travel.* - 预留）

| stat_key | stat_type | 说明 | 更新时机 |
|----------|-----------|------|----------|
| `travel.cities_visited` | counter | 访问城市数 | 新增城市 +1 |
| `travel.countries_visited` | counter | 访问国家数 | 新增国家 +1 |
| `travel.total_distance_km` | counter | 总旅行距离 | 累加 |
| `travel.photos_taken` | counter | 旅行照片数 | 标记旅行照片 +1 |
| `travel.furthest_city` | last | 最远城市 | 更新最远记录 |

### 5.3 日度统计（stat_date 非空）

日度统计使用相同的 key，但设置 `stat_date` 字段：

| stat_key | 说明 |
|----------|------|
| `daily.notes` | 当日创建笔记数 |
| `daily.moments` | 当日创建动态数 |
| `daily.words` | 当日撰写字数 |
| `daily.assets` | 当日上传资源数 |
| `daily.steps` | 当日步数（健康数据） |
| `daily.distance` | 当日旅行距离 |

### 5.4 扩展新指标

添加新统计指标只需两步：

**1. 定义指标**（在配置文件中）：

```typescript
// app/config/stats-metrics.ts
export const STATS_METRICS = {
  // 现有指标...
  
  // 新增：健康数据
  'health.steps_total': {
    type: 'counter',
    category: 'health',
    name: '累计步数',
    description: '同步健康数据累计的总步数',
    unit: '步',
  },
  
  // 新增：旅行数据
  'travel.cities_visited': {
    type: 'counter',
    category: 'travel',
    name: '访问城市',
    description: '去过的城市数量',
    unit: '个',
  },
}
```

**2. 更新指标值**（在对应操作中）：

```typescript
// 健康数据同步时
await updateStat(userId, 'health.steps_total', steps, 'counter', operationId)

// 记录旅行城市
await updateStat(userId, 'travel.cities_visited', 1, 'counter', operationId)
```

### 5.5 指标查询与聚合

```typescript
// 查询单个指标
const totalSteps = await getStat(userId, 'health.steps_total')

// 查询某分类所有指标
const healthStats = await getStatsByCategory(userId, 'health')

// 查询日度数据
const todaySteps = await getDailyStat(userId, 'daily.steps', '2025-12-12')

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

## 八、MVP 实施计划 ⚠️ 递进式开发

### 8.0 核心原则

**不破坏现有功能**：
- ✅ 成就系统完全独立，不修改现有数据表
- ✅ 不修改现有同步引擎代码，仅扩展配置
- ✅ 使用独立的 composable，不侵入现有逻辑
- ✅ 每个阶段都可独立测试和回滚

**渐进式实施**：
- ✅ 每个 Phase 完成后验证现有功能正常
- ✅ 新功能采用功能开关控制
- ✅ 分批发布，逐步稳定

---

### Phase 1：完整表结构 + 本地基础功能（1-2天）

**策略调整**：Phase 1 就创建完整表结构（包含所有同步字段），避免后续数据迁移问题。但只实现本地 CRUD 功能，不实现同步逻辑。

**实施步骤**：

#### 1.1 数据库初始化（完整版）
- [ ] 创建 5 张表（**包含所有同步字段**：`operation_id`, `device_id`, `synced_at`）
- [ ] 初始化 5-8 个预设成就（里程碑 + 进阶）
- [ ] 创建数据库迁移脚本

**SQL 完整版本**（一次性到位）：
```sql
-- 1. 成就定义表（系统预设，不参与同步）
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL, -- milestone, progressive, streak, rare, quality
  category TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  exp INTEGER DEFAULT 0,
  icon TEXT,
  rule_config TEXT, -- JSON
  created_at INTEGER NOT NULL
);

-- 2. 用户成就关联表（完整版，包含同步字段）
CREATE TABLE IF NOT EXISTS user_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  achievement_key TEXT NOT NULL,
  level INTEGER DEFAULT 1,
  progress INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  total_exp INTEGER DEFAULT 0,
  unlocked_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT,           -- 同步字段（Phase 1 不使用）
  synced_at INTEGER,        -- 同步字段（Phase 1 不使用）
  UNIQUE(user_id, achievement_key)
);

-- 3. 用户统计表（完整版，包含同步字段）
CREATE TABLE IF NOT EXISTS user_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  stat_key TEXT NOT NULL,
  stat_value TEXT NOT NULL,
  stat_type TEXT DEFAULT 'counter', -- counter, max, last, date
  updated_at INTEGER NOT NULL,
  device_id TEXT,           -- 同步字段（Phase 1 不使用）
  synced_at INTEGER,        -- 同步字段（Phase 1 不使用）
  UNIQUE(user_id, stat_key)
);

-- 4. 积分日志表（完整版，核心同步表）
CREATE TABLE IF NOT EXISTS user_points_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  operation_id TEXT NOT NULL UNIQUE, -- 同步去重字段（Phase 1 留空即可）
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  achievement_key TEXT,
  points INTEGER NOT NULL,
  exp INTEGER NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  device_id TEXT,           -- 同步字段（Phase 1 不使用）
  synced_at INTEGER         -- 同步字段（Phase 1 不使用）
);

-- 5. 用户成就档案表（完整版，计算字段，不直接同步）
CREATE TABLE IF NOT EXISTS user_achievement_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  total_points INTEGER DEFAULT 0,
  total_exp INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  title TEXT,
  achievements_count INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- 索引
CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX idx_user_stats_user ON user_stats(user_id);
CREATE INDEX idx_points_log_user ON user_points_log(user_id);
CREATE INDEX idx_points_log_operation ON user_points_log(operation_id);
CREATE INDEX idx_points_log_synced ON user_points_log(synced_at);
```

#### 1.2 核心功能实现
- [ ] `useAchievementSystem.ts` - 成就检查和解锁
- [ ] `usePointsSystem.ts` - 积分管理（operation_id 先留空）
- [ ] `useStatsCollector.ts` - 统计收集

#### 1.3 最小化触发点
- [ ] 在 `useNoteRepository.ts` 的 `createNote` 中添加钩子
- [ ] 在 `useMomentRepository.ts` 的 `createMoment` 中添加钩子
- [ ] 触发统计更新和成就检查

#### 1.4 基础 UI
- [ ] 成就页面路由：`/achievements`
- [ ] 显示已解锁成就列表
- [ ] 显示总积分、等级和进度

**不实现的功能**（留到 Phase 3）：
- ❌ 不生成 operation_id（字段留空）
- ❌ 不实现同步逻辑
- ❌ 不在 SYNC_TABLES 注册
- ❌ device_id 和 synced_at 字段暂不使用

**验收标准**：
- ✅ 5 张表创建成功，字段完整
- ✅ 创建笔记/动态后统计数据正确更新
- ✅ 达成条件后成就正确解锁
- ✅ 积分和等级正确计算
- ✅ 前端页面可查看成就和进度
- ✅ **现有笔记/动态 CRUD 功能完全正常**
- ✅ **现有同步功能完全正常**

---

### Phase 2：完善本地功能

**目标**：扩展成就类型，优化 UI

#### 2.1 扩展成就
- [ ] 添加 10 个里程碑成就
- [ ] 实现进阶成就（可升级）
- [ ] 成就分类展示

#### 2.2 统计增强
- [ ] 收集更多统计指标（字数、动态、资源）
- [ ] 日度统计（stat_date）

#### 2.3 UI 优化
- [ ] 成就卡片设计
- [ ] 进度条显示
- [ ] 解锁动画

**验收标准**：
- ✅ 多种成就类型正常工作
- ✅ 统计数据准确
- ✅ UI 交互流畅
- ✅ **现有功能依然正常**

---

### Phase 3：实现同步逻辑（3-4天）

**目标**：实现增量同步，集成到现有同步系统

**优势**：表结构已在 Phase 1 就绪，无需 ALTER TABLE，只需添加代码逻辑。

#### 3.1 实现 operation_id 生成

**修改 `usePointsSystem.ts`**：
```typescript
let counter = 0

async function addPoints(userId, sourceType, sourceId, points, exp, reason) {
  const deviceId = await getDeviceId()
  const operationId = `${deviceId}_${Date.now()}_${counter++}`
  
  await sql.execute(
    'INSERT INTO user_points_log (..., operation_id, device_id) VALUES (...)',
    [userId, operationId, sourceType, sourceId, points, exp, reason, deviceId, Date.now()]
  )
}
```

#### 3.2 配置同步表（不修改引擎）

**扩展 `app/config/sync-tables.ts`**：
```typescript
export const SYNC_TABLES = [
  // ... 现有表配置（不改动）
  
  // 新增成就同步配置
  {
    name: 'user_points_log',
    syncMode: 'incremental', // 新增模式
    idempotencyKey: 'operation_id',
    conflictResolution: 'append'
  },
  {
    name: 'user_achievements',
    syncMode: 'merge',
    conflictResolution: (local, remote) => {
      return local.level >= remote.level ? local : remote
    }
  },
  {
    name: 'user_stats',
    syncMode: 'calculated', // 从 points_log 重算
    skipDirectSync: true
  }
]
```

#### 3.3 扩展同步引擎（选择实现方式）

**方案 A：前端实现**（推荐）
- [ ] 在 `useTauriServices` 中处理成就同步
- [ ] 利用现有 SQL 插件执行去重和合并
- [ ] 同步后调用 `recalculateStats()` 和 `recalculateProfile()`

**方案 B：Rust 实现**
- [ ] 修改 `src-tauri/src/sync_engine.rs`
- [ ] 添加新的同步模式支持

#### 3.4 实现同步后重算

```typescript
async function recalculateAfterSync(userId) {
  // 1. 从 points_log 重算 user_stats
  await recalculateStats(userId)
  
  // 2. 从 achievements 重算 profile
  await recalculateProfile(userId)
}
```

#### 3.5 添加同步钩子
- [ ] 在现有同步完成后，调用 `syncAchievements()`
- [ ] 使用 try-catch 包裹，失败不影响主同步

```typescript
// 在 useSyncManager.ts 中
async function syncOnce() {
  // 现有同步逻辑
  await syncNotes()
  await syncMoments()
  await syncAssets()
  await syncWorkflows()
  
  // 新增：成就同步（独立，失败不影响主流程）
  try {
    await syncAchievements()
  } catch (e) {
    console.error('成就同步失败（不影响主同步）:', e)
  }
}
```

**验收标准**：
- ✅ 桌面端创建笔记，移动端同步后积分正确增加
- ✅ 双端操作积分正确累加（50+30=80）
- ✅ `operation_id` 去重正常工作
- ✅ **现有笔记、动态等同步完全正常**
- ✅ **成就同步失败不影响主同步流程**

---

### Phase 4：高级功能

**目标**：完善体验，扩展功能

#### 4.1 连续成就
- [ ] 实现连续登录检测
- [ ] 实现连续创作检测

#### 4.2 稀有成就
- [ ] 隐藏成就
- [ ] 时间相关成就

#### 4.3 称号系统
- [ ] 称号解锁
- [ ] 称号切换

**验收标准**：
- ✅ 连续成就正常工作
- ✅ 稀有成就惊喜触发
- ✅ 称号系统稳定

---

### Phase 5：未来扩展

- [ ] 健康数据集成（`health.*` 指标）
- [ ] 旅行数据集成（`travel.*` 指标）
- [ ] 成就分享功能
- [ ] 排行榜（可选）

---

### 8.1 防护措施清单

#### 代码层面
- [ ] 所有成就相关代码使用独立 composable
- [ ] 不修改 `useNoteRepository` 等核心文件的主逻辑
- [ ] 使用事件钩子机制触发成就检查
- [ ] 使用功能开关控制成就系统启用

#### 数据库层面
- [ ] 新表使用独立命名空间（不与现有表冲突）
- [ ] 使用事务确保数据一致性
- [ ] 迁移脚本支持回滚

#### 同步层面
- [ ] 成就同步独立于主同步流程
- [ ] 失败时不影响主同步
- [ ] 可通过配置开关关闭成就同步

#### 测试层面
- [ ] 每个 Phase 完成后测试现有功能
- [ ] 回归测试：笔记、动态、资源的 CRUD
- [ ] 同步测试：双端数据一致性

---

### 8.2 回滚方案

如果成就系统出现问题，可快速回滚：

**数据库回滚**：
```sql
-- 删除成就相关表
DROP TABLE IF EXISTS achievements;
DROP TABLE IF EXISTS user_achievements;
DROP TABLE IF EXISTS user_stats;
DROP TABLE IF EXISTS user_points_log;
DROP TABLE IF EXISTS user_achievement_profile;
```

**代码回滚**：
- 移除成就相关路由
- 注释掉成就触发钩子
- 从同步配置中移除成就表

**同步配置回滚**：
- 从 `SYNC_TABLES` 移除成就相关表
- 桌面端和移动端同步依然正常

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

## 十二、设计总结与保障

### 12.1 设计特点

这套成就系统设计具有以下特点：

✅ **完全独立**：不修改现有数据表，不侵入现有逻辑
✅ **渐进实施**：5 个 Phase，每个阶段可独立测试
✅ **可扩展统计**：键值对存储，支持动态添加指标（健康、旅行等）
✅ **增量同步**：基于操作日志，双端操作都有效
✅ **灵活规则**：支持多种成就类型和触发条件
✅ **无上限成长**：进阶成就可无限升级
✅ **情绪价值**：积分膨胀，等级提升，称号解锁
✅ **易维护**：规则配置化，逻辑清晰
✅ **可回滚**：出现问题可快速关闭或删除

### 12.2 实施保障

#### 对现有功能的保护
1. **代码隔离**：所有成就逻辑在独立 composable 中
2. **数据独立**：5 张新表，不修改现有表结构
3. **同步独立**：成就同步失败不影响主同步流程
4. **功能开关**：可通过配置随时开关成就系统

#### 测试验收标准
每个 Phase 完成后必须验证：
- [ ] 现有功能完全正常（笔记、动态、资源 CRUD）
- [ ] 现有同步功能正常（双端数据一致）
- [ ] 新功能按预期工作
- [ ] 性能无明显下降

### 12.3 统计系统可扩展性

**当前支持**：
- 内容创作（`content.*`）
- 资源管理（`asset.*`）
- 活跃度（`activity.*`）
- 质量指标（`quality.*`）

**未来扩展**（只需添加配置）：
- 健康数据（`health.*`）：步数、距离、卡路里
- 旅行数据（`travel.*`）：城市、国家、距离
- 自定义指标（`custom.*`）：任意业务指标

**扩展方式**：
```typescript
// 1. 在配置中定义新指标
STATS_METRICS['health.steps_total'] = { type: 'counter', ... }

// 2. 在数据同步时更新
await updateStat(userId, 'health.steps_total', steps, 'counter', operationId)

// 3. 创建相关成就
PRESET_ACHIEVEMENTS.push({
  key: 'health_10k_steps',
  name: '健步如飞',
  rule_config: { metric: 'health.steps_total', target: 10000 }
})
```

### 12.4 下一步行动

**调整后的执行顺序**：

1. **Phase 1（1-2天）- 完整表结构 + 本地功能**
   - 创建数据库迁移脚本（**完整版，包含所有同步字段**）
   - 实现 3 个核心 composable（不生成 operation_id）
   - 添加 5-8 个预设成就
   - 创建 `/achievements` 页面
   - **关键**：表结构完整，但不实现同步逻辑

2. **测试与验证（半天）**
   - 测试本地功能（创建笔记/动态 → 统计更新 → 成就解锁）
   - **重点**：验证现有 CRUD 和同步功能不受影响
   - 收集问题和反馈

3. **Phase 2（2-3天）- 扩展与优化**
   - 扩展成就类型（连续签到、质量成就）
   - 优化 UI（动画、通知）
   - 添加更多统计指标
   - 完善前端展示

4. **测试与验证（半天）**
   - 回归测试
   - 性能测试

5. **Phase 3（3-4天）- 实现同步逻辑**
   - **无需修改表结构**（已在 Phase 1 就绪）
   - 实现 operation_id 生成
   - 配置同步表和模式
   - 实现增量同步逻辑
   - 集成到现有同步流程

6. **重点测试（1-2天）- 双端同步验证**
   - 双端同步测试（同一设备、不同设备）
   - 边缘情况（离线操作、冲突解决）
   - 压力测试（大量操作日志）

7. **Phase 4-5（按需）- 高级功能**
   - 稀有成就、称号系统
   - 未来扩展（健康、旅行数据）

**优势**：
- ✅ Phase 1 表结构完整，避免后续数据迁移
- ✅ Phase 3 只需添加代码逻辑，不改表结构
- ✅ 无历史数据兼容问题
- ✅ 出问题可快速回滚（DROP TABLE）

**当前状态**：设计完成 ✅  
**下一步**：Phase 1 - 创建完整数据库表和核心功能

---

**准备好开始 Phase 1 了吗？**

我会创建：
1. **数据库迁移脚本**（**完整版，包含所有同步字段**）
   - 5 张表 + 索引
   - operation_id、device_id、synced_at 字段预留
2. **核心 Composable**：
   - `useAchievementSystem.ts` - 成就检查和解锁
   - `usePointsSystem.ts` - 积分管理（operation_id 先留空）
   - `useStatsCollector.ts` - 统计收集
3. **预设成就配置**：
   - 5-8 个基础成就（里程碑 + 进阶）
4. **UI 页面**：
   - `/achievements` - 成就展示页面
5. **事件集成**：
   - 在 `createNote`/`createMoment` 添加钩子

**确认后立即开始实现！** 🚀
   - **无需修改表结构**（已在 Phase 1 就绪）
   - 实现 operation_id 生成
   - 配置同步表和模式
   - 实现增量同步逻辑
   - 集成到现有同步流程

6. **重点测试（1-2天）- 双端同步验证**
   - 双端同步测试（同一设备、不同设备）
   - 边缘情况（离线操作、冲突解决）
   - 压力测试（大量操作日志）

7. **Phase 4-5（按需）- 高级功能**
   - 稀有成就、称号系统
   - 未来扩展（健康、旅行数据）

**优势**：
- ✅ Phase 1 表结构完整，避免后续数据迁移
- ✅ Phase 3 只需添加代码逻辑，不改表结构
- ✅ 无历史数据兼容问题
- ✅ 出问题可快速回滚（DROP TABLE）

**当前状态**：设计完成 ✅  
**下一步**：Phase 1 - 创建完整数据库表和核心功能

---

**准备好开始 Phase 1 了吗？**

我会创建：
1. **数据库迁移脚本**（**完整版，包含所有同步字段**）
   - 5 张表 + 索引
   - operation_id、device_id、synced_at 字段预留
2. **核心 Composable**：
   - `useAchievementSystem.ts` - 成就检查和解锁
   - `usePointsSystem.ts` - 积分管理（operation_id 先留空）
   - `useStatsCollector.ts` - 统计收集
3. **预设成就配置**：
   - 5-8 个基础成就（里程碑 + 进阶）
4. **UI 页面**：
   - `/achievements` - 成就展示页面
5. **事件集成**：
   - 在 `createNote`/`createMoment` 添加钩子

**确认后立即开始实现！** 🚀
