/**
 * 成就系统 Composable
 * 负责成就检查、解锁和奖励发放
 * Phase 1: 本地功能
 */

import { useAsyncState } from '~/utils/async'
import { useLog } from './useLog'
import { usePointsSystem } from './usePointsSystem'
import { useStatsCollector } from './useStatsCollector'
import { useTauriSQL } from './useTauriSQL'

export interface Achievement {
  id: number
  key: string
  name: string
  description: string | null
  type: 'milestone' | 'progressive' | 'streak' | 'rare' | 'quality'
  category: string
  points: number
  exp: number
  icon: string | null
  rule_config: string // JSON
  max_level: number
  created_at: number
  updated_at: number
}

export interface UserAchievement {
  id: number
  user_id: number
  achievement_key: string
  level: number
  progress: number
  total_points: number
  total_exp: number
  unlocked_at: number
  updated_at: number
  device_id: string | null
  synced_at: number | null
}

export interface AchievementRule {
  metric: string // 统计键，如 content.notes_total
  target?: number // 目标值（里程碑成就）
  baseTarget?: number // 基础目标（进阶成就）
  rate?: number // 增长倍率（进阶成就）
  comparison?: 'gte' | 'lte' | 'eq' // 比较操作
}

export function useAchievementSystem() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()
  const { addPoints } = usePointsSystem()
  const { getStat } = useStatsCollector()
  const { info, warn } = useLog()

  /**
   * 根据统计指标查找相关成就
   */
  const getAchievementsByMetric = (metric: string) =>
    runAsync(async () => {
      const achievements = await select<Achievement[]>(
        'SELECT * FROM achievements',
        [],
      )

      // 过滤出包含该 metric 的成就
      return achievements.filter((achievement) => {
        try {
          const rule: AchievementRule = JSON.parse(achievement.rule_config)
          return rule.metric === metric
        }
        catch {
          return false
        }
      })
    }, '查询成就失败')

  /**
   * 检查并解锁成就
   * @param userId 用户 ID
   * @param metric 触发的统计指标（如 content.notes_total）
   */
  const checkAchievements = (userId: number, metric: string) =>
    runAsync(async () => {
      try {
        // 1. 获取相关成就
        const achievements = await getAchievementsByMetric(metric)

        if (achievements.length === 0) {
          return { checked: 0, unlocked: [] }
        }

        // 2. 获取当前统计值
        const stat = await getStat(userId, metric)
        const currentValue = stat ? Number(stat.stat_value) : 0

        const unlocked: Array<{ achievement: Achievement, level: number }> = []

        // 3. 逐个检查成就
        for (const achievement of achievements) {
          const result = await evaluateAchievement(userId, achievement, currentValue)

          if (result.shouldUnlock) {
            await unlockAchievement(userId, achievement, result.level)
            unlocked.push({ achievement, level: result.level })
            info(`成就解锁: ${achievement.name} (Level ${result.level})`)
          }
        }

        return { checked: achievements.length, unlocked }
      }
      catch {
        warn('成就检查失败')
        // 成就系统失败不影响主流程，仅记录错误
        return { checked: 0, unlocked: [] }
      }
    }, '检查成就失败')

  /**
   * 评估成就是否达成
   */
  async function evaluateAchievement(
    userId: number,
    achievement: Achievement,
    currentValue: number,
  ): Promise<{ shouldUnlock: boolean, level: number, progress: number }> {
    const rule: AchievementRule = JSON.parse(achievement.rule_config)

    // 查询用户已解锁情况
    const userAchievement = await select<UserAchievement[]>(
      'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_key = ?',
      [userId, achievement.key],
    )

    const currentLevel = userAchievement[0]?.level || 0

    switch (achievement.type) {
      case 'milestone': {
        // 里程碑成就：达到目标即解锁
        const target = rule.target || 0
        if (currentLevel === 0 && currentValue >= target) {
          return { shouldUnlock: true, level: 1, progress: currentValue }
        }
        return { shouldUnlock: false, level: currentLevel, progress: currentValue }
      }

      case 'progressive': {
        // 进阶成就：可无限升级
        const baseTarget = rule.baseTarget || 100
        const rate = rule.rate || 2
        const maxLevel = achievement.max_level

        // 计算当前应该达到的等级
        let targetLevel = currentLevel
        while (targetLevel < maxLevel) {
          const nextLevelTarget = baseTarget * rate ** targetLevel
          if (currentValue >= nextLevelTarget) {
            targetLevel++
          }
          else {
            break
          }
        }

        if (targetLevel > currentLevel) {
          return { shouldUnlock: true, level: targetLevel, progress: currentValue }
        }

        return { shouldUnlock: false, level: currentLevel, progress: currentValue }
      }

      // Phase 2 实现其他类型
      case 'streak':
      case 'rare':
      case 'quality':
      default:
        return { shouldUnlock: false, level: currentLevel, progress: 0 }
    }
  }

  /**
   * 解锁成就
   */
  async function unlockAchievement(userId: number, achievement: Achievement, level: number) {
    const now = Date.now()

    // 查询是否已存在
    const existing = await select<UserAchievement[]>(
      'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_key = ?',
      [userId, achievement.key],
    )

    if (existing.length === 0) {
      // 首次解锁
      await execute(
        `INSERT INTO user_achievements 
        (user_id, achievement_key, level, progress, total_points, total_exp, unlocked_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
        [
          userId,
          achievement.key,
          level,
          achievement.points * level,
          achievement.exp * level,
          now,
          now,
        ],
      )
    }
    else {
      // 升级
      const oldLevel = existing[0]!.level
      const levelDiff = level - oldLevel
      const newTotalPoints = existing[0]!.total_points + achievement.points * levelDiff
      const newTotalExp = existing[0]!.total_exp + achievement.exp * levelDiff

      await execute(
        `UPDATE user_achievements 
        SET level = ?, total_points = ?, total_exp = ?, updated_at = ?
        WHERE user_id = ? AND achievement_key = ?`,
        [level, newTotalPoints, newTotalExp, now, userId, achievement.key],
      )
    }

    // 发放奖励
    const levelDiff = existing.length === 0 ? level : level - existing[0]!.level
    await addPoints(
      userId,
      'achievement',
      achievement.key,
      achievement.points * levelDiff,
      achievement.exp * levelDiff,
      `解锁成就: ${achievement.name} (Lv.${level})`,
      achievement.key,
    )
  }

  /**
   * 获取用户已解锁成就
   */
  const getUserAchievements = (userId: number) =>
    runAsync(
      () =>
        select<UserAchievement[]>(
          'SELECT * FROM user_achievements WHERE user_id = ? ORDER BY unlocked_at DESC',
          [userId],
        ),
      '获取用户成就失败',
    )

  /**
   * 获取所有成就（含解锁状态）
   */
  const getAllAchievementsWithStatus = (userId: number) =>
    runAsync(async () => {
      const allAchievements = await select<Achievement[]>('SELECT * FROM achievements ORDER BY category, id', [])
      const userAchievements = await getUserAchievements(userId)

      const userAchievementsMap = new Map(
        userAchievements.map(ua => [ua.achievement_key, ua]),
      )

      return allAchievements.map((achievement) => {
        const userAchievement = userAchievementsMap.get(achievement.key)
        return {
          ...achievement,
          unlocked: !!userAchievement,
          level: userAchievement?.level || 0,
          progress: userAchievement?.progress || 0,
          unlocked_at: userAchievement?.unlocked_at || null,
        }
      })
    }, '获取成就列表失败')

  /**
   * 获取成就详情
   */
  const getAchievement = (key: string) =>
    runAsync(async () => {
      const result = await select<Achievement[]>(
        'SELECT * FROM achievements WHERE key = ?',
        [key],
      )
      return result[0] || null
    }, '获取成就详情失败')

  return {
    isLoading,
    error,
    checkAchievements,
    getUserAchievements,
    getAllAchievementsWithStatus,
    getAchievement,
  }
}
