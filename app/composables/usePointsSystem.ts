/**
 * 积分系统 Composable
 * Phase 1: 本地功能，operation_id 预留但不生成
 * Phase 3: 添加 operation_id 生成逻辑用于同步
 */

import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from './useTauriSQL'

export interface PointsLogEntry {
  id: number
  user_id: number
  operation_id: string | null
  source_type: string
  source_id: string
  achievement_key: string | null
  points: number
  exp: number
  reason: string | null
  created_at: number
  device_id: string | null
  synced_at: number | null
}

export interface UserProfile {
  id: number
  user_id: number
  total_points: number
  total_exp: number
  current_level: number
  title: string | null
  achievements_count: number
  updated_at: number
}

export function usePointsSystem() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  /**
   * 初始化用户档案
   */
  const initProfile = (userId: number) =>
    runAsync(async () => {
      const now = Date.now()
      await execute(
        `INSERT OR IGNORE INTO user_achievement_profile 
        (user_id, total_points, total_exp, current_level, achievements_count, updated_at)
        VALUES (?, 0, 0, 1, 0, ?)`,
        [userId, now],
      )
    }, '初始化用户档案失败')

  /**
   * 获取用户档案（总积分、总经验、等级）
   */
  const getProfile = async (userId: number): Promise<UserProfile | null> => {
    const result = await select<UserProfile[]>(
      'SELECT * FROM user_achievement_profile WHERE user_id = ?',
      [userId],
    )

    if (result.length === 0) {
      // 首次访问，创建档案
      await initProfile(userId)
      return await getProfile(userId)
    }

    return result[0] || null
  }

  /**
   * 更新用户档案（从积分日志重新计算）
   */
  const updateProfile = (userId: number) =>
    runAsync(async () => {
      // 1. 计算总积分和总经验
      const stats = await select<Array<{ total_points: number, total_exp: number }>>(
        'SELECT COALESCE(SUM(points), 0) as total_points, COALESCE(SUM(exp), 0) as total_exp FROM user_points_log WHERE user_id = ?',
        [userId],
      )

      const { total_points, total_exp } = stats[0] || { total_points: 0, total_exp: 0 }

      // 2. 计算等级（公式：level = floor(sqrt(exp / 100)) + 1）
      const currentLevel = Math.floor(Math.sqrt(total_exp / 100)) + 1

      // 3. 计算成就数
      const achievementStats = await select<Array<{ count: number }>>(
        'SELECT COUNT(*) as count FROM user_achievements WHERE user_id = ?',
        [userId],
      )
      const achievementsCount = achievementStats[0]?.count || 0

      // 4. 更新档案
      const now = Date.now()
      await execute(
        `INSERT INTO user_achievement_profile 
        (user_id, total_points, total_exp, current_level, achievements_count, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          total_points = excluded.total_points,
          total_exp = excluded.total_exp,
          current_level = excluded.current_level,
          achievements_count = excluded.achievements_count,
          updated_at = excluded.updated_at`,
        [userId, total_points, total_exp, currentLevel, achievementsCount, now],
      )

      return { total_points, total_exp, currentLevel, achievementsCount }
    }, '更新用户档案失败')

  /**
   * 获取积分日志
   */
  const getPointsLog = (userId: number, limit: number = 50) =>
    runAsync(
      () =>
        select<PointsLogEntry[]>(
          'SELECT * FROM user_points_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
          [userId, limit],
        ),
      '获取积分日志失败',
    )

  /**
   * 计算升级所需经验
   */
  const getExpForNextLevel = (currentLevel: number): number => {
    // 升到下一级所需总经验：(level^2) * 100
    return currentLevel * currentLevel * 100
  }

  /**
   * 获取当前等级进度
   */
  const getLevelProgress = (totalExp: number, currentLevel: number) => {
    const currentLevelExp = (currentLevel - 1) * (currentLevel - 1) * 100
    const nextLevelExp = currentLevel * currentLevel * 100
    const expInLevel = totalExp - currentLevelExp
    const expNeeded = nextLevelExp - currentLevelExp

    return {
      current: expInLevel,
      max: expNeeded,
      percentage: (expInLevel / expNeeded) * 100,
    }
  }

  /**
   * 添加积分和经验
   * Phase 1: operation_id 留空
   * Phase 3: 生成 operation_id = `${deviceId}_${timestamp}_${counter}`
   */
  const addPoints = (
    userId: number,
    sourceType: string,
    sourceId: string,
    points: number,
    exp: number,
    reason: string | null = null,
    achievementKey: string | null = null,
  ) =>
    runAsync(async () => {
      const now = Date.now()

      // Phase 1: operation_id 留空
      // Phase 3: 在这里生成 operation_id
      const operationId = '' // TODO Phase 3: 生成唯一 ID

      // 插入积分日志
      await execute(
        `INSERT INTO user_points_log 
        (user_id, operation_id, source_type, source_id, achievement_key, points, exp, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, operationId, sourceType, sourceId, achievementKey, points, exp, reason, now],
      )

      // 更新用户档案
      await updateProfile(userId)

      return { points, exp }
    }, '添加积分失败')

  return {
    isLoading,
    error,
    addPoints,
    getProfile,
    initProfile,
    updateProfile,
    getPointsLog,
    getExpForNextLevel,
    getLevelProgress,
  }
}
