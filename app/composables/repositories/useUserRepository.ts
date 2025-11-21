import type { User } from '~/types/models'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export function useUserRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createUser = (name: string, email: string) =>
    runAsync(async () => {
      const result = await execute(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        [name, email],
      )
      return result.lastInsertId as number
    }, '创建用户失败')

  const getUser = (id: number) =>
    runAsync(async () => {
      const result = await select<User[]>('SELECT * FROM users WHERE id = ?', [id])
      return result[0] || null
    }, '获取用户失败')

  const getAllUsers = () =>
    runAsync(() => select<User[]>('SELECT * FROM users ORDER BY created_at DESC'), '获取用户列表失败')

  const updateUser = (id: number, name: string, email: string) =>
    runAsync(() => execute('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, id]), '更新用户失败')

  const deleteUser = (id: number) =>
    runAsync(() => execute('DELETE FROM users WHERE id = ?', [id]), '删除用户失败')

  return {
    isLoading,
    error,
    createUser,
    getUser,
    getAllUsers,
    updateUser,
    deleteUser,
  }
}
