import type { Workflow } from '~/types/workflow'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export function useWorkflowRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createWorkflow = (name: string, description: string, steps: any[]) =>
    runAsync(async () => {
      const result = await execute(
        'INSERT INTO workflows (name, description, steps) VALUES (?, ?, ?)',
        [name, description, JSON.stringify(steps)],
      )
      return result.lastInsertId as number
    }, 'Failed to create workflow')

  const getWorkflow = (id: number) =>
    runAsync(async () => {
      const result = await select<Workflow[]>('SELECT * FROM workflows WHERE id = ?', [id])
      return result[0] || null
    }, 'Failed to get workflow')

  const getAllWorkflows = () =>
    runAsync(() => select<Workflow[]>('SELECT * FROM workflows ORDER BY updated_at DESC'), 'Failed to list workflows')

  const updateWorkflow = (id: number, name: string, description: string, steps: any[]) =>
    runAsync(() => execute(
      'UPDATE workflows SET name = ?, description = ?, steps = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, description, JSON.stringify(steps), id],
    ), 'Failed to update workflow')

  const deleteWorkflow = (id: number) =>
    runAsync(() => execute('DELETE FROM workflows WHERE id = ?', [id]), 'Failed to delete workflow')

  return {
    isLoading,
    error,
    createWorkflow,
    getWorkflow,
    getAllWorkflows,
    updateWorkflow,
    deleteWorkflow,
  }
}
