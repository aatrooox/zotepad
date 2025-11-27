import type { Workflow, WorkflowSchema } from '~/types/workflow'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export function useWorkflowRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createWorkflow = (name: string, description: string, steps: any[], schemaId?: number) =>
    runAsync(async () => {
      const result = await execute(
        'INSERT INTO workflows (name, description, steps, schema_id) VALUES (?, ?, ?, ?)',
        [name, description, JSON.stringify(steps), schemaId || null],
      )
      return result.lastInsertId as number
    }, 'Failed to create workflow')

  const getWorkflow = (id: number) =>
    runAsync(async () => {
      // Fetch workflow
      const workflows = await select<Workflow[]>('SELECT * FROM workflows WHERE id = ?', [id])
      const workflow = workflows[0]

      if (workflow && workflow.schema_id) {
        // Fetch associated schema
        const schemas = await select<WorkflowSchema[]>('SELECT * FROM workflow_schemas WHERE id = ?', [workflow.schema_id])
        if (schemas[0]) {
          workflow.schema = schemas[0]
        }
      }

      return workflow || null
    }, 'Failed to get workflow')

  const getAllWorkflows = () =>
    runAsync(async () => {
      // Simple fetch, maybe join later if needed for list view
      // For now, let's do a LEFT JOIN to get schema name if possible, or just fetch workflows
      // SQLite JSON support is limited for object construction in older versions, so let's keep it simple
      // or do a manual join in JS if list is small.

      // Let's try a SQL JOIN to get schema data directly if we want to display schema name in list
      const query = `
        SELECT w.*, s.name as schema_name, s.fields as schema_fields
        FROM workflows w
        LEFT JOIN workflow_schemas s ON w.schema_id = s.id
        ORDER BY w.updated_at DESC
      `
      const results = await select<any[]>(query)

      // Map results to structure
      return results.map((row) => {
        const wf: Workflow = {
          id: row.id,
          name: row.name,
          description: row.description,
          steps: row.steps,
          schema_id: row.schema_id,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }
        if (row.schema_id) {
          wf.schema = {
            id: row.schema_id,
            name: row.schema_name,
            fields: row.schema_fields,
          }
        }
        return wf
      })
    }, 'Failed to list workflows')

  const updateWorkflow = (id: number, name: string, description: string, steps: any[], schemaId?: number) =>
    runAsync(() => execute(
      'UPDATE workflows SET name = ?, description = ?, steps = ?, schema_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, description, JSON.stringify(steps), schemaId || null, id],
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
