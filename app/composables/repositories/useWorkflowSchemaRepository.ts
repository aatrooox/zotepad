import type { WorkflowSchema } from '~/types/workflow'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export function useWorkflowSchemaRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createSchema = (name: string, description: string, fields: any[]) =>
    runAsync(async () => {
      const result = await execute(
        'INSERT INTO workflow_schemas (name, description, fields) VALUES (?, ?, ?)',
        [name, description, JSON.stringify(fields)],
      )
      return result.lastInsertId as number
    }, 'Failed to create workflow schema')

  const getSchema = (id: number) =>
    runAsync(async () => {
      const result = await select<WorkflowSchema[]>('SELECT * FROM workflow_schemas WHERE id = ?', [id])
      return result[0] || null
    }, 'Failed to get workflow schema')

  const getAllSchemas = () =>
    runAsync(() => select<WorkflowSchema[]>('SELECT * FROM workflow_schemas ORDER BY updated_at DESC'), 'Failed to list workflow schemas')

  const updateSchema = (id: number, name: string, description: string, fields: any[]) =>
    runAsync(() => execute(
      'UPDATE workflow_schemas SET name = ?, description = ?, fields = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, description, JSON.stringify(fields), id],
    ), 'Failed to update workflow schema')

  const deleteSchema = (id: number) =>
    runAsync(async () => {
      // Check if used by any workflow
      const used = await select<any[]>('SELECT id FROM workflows WHERE schema_id = ?', [id])
      if (used.length > 0) {
        throw new Error('Cannot delete schema because it is used by one or more workflows')
      }
      return execute('DELETE FROM workflow_schemas WHERE id = ?', [id])
    }, 'Failed to delete workflow schema')

  return {
    isLoading,
    error,
    createSchema,
    getSchema,
    getAllSchemas,
    updateSchema,
    deleteSchema,
  }
}
