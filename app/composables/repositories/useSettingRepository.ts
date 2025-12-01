import type { AppSetting } from '~/types/models'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export function useSettingRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const setSetting = (key: string, value: string, category: string = 'general') =>
    runAsync(() => execute(
      'INSERT OR REPLACE INTO settings (key, value, category, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [key, value, category],
    ), '保存设置失败')

  const getSetting = (key: string) =>
    runAsync(async () => {
      const result = await select<AppSetting[]>('SELECT value FROM settings WHERE key = ?', [key])
      return result[0]?.value || null
    }, '获取设置失败')

  const getAllSettings = () =>
    runAsync(async () => {
      const result = await select<AppSetting[]>('SELECT key, value FROM settings')
      return result.reduce((acc: Record<string, string>, row) => {
        acc[row.key] = row.value
        return acc
      }, {})
    }, '获取设置列表失败')

  const getSettingsByCategory = (category: string) =>
    runAsync(async () => {
      const result = await select<AppSetting[]>('SELECT key, value FROM settings WHERE category = ?', [category])
      return result.reduce((acc: Record<string, string>, row) => {
        acc[row.key] = row.value
        return acc
      }, {})
    }, '获取分类设置失败')

  const deleteSetting = (key: string) =>
    runAsync(() => execute('DELETE FROM settings WHERE key = ?', [key]), '删除设置失败')

  return {
    isLoading,
    error,
    setSetting,
    getSetting,
    getAllSettings,
    getSettingsByCategory,
    deleteSetting,
  }
}
