-- 修复 version=0 的数据，改为递增版本号
-- 在桌面端的 app_v3.db 上执行

-- 修复 notes
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as new_version
  FROM notes
  WHERE version = 0
)
UPDATE notes
SET version = (SELECT new_version FROM numbered WHERE numbered.id = notes.id)
WHERE version = 0;

-- 修复 moments
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as new_version
  FROM moments
  WHERE version = 0
)
UPDATE moments
SET version = (SELECT new_version FROM numbered WHERE numbered.id = moments.id)
WHERE version = 0;

-- 修复 assets
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as new_version
  FROM assets
  WHERE version = 0
)
UPDATE assets
SET version = (SELECT new_version FROM numbered WHERE numbered.id = assets.id)
WHERE version = 0;

-- 修复 workflows
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as new_version
  FROM workflows
  WHERE version = 0
)
UPDATE workflows
SET version = (SELECT new_version FROM numbered WHERE numbered.id = workflows.id)
WHERE version = 0;

-- 查看修复结果
SELECT 'notes' as table_name, COUNT(*) as total, COUNT(CASE WHEN version > 0 THEN 1 END) as with_version
FROM notes
UNION ALL
SELECT 'moments', COUNT(*), COUNT(CASE WHEN version > 0 THEN 1 END)
FROM moments
UNION ALL
SELECT 'assets', COUNT(*), COUNT(CASE WHEN version > 0 THEN 1 END)
FROM assets
UNION ALL
SELECT 'workflows', COUNT(*), COUNT(CASE WHEN version > 0 THEN 1 END)
FROM workflows;
