-- ========================================
-- 成就系统数据库迁移脚本 v1.0
-- Phase 1: 完整表结构（包含同步字段）
-- 创建日期: 2025-12-12
-- ========================================

-- 1. 成就定义表（系统预设，不参与同步）
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL, -- milestone, progressive, streak, rare, quality
  category TEXT NOT NULL, -- writing, social, asset, activity, quality
  points INTEGER DEFAULT 0,
  exp INTEGER DEFAULT 0,
  icon TEXT,
  rule_config TEXT, -- JSON: { metric, target, comparison, etc. }
  max_level INTEGER DEFAULT 1, -- 最大等级（进阶成就）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_achievements_type ON achievements(type);
CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements(category);

-- 2. 用户成就关联表（记录解锁情况，Merge 同步模式）
CREATE TABLE IF NOT EXISTS user_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  achievement_key TEXT NOT NULL,
  level INTEGER DEFAULT 1, -- 当前等级
  progress INTEGER DEFAULT 0, -- 当前进度
  total_points INTEGER DEFAULT 0, -- 该成就累计积分
  total_exp INTEGER DEFAULT 0, -- 该成就累计经验
  unlocked_at INTEGER NOT NULL, -- 首次解锁时间
  updated_at INTEGER NOT NULL, -- 最后更新时间
  device_id TEXT, -- 同步字段（Phase 1 不使用）
  synced_at INTEGER, -- 同步字段（Phase 1 不使用）
  UNIQUE(user_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_synced ON user_achievements(synced_at);

-- 3. 用户统计表（可扩展键值对存储，Calculated 同步模式）
CREATE TABLE IF NOT EXISTS user_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  stat_key TEXT NOT NULL, -- 如: content.notes_total, health.steps_total
  stat_value TEXT NOT NULL, -- 存储为字符串，支持数字和日期
  stat_type TEXT DEFAULT 'counter', -- counter, max, last, date
  updated_at INTEGER NOT NULL,
  device_id TEXT, -- 同步字段（Phase 1 不使用）
  synced_at INTEGER, -- 同步字段（Phase 1 不使用）
  UNIQUE(user_id, stat_key)
);

CREATE INDEX IF NOT EXISTS idx_user_stats_user ON user_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stats_key ON user_stats(stat_key);
CREATE INDEX IF NOT EXISTS idx_user_stats_synced ON user_stats(synced_at);

-- 4. 积分日志表（操作日志，Incremental 同步模式，核心表）
CREATE TABLE IF NOT EXISTS user_points_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  operation_id TEXT NOT NULL UNIQUE, -- 同步去重字段（Phase 1 留空）
  source_type TEXT NOT NULL, -- note, moment, asset, achievement, etc.
  source_id TEXT NOT NULL, -- 来源记录的 ID
  achievement_key TEXT, -- 关联成就（可选）
  points INTEGER NOT NULL, -- 获得积分
  exp INTEGER NOT NULL, -- 获得经验
  reason TEXT, -- 获得原因
  created_at INTEGER NOT NULL,
  device_id TEXT, -- 同步字段（Phase 1 不使用）
  synced_at INTEGER -- 同步字段（Phase 1 不使用）
);

CREATE INDEX IF NOT EXISTS idx_points_log_user ON user_points_log(user_id);
CREATE INDEX IF NOT EXISTS idx_points_log_operation ON user_points_log(operation_id);
CREATE INDEX IF NOT EXISTS idx_points_log_synced ON user_points_log(synced_at);
CREATE INDEX IF NOT EXISTS idx_points_log_created ON user_points_log(created_at);

-- 5. 用户成就档案表（计算字段汇总，不直接同步）
CREATE TABLE IF NOT EXISTS user_achievement_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  total_points INTEGER DEFAULT 0, -- 总积分
  total_exp INTEGER DEFAULT 0, -- 总经验
  current_level INTEGER DEFAULT 1, -- 当前等级
  title TEXT, -- 当前称号
  achievements_count INTEGER DEFAULT 0, -- 解锁成就数
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_user ON user_achievement_profile(user_id);

-- ========================================
-- 预设成就数据初始化
-- ========================================

-- 写作类成就
INSERT OR IGNORE INTO achievements (key, name, description, type, category, points, exp, icon, rule_config, max_level, created_at, updated_at) VALUES
('writing_first_note', '初出茅庐', '创建第一篇笔记', 'milestone', 'writing', 10, 5, '📝', '{"metric":"content.notes_total","target":1}', 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('writing_10_notes', '勤奋笔者', '创建10篇笔记', 'milestone', 'writing', 50, 20, '✍️', '{"metric":"content.notes_total","target":10}', 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('writing_50_notes', '笔记达人', '创建50篇笔记', 'milestone', 'writing', 200, 100, '📚', '{"metric":"content.notes_total","target":50}', 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('writing_words', '文字工匠', '累计书写字数（可升级）', 'progressive', 'writing', 10, 5, '✨', '{"metric":"content.words_total","baseTarget":1000,"rate":2}', 999, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- 社交类成就  
INSERT OR IGNORE INTO achievements (key, name, description, type, category, points, exp, icon, rule_config, max_level, created_at, updated_at) VALUES
('social_first_moment', '分享时刻', '发布第一条动态', 'milestone', 'social', 10, 5, '💬', '{"metric":"content.moments_total","target":1}', 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('social_10_moments', '活跃用户', '发布10条动态', 'milestone', 'social', 50, 20, '🎉', '{"metric":"content.moments_total","target":10}', 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- 资源类成就
INSERT OR IGNORE INTO achievements (key, name, description, type, category, points, exp, icon, rule_config, max_level, created_at, updated_at) VALUES
('asset_first_image', '摄影起步', '上传第一张图片', 'milestone', 'asset', 10, 5, '📷', '{"metric":"asset.images_total","target":1}', 1, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('asset_collector', '素材收藏家', '累计上传素材（可升级）', 'progressive', 'asset', 10, 5, '🗂️', '{"metric":"asset.total","baseTarget":10,"rate":2}', 999, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ========================================
-- 迁移完成
-- ========================================
