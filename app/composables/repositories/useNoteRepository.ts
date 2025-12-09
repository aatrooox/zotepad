import type { Note } from '~/types/models'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export function useNoteRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createNote = (title: string, content: string, tags: string[] = []) =>
    runAsync(async () => {
      const result = await execute(
        'INSERT INTO notes (title, content, tags) VALUES (?, ?, ?)',
        [title, content, JSON.stringify(tags)],
      )
      return result.lastInsertId as number
    }, '创建笔记失败')

  const getNote = (id: number) =>
    runAsync(async () => {
      const result = await select<Note[]>('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL', [id])
      return result[0] || null
    }, '获取笔记失败')

  const getAllNotes = () =>
    runAsync(() => select<Note[]>('SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC'), '获取笔记列表失败')

  const updateNote = (id: number, title: string, content: string, tags: string[] = []) =>
    runAsync(() => execute(
      'UPDATE notes SET title = ?, content = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [title, content, JSON.stringify(tags), id],
    ), '更新笔记失败')

  const deleteNote = (id: number) =>
    runAsync(() => execute('UPDATE notes SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]), '删除笔记失败')

  // 获取最新的一条笔记，用于自动加载
  const getLatestNote = () =>
    runAsync(async () => {
      const result = await select<Note[]>('SELECT * FROM notes ORDER BY updated_at DESC LIMIT 1')
      return result[0] || null
    }, '获取最新笔记失败')

  return {
    isLoading,
    error,
    createNote,
    getNote,
    getAllNotes,
    updateNote,
    deleteNote,
    getLatestNote,
  }
}
