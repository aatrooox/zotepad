import type { Asset } from '~/types/models'
import { useAsyncState } from '~/utils/async'
import { generateUUID } from '~/utils/uuid'
import { useTauriSQL } from '../useTauriSQL'

export function useAssetRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createAsset = (asset: Omit<Asset, 'id' | 'created_at'>) =>
    runAsync(async () => {
      const now = new Date().toISOString()
      const uuid = generateUUID()
      const result = await execute(
        'INSERT INTO assets (uuid, url, path, filename, size, mime_type, storage_type, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid, asset.url, asset.path, asset.filename, asset.size || 0, asset.mime_type || '', asset.storage_type, -Date.now(), now],
      )
      const assetId = result.lastInsertId as number

      // 成就系统集成（Phase 1）
      try {
        // 获取当前用户 ID
        const { useCurrentUser } = await import('../useCurrentUser')
        const { getCurrentUserId } = useCurrentUser()
        const userId = getCurrentUserId()

        // 动态导入避免循环依赖
        const { useStatsCollector } = await import('../useStatsCollector')
        const { useAchievementSystem } = await import('../useAchievementSystem')
        const { usePointsRewards } = await import('../usePointsRewards')

        const { collectAssetUploaded } = useStatsCollector()
        const { checkAchievements } = useAchievementSystem()
        const { rewardAssetUploaded } = usePointsRewards()

        // 确定资源类型
        const assetType = asset.mime_type?.startsWith('image/')
          ? 'image'
          : asset.mime_type?.startsWith('video/') ? 'video' : 'other'

        // 收集统计数据
        await collectAssetUploaded(userId, assetType)

        // 添加积分奖励
        await rewardAssetUploaded(userId, assetId, asset.mime_type, asset.size)

        // 检查相关成就
        await checkAchievements(userId, 'asset.total')
        await checkAchievements(userId, `asset.${assetType}s_total`)
      }
      catch (err) {
        // 成就系统失败不影响主流程
        console.warn('成就系统处理失败:', err)
      }

      return assetId
    }, '创建资源记录失败')

  const getAllAssets = () =>
    runAsync(() => select<Asset[]>(
      'SELECT * FROM assets WHERE deleted_at IS NULL ORDER BY created_at DESC',
    ), '获取资源列表失败')

  const deleteAsset = (id: number) =>
    runAsync(() => execute(
      'UPDATE assets SET deleted_at = ?, updated_at = ?, version = ? WHERE id = ?',
      [new Date().toISOString(), new Date().toISOString(), -Date.now(), id],
    ), '删除资源失败')

  return {
    isLoading,
    error,
    createAsset,
    getAllAssets,
    deleteAsset,
  }
}
