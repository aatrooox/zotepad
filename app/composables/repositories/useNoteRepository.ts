import type { Note } from '~/types/models'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export function useNoteRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createNote = (title: string, content: string, tags: string[] = []) =>
    runAsync(async () => {
      const result = await execute(
        'INSERT INTO notes (title, content, tags, version) VALUES (?, ?, ?, ?)',
        [title, content, JSON.stringify(tags), -Date.now()],
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
    runAsync(async () => {
      // 先查询当前版本号和内容
      const before = await select<Array<{ version: number, title: string, content: string, tags: string }>>(
        'SELECT version, title, content, tags FROM notes WHERE id = ?',
        [id],
      )

      await execute(
        // 只有当 title/content/tags 真的改变时才更新 version
        // 使用 CASE WHEN 检查是否有实际变化
        `UPDATE notes
         SET title = ?,
             content = ?,
             tags = ?,
             updated_at = CURRENT_TIMESTAMP,
         version = CASE
               WHEN title != ? OR content != ? OR tags != ?
               THEN ?
               ELSE version
             END
         WHERE id = ?`,
        [title, content, JSON.stringify(tags), title, content, JSON.stringify(tags), -Date.now(), id],
      )

      // 查询更新后的版本号
      const after = await select<Array<{ version: number }>>(
        'SELECT version FROM notes WHERE id = ?',
        [id],
      )

      const versionChanged = before[0] && after[0] && before[0].version !== after[0].version
      if (versionChanged)
        console.log(`[NoteRepo] 版本号已更新: ${before[0]?.version} -> ${after[0]?.version}`)
      else
        console.log(`[NoteRepo] 内容未变化,版本号未更新: ${after[0]?.version}`)

      return { versionChanged, newVersion: after[0]?.version }
    }, '更新笔记失败')

  const deleteNote = (id: number) =>
    runAsync(() => execute('UPDATE notes SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = ? WHERE id = ?', [-Date.now(), id]), '删除笔记失败')

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
