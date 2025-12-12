-- 成就系统快速测试 SQL 脚本
-- 用于验证 Phase 1 实现

-- 1. 检查表是否创建成功
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%achievement%' OR name LIKE '%points%' OR name LIKE '%stats%';

-- 预期输出：
-- achievements
-- user_achievements
-- user_stats
-- user_points_log
-- user_achievement_profile

-- 2. 检查预设成就是否导入
SELECT key, name, category FROM achievements;

-- 预期输出：8 个预设成就

-- 3. 创建第一篇笔记后检查统计
SELECT * FROM user_stats WHERE user_id = 1;

-- 预期输出：
-- content.notes_total = 1
-- content.words_total = [字数]
-- quality.longest_note = [字数]
-- activity.last_active_date = [时间戳]

-- 4. 检查成就解锁情况
SELECT 
  ua.achievement_key,
  a.name,
  ua.level,
  ua.total_points,
  ua.total_exp
FROM user_achievements ua
JOIN achievements a ON ua.achievement_key = a.key
WHERE ua.user_id = 1;

-- 预期输出：writing_first_note（初出茅庐）已解锁

-- 5. 检查积分日志
SELECT 
  source_type,
  source_id,
  achievement_key,
  points,
  exp,
  reason,
  datetime(created_at/1000, 'unixepoch', 'localtime') as created_time
FROM user_points_log 
WHERE user_id = 1 
ORDER BY created_at DESC;

-- 6. 检查用户档案
SELECT 
  total_points,
  total_exp,
  current_level,
  achievements_count
FROM user_achievement_profile 
WHERE user_id = 1;

-- 预期输出：
-- total_points > 0
-- total_exp > 0
-- current_level = 1
-- achievements_count = 1

-- 7. 测试进阶成就进度
-- 创建多篇笔记后，查看"文字工匠"成就进度
SELECT 
  achievement_key,
  level,
  progress,
  total_points,
  total_exp
FROM user_achievements 
WHERE user_id = 1 AND achievement_key = 'writing_words';

-- 8. 完整统计概览
SELECT 
  '总积分' as metric,
  CAST(total_points AS TEXT) as value
FROM user_achievement_profile WHERE user_id = 1
UNION ALL
SELECT 
  '总经验',
  CAST(total_exp AS TEXT)
FROM user_achievement_profile WHERE user_id = 1
UNION ALL
SELECT 
  '当前等级',
  CAST(current_level AS TEXT)
FROM user_achievement_profile WHERE user_id = 1
UNION ALL
SELECT 
  '解锁成就数',
  CAST(achievements_count AS TEXT)
FROM user_achievement_profile WHERE user_id = 1
UNION ALL
SELECT 
  '笔记总数',
  stat_value
FROM user_stats WHERE user_id = 1 AND stat_key = 'content.notes_total'
UNION ALL
SELECT 
  '总字数',
  stat_value
FROM user_stats WHERE user_id = 1 AND stat_key = 'content.words_total';
