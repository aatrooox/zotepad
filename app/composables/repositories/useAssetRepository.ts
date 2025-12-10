import type { Asset } from '~/types/models'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export function useAssetRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createAsset = (asset: Omit<Asset, 'id' | 'created_at'>) =>
    runAsync(async () => {
      const now = new Date().toISOString()
      const result = await execute(
        'INSERT INTO assets (url, path, filename, size, mime_type, storage_type, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [asset.url, asset.path, asset.filename, asset.size || 0, asset.mime_type || '', asset.storage_type, -Date.now(), now],
      )
      return result.lastInsertId
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
