import type { Moment } from '~/types/models'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export function useMomentRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createMoment = (content: string, images: string[] = [], tags: string[] = []) =>
    runAsync(async () => {
      const result = await execute(
        'INSERT INTO moments (content, images, tags) VALUES (?, ?, ?)',
        [content, JSON.stringify(images), JSON.stringify(tags)],
      )
      return result.lastInsertId as number
    }, '发布动态失败')

  const getMoment = (id: number) =>
    runAsync(async () => {
      const result = await select<Moment[]>('SELECT * FROM moments WHERE id = ?', [id])
      return result[0] || null
    }, '获取动态失败')

  const getAllMoments = () =>
    runAsync(() => select<Moment[]>('SELECT * FROM moments ORDER BY created_at DESC'), '获取动态列表失败')

  const updateMoment = (id: number, content: string, images: string[] = [], tags: string[] = []) =>
    runAsync(() => execute(
      'UPDATE moments SET content = ?, images = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [content, JSON.stringify(images), JSON.stringify(tags), id],
    ), '更新动态失败')

  const deleteMoment = (id: number) =>
    runAsync(() => execute('DELETE FROM moments WHERE id = ?', [id]), '删除动态失败')

  return {
    isLoading,
    error,
    createMoment,
    getMoment,
    getAllMoments,
    updateMoment,
    deleteMoment,
  }
}
