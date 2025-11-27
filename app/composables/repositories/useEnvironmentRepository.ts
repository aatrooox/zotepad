import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export interface WorkflowEnv {
  id: number
  key: string
  value: string
  created_at?: string
  updated_at?: string
}

export function useEnvironmentRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createEnv = (key: string, value: string) =>
    runAsync(async () => {
      const result = await execute(
        'INSERT INTO workflow_envs (key, value) VALUES (?, ?)',
        [key, value],
      )
      return result.lastInsertId as number
    }, 'Failed to create environment variable')

  const getAllEnvs = () =>
    runAsync(async () => {
      return await select<WorkflowEnv[]>('SELECT * FROM workflow_envs ORDER BY key ASC')
    }, 'Failed to list environment variables')

  const updateEnv = (id: number, key: string, value: string) =>
    runAsync(() => execute(
      'UPDATE workflow_envs SET key = ?, value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [key, value, id],
    ), 'Failed to update environment variable')

  const deleteEnv = (id: number) =>
    runAsync(() => execute('DELETE FROM workflow_envs WHERE id = ?', [id]), 'Failed to delete environment variable')

  // Helper to get all envs as a key-value object for the runner
  const getEnvObject = async () => {
    const envs = await select<WorkflowEnv[]>('SELECT key, value FROM workflow_envs')
    const envObj: Record<string, string> = {}
    for (const env of envs) {
      envObj[env.key] = env.value
    }
    return envObj
  }

  return {
    isLoading,
    error,
    createEnv,
    getAllEnvs,
    updateEnv,
    deleteEnv,
    getEnvObject,
  }
}
