/**
 * 统计数据收集器 Composable
 * 负责收集和更新用户统计数据（可扩展键值对存储）
 * Phase 1: 本地功能
 * Phase 3: 添加 device_id 和 synced_at
 */

import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from './useTauriSQL'

export interface UserStat {
  id: number
  user_id: number
  stat_key: string
  stat_value: string
  stat_type: 'counter' | 'max' | 'last' | 'date'
  updated_at: number
  device_id: string | null
  synced_at: number | null
}

/**
 * 统计指标类型定义
 */
export type StatType = 'counter' | 'max' | 'last' | 'date'

/**
 * 统计指标配置
 */
export const STATS_METRICS = {
  // 内容创作
  'content.notes_total': { type: 'counter' as StatType, name: '笔记总数' },
  'content.moments_total': { type: 'counter' as StatType, name: '动态总数' },
  'content.words_total': { type: 'counter' as StatType, name: '总字数' },

  // 资源管理
  'asset.images_total': { type: 'counter' as StatType, name: '图片总数' },
  'asset.videos_total': { type: 'counter' as StatType, name: '视频总数' },
  'asset.total': { type: 'counter' as StatType, name: '素材总数' },
  'asset.compression_saved_bytes': { type: 'counter' as StatType, name: '压缩节省流量' },
  'asset.compressed_count': { type: 'counter' as StatType, name: '压缩图片数量' },

  // 活跃度
  'activity.days_active': { type: 'counter' as StatType, name: '活跃天数' },
  'activity.last_active_date': { type: 'date' as StatType, name: '最后活跃日期' },
  'activity.streak_days': { type: 'counter' as StatType, name: '连续活跃天数' },

  // 质量指标
  'quality.longest_note': { type: 'max' as StatType, name: '最长笔记字数' },
  'quality.avg_note_length': { type: 'last' as StatType, name: '平均笔记长度' },

  // 未来扩展：健康数据（Phase 4+）
  // 'health.steps_total': { type: 'counter' as StatType, name: '总步数' },
  // 'health.distance_km': { type: 'counter' as StatType, name: '总距离(km)' },

  // 未来扩展：旅行数据（Phase 4+）
  // 'travel.cities_visited': { type: 'counter' as StatType, name: '访问城市数' },
  // 'travel.countries_visited': { type: 'counter' as StatType, name: '访问国家数' },
}

export function useStatsCollector() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  /**
   * 更新统计数据
   * @param userId 用户 ID
   * @param statKey 统计键（如 content.notes_total）
   * @param value 新值（数字或字符串）
   * @param statType 统计类型（counter/max/last/date）
   */
  const updateStat = (
    userId: number,
    statKey: string,
    value: number | string,
    statType: StatType = 'counter',
  ) =>
    runAsync(async () => {
      const now = Date.now()
      const valueStr = String(value)

      // 查询当前值
      const current = await select<UserStat[]>(
        'SELECT * FROM user_stats WHERE user_id = ? AND stat_key = ?',
        [userId, statKey],
      )

      if (current.length === 0) {
        // 插入新记录
        await execute(
          `INSERT INTO user_stats (user_id, stat_key, stat_value, stat_type, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
          [userId, statKey, valueStr, statType, now],
        )
      }
      else {
        // 根据类型更新
        const oldValue = current[0]!.stat_value
        let newValue = valueStr

        switch (statType) {
          case 'counter':
            // 累加
            newValue = String(Number(oldValue) + Number(value))
            break
          case 'max':
            // 取最大值
            newValue = String(Math.max(Number(oldValue), Number(value)))
            break
          case 'last':
            // 直接覆盖
            newValue = valueStr
            break
          case 'date':
            // 取较新的日期
            newValue = Math.max(Number(oldValue), Number(value)).toString()
            break
        }

        await execute(
          'UPDATE user_stats SET stat_value = ?, updated_at = ? WHERE user_id = ? AND stat_key = ?',
          [newValue, now, userId, statKey],
        )
      }

      return { statKey, value: valueStr }
    }, '更新统计数据失败')

  /**
   * 增加计数器（快捷方法）
   */
  const incrementCounter = (userId: number, statKey: string, increment: number = 1) =>
    updateStat(userId, statKey, increment, 'counter')

  /**
   * 更新最大值（快捷方法）
   */
  const updateMax = (userId: number, statKey: string, value: number) =>
    updateStat(userId, statKey, value, 'max')

  /**
   * 获取单个统计数据
   */
  const getStat = (userId: number, statKey: string) =>
    runAsync(async () => {
      const result = await select<UserStat[]>(
        'SELECT * FROM user_stats WHERE user_id = ? AND stat_key = ?',
        [userId, statKey],
      )
      return result[0] || null
    }, '获取统计数据失败')

  /**
   * 获取用户所有统计数据
   */
  const getAllStats = (userId: number) =>
    runAsync(
      () => select<UserStat[]>('SELECT * FROM user_stats WHERE user_id = ?', [userId]),
      '获取统计数据失败',
    )

  /**
   * 批量更新统计（用于复杂操作）
   */
  const batchUpdateStats = (userId: number, updates: Array<{ key: string, value: number | string, type: StatType }>) =>
    runAsync(async () => {
      for (const update of updates) {
        await updateStat(userId, update.key, update.value, update.type)
      }
    }, '批量更新统计失败')

  /**
   * 收集笔记创建事件的统计
   */
  const collectNoteCreated = (userId: number, wordCount: number) =>
    batchUpdateStats(userId, [
      { key: 'content.notes_total', value: 1, type: 'counter' },
      { key: 'content.words_total', value: wordCount, type: 'counter' },
      { key: 'quality.longest_note', value: wordCount, type: 'max' },
      { key: 'activity.last_active_date', value: Date.now(), type: 'date' },
    ])

  /**
   * 收集动态创建事件的统计
   */
  const collectMomentCreated = (userId: number) =>
    batchUpdateStats(userId, [
      { key: 'content.moments_total', value: 1, type: 'counter' },
      { key: 'activity.last_active_date', value: Date.now(), type: 'date' },
    ])

  /**
   * 收集资源上传事件的统计
   */
  const collectAssetUploaded = (userId: number, assetType: 'image' | 'video' | 'other') =>
    batchUpdateStats(userId, [
      { key: 'asset.total', value: 1, type: 'counter' },
      { key: `asset.${assetType}s_total`, value: 1, type: 'counter' },
      { key: 'activity.last_active_date', value: Date.now(), type: 'date' },
    ])

  return {
    isLoading,
    error,
    updateStat,
    incrementCounter,
    updateMax,
    getStat,
    getAllStats,
    batchUpdateStats,
    collectNoteCreated,
    collectMomentCreated,
    collectAssetUploaded,
  }
}
