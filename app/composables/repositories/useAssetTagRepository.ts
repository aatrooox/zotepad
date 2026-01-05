import type { Asset } from '~/types/models'
import { useAsyncState } from '~/utils/async'
import { generateUUID } from '~/utils/uuid'
import { useTauriSQL } from '../useTauriSQL'

export interface AssetTag {
  id: number
  uuid: string
  name: string
  parent_id: number | null
  type: 'tag' | 'folder'
  description?: string
  icon?: string
  color?: string
  sort_order: number
  asset_count?: number // 联表查询时带出
  cover_url?: string // 联表查询时带出
  created_at: string
}

export function useAssetTagRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  // 获取所有标签（带资源计数和封面图）
  const getAllTags = () =>
    runAsync(async () => {
      // 这个查询稍微复杂一点：
      // 1. 关联 asset_tag_relations 计算数量
      // 2. 关联 assets 获取最新的一张图作为封面
      const sql = `
        SELECT 
          t.*,
          COUNT(r.asset_id) as asset_count,
          (
            SELECT a.url 
            FROM asset_tag_relations r2 
            JOIN assets a ON r2.asset_id = a.id 
            WHERE r2.tag_id = t.id AND a.deleted_at IS NULL AND r2.deleted_at IS NULL
            ORDER BY r2.created_at DESC 
            LIMIT 1
          ) as cover_url
        FROM asset_tags t
        LEFT JOIN asset_tag_relations r ON t.id = r.tag_id AND r.deleted_at IS NULL
        WHERE t.deleted_at IS NULL
        GROUP BY t.id
        ORDER BY t.sort_order DESC, t.created_at DESC
      `
      return await select<AssetTag[]>(sql)
    }, '获取相册列表失败')

  // 创建标签
  const createTag = (name: string, type: 'tag' | 'folder' = 'folder') =>
    runAsync(async () => {
      const now = new Date().toISOString()
      const uuid = generateUUID()
      const result = await execute(
        'INSERT INTO asset_tags (uuid, name, type, version, updated_at) VALUES (?, ?, ?, ?, ?)',
        [uuid, name, type, -Date.now(), now],
      )
      return result.lastInsertId as number
    }, '创建相册失败')

  // 删除标签（软删除）
  const deleteTag = (id: number) =>
    runAsync(async () => {
      const now = new Date().toISOString()
      // 1. 删除标签本身
      await execute(
        'UPDATE asset_tags SET deleted_at = ?, updated_at = ?, version = ? WHERE id = ?',
        [now, now, -Date.now(), id],
      )
      // 2. 删除该标签下的所有关联关系
      await execute(
        'UPDATE asset_tag_relations SET deleted_at = ?, updated_at = ?, version = ? WHERE tag_id = ?',
        [now, now, -Date.now(), id],
      )
    }, '删除相册失败')

  // 获取标签下的资源
  const getAssetsByTag = (tagId: number) =>
    runAsync(() => select<Asset[]>(
      `SELECT a.* 
       FROM assets a
       JOIN asset_tag_relations r ON a.id = r.asset_id
       WHERE r.tag_id = ? AND a.deleted_at IS NULL AND r.deleted_at IS NULL
       ORDER BY r.created_at DESC`,
      [tagId],
    ), '获取相册资源失败')

  // 将资源添加到标签
  const addAssetsToTag = (assetIds: number[], tagId: number) =>
    runAsync(async () => {
      const now = new Date().toISOString()
      const version = -Date.now()

      // 批量插入或忽略（如果已存在）
      // SQLite 不支持一次性插入多个 VALUES 且带 WHERE NOT EXISTS 这种复杂逻辑简单写
      // 这里用循环处理，虽然不是极致性能，但对于相册操作足够了
      for (const assetId of assetIds) {
        const uuid = generateUUID()
        // 使用 INSERT OR IGNORE 避免重复关联
        await execute(
          `INSERT OR IGNORE INTO asset_tag_relations 
           (uuid, asset_id, tag_id, version, updated_at) 
           VALUES (?, ?, ?, ?, ?)`,
          [uuid, assetId, tagId, version, now],
        )

        // 如果是软删除过的记录，需要恢复
        // 这里简化处理：先尝试插入，如果没插入（因为唯一约束），则尝试更新 deleted_at = NULL
        // 但由于 UNIQUE(asset_id, tag_id) 约束，INSERT OR IGNORE 会忽略冲突
        // 所以我们需要额外检查是否需要"复活"关系
        await execute(
          `UPDATE asset_tag_relations 
             SET deleted_at = NULL, version = ?, updated_at = ? 
             WHERE asset_id = ? AND tag_id = ? AND deleted_at IS NOT NULL`,
          [version, now, assetId, tagId],
        )
      }
    }, '添加资源到相册失败')

  // 从标签移除资源
  const removeAssetsFromTag = (assetIds: number[], tagId: number) =>
    runAsync(async () => {
      const now = new Date().toISOString()
      const idsStr = assetIds.join(',')
      if (!idsStr)
        return

      await execute(
        `UPDATE asset_tag_relations 
         SET deleted_at = ?, updated_at = ?, version = ? 
         WHERE tag_id = ? AND asset_id IN (${idsStr})`,
        [now, now, -Date.now(), tagId],
      )
    }, '移除资源失败')

  // 移动资源（从源标签移到目标标签）
  const moveAssets = (assetIds: number[], sourceTagId: number, targetTagId: number) =>
    runAsync(async () => {
      // 1. 添加到新标签
      await addAssetsToTag(assetIds, targetTagId)
      // 2. 从旧标签移除
      await removeAssetsFromTag(assetIds, sourceTagId)
    }, '移动资源失败')

  return {
    isLoading,
    error,
    getAllTags,
    createTag,
    deleteTag,
    getAssetsByTag,
    addAssetsToTag,
    removeAssetsFromTag,
    moveAssets,
  }
}
