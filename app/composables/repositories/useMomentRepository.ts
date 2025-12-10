import type { Moment } from '~/types/models'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export function useMomentRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createMoment = (content: string, images: string[] = [], tags: string[] = []) =>
    runAsync(async () => {
      const now = new Date().toISOString()
      const result = await execute(
        'INSERT INTO moments (content, images, tags, version, updated_at) VALUES (?, ?, ?, ?, ?)',
        [content, JSON.stringify(images), JSON.stringify(tags), -Date.now(), now],
      )
      return result.lastInsertId as number
    }, '发布动态失败')

  const getMoment = (id: number) =>
    runAsync(async () => {
      const result = await select<Moment[]>('SELECT * FROM moments WHERE id = ?', [id])
      return result[0] || null
    }, '获取动态失败')

  const getAllMoments = () =>
    runAsync(() => select<Moment[]>(
      'SELECT * FROM moments WHERE deleted_at IS NULL ORDER BY created_at DESC',
    ), '获取动态列表失败')

  const updateMoment = (id: number, content: string, images: string[] = [], tags: string[] = []) =>
    runAsync(async () => {
      // 检查内容是否真的变化
      const before = await select<Array<{ version: number, content: string, images: string, tags: string }>>(
        'SELECT version, content, images, tags FROM moments WHERE id = ?',
        [id],
      )

      if (before[0]) {
        const oldImages = before[0].images || '[]'
        const oldTags = before[0].tags || '[]'
        const newImages = JSON.stringify(images)
        const newTags = JSON.stringify(tags)
        if (before[0].content === content && oldImages === newImages && oldTags === newTags) {
          console.log(`[MomentRepo] 内容未变化,跳过更新: ${id}`)
          return { versionChanged: false, newVersion: before[0].version }
        }
      }

      const now = new Date().toISOString()
      await execute(
        'UPDATE moments SET content = ?, images = ?, tags = ?, updated_at = ?, version = ? WHERE id = ?',
        [content, JSON.stringify(images), JSON.stringify(tags), now, -Date.now(), id],
      )

      return { versionChanged: true, newVersion: -Date.now() }
    }, '更新动态失败')

  const deleteMoment = (id: number) =>
    runAsync(() => execute(
      'UPDATE moments SET deleted_at = ?, updated_at = ?, version = ? WHERE id = ?',
      [new Date().toISOString(), new Date().toISOString(), -Date.now(), id],
    ), '删除动态失败')

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
