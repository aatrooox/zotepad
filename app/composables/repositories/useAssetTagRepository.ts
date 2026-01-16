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
      // 1. 关联 asset_tag_relations 计算数量（只统计未删除的资源）
      // 2. 关联 assets 获取最新的一张图作为封面
      const sql = `
        SELECT 
          t.*,
          COUNT(CASE WHEN a.deleted_at IS NULL THEN 1 END) as asset_count,
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
        LEFT JOIN assets a ON r.asset_id = a.id
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

  // 获取标签下的资源（支持 UUID 和 ID 关联）
  const getAssetsByTag = (tagId: number) =>
    runAsync(() => select<Asset[]>(
      `SELECT DISTINCT a.* 
       FROM assets a
       LEFT JOIN asset_tag_relations r ON (
         (r.asset_uuid IS NOT NULL AND a.uuid = r.asset_uuid) OR
         (r.asset_uuid IS NULL AND a.id = r.asset_id)
       )
       WHERE r.tag_id = ? 
         AND a.deleted_at IS NULL 
         AND r.deleted_at IS NULL
       ORDER BY r.created_at DESC`,
      [tagId],
    ), '获取相册资源失败')

  // 将资源添加到标签（使用 UUID 支持跨设备同步）
  const addAssetsToTag = (assetIds: number[], tagId: number) =>
    runAsync(async () => {
      const now = new Date().toISOString()
      const version = -Date.now()

      // 1. 获取相册的 UUID
      const tagResult = await select<Array<{ uuid: string }>>(
        'SELECT uuid FROM asset_tags WHERE id = ?',
        [tagId],
      )
      const tagUuid = tagResult[0]?.uuid
      if (!tagUuid) {
        throw new Error('相册不存在')
      }

      for (const assetId of assetIds) {
        // 2. 获取资源的 UUID，如果没有则创建一个
        const assetResult = await select<Array<{ uuid: string | null }>>(
          'SELECT uuid FROM assets WHERE id = ?',
          [assetId],
        )
        let assetUuid = assetResult[0]?.uuid

        // 如果旧资源没有 UUID，自动生成一个
        if (!assetUuid || assetUuid.trim() === '') {
          assetUuid = generateUUID()
          await execute(
            'UPDATE assets SET uuid = ?, updated_at = ?, version = ? WHERE id = ?',
            [assetUuid, now, version, assetId],
          )
        }

        // 3. 创建关联记录（同时保存 ID 和 UUID）
        const relationUuid = generateUUID()
        await execute(
          `INSERT OR IGNORE INTO asset_tag_relations 
           (uuid, asset_id, tag_id, asset_uuid, tag_uuid, version, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [relationUuid, assetId, tagId, assetUuid, tagUuid, version, now],
        )

        // 4. 如果是软删除过的记录，需要恢复
        await execute(
          `UPDATE asset_tag_relations 
           SET deleted_at = NULL, asset_uuid = ?, tag_uuid = ?, version = ?, updated_at = ? 
           WHERE asset_id = ? AND tag_id = ? AND deleted_at IS NOT NULL`,
          [assetUuid, tagUuid, version, now, assetId, tagId],
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
