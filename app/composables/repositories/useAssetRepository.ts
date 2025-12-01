import type { Asset } from '~/types/models'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export function useAssetRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createAsset = (asset: Omit<Asset, 'id' | 'created_at'>) =>
    runAsync(async () => {
      const result = await execute(
        'INSERT INTO assets (url, path, filename, size, mime_type, storage_type) VALUES (?, ?, ?, ?, ?, ?)',
        [asset.url, asset.path, asset.filename, asset.size || 0, asset.mime_type || '', asset.storage_type],
      )
      return result.lastInsertId
    }, '创建资源记录失败')

  const getAllAssets = () =>
    runAsync(() => select<Asset[]>('SELECT * FROM assets ORDER BY created_at DESC'), '获取资源列表失败')

  const deleteAsset = (id: number) =>
    runAsync(() => execute('DELETE FROM assets WHERE id = ?', [id]), '删除资源失败')

  return {
    isLoading,
    error,
    createAsset,
    getAllAssets,
    deleteAsset,
  }
}
