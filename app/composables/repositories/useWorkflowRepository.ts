import type { Workflow, WorkflowSchema, WorkflowType } from '~/types/workflow'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'

export function useWorkflowRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createWorkflow = (name: string, description: string, steps: any[], schemaId?: number, type: WorkflowType = 'user') =>
    runAsync(async () => {
      const result = await execute(
        'INSERT INTO workflows (name, description, steps, schema_id, type) VALUES (?, ?, ?, ?, ?)',
        [name, description, JSON.stringify(steps), schemaId || null, type],
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

  // 获取用户工作流列表（排除系统工作流）
  const getAllWorkflows = () =>
    runAsync(async () => {
      // 只查询非系统工作流（type 不以 'system:' 开头）
      const query = `
        SELECT w.*, s.name as schema_name, s.fields as schema_fields
        FROM workflows w
        LEFT JOIN workflow_schemas s ON w.schema_id = s.id
        WHERE w.type IS NULL OR w.type = 'user' OR NOT w.type LIKE 'system:%'
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
          type: row.type || 'user',
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

  // 根据类型获取系统工作流
  const getSystemWorkflow = (type: WorkflowType) =>
    runAsync(async () => {
      const workflows = await select<Workflow[]>('SELECT * FROM workflows WHERE type = ?', [type])
      const workflow = workflows[0]

      if (workflow && workflow.schema_id) {
        const schemas = await select<WorkflowSchema[]>('SELECT * FROM workflow_schemas WHERE id = ?', [workflow.schema_id])
        if (schemas[0]) {
          workflow.schema = schemas[0]
        }
      }

      return workflow || null
    }, 'Failed to get system workflow')

  // 创建或更新系统工作流（根据 type 查找，存在则更新，不存在则创建）
  const upsertSystemWorkflow = (type: WorkflowType, name: string, description: string, steps: any[], schemaId?: number) =>
    runAsync(async () => {
      // 先检查是否存在
      const existing = await select<Workflow[]>('SELECT id FROM workflows WHERE type = ?', [type])

      if (existing.length > 0 && existing[0]) {
        // 更新现有的
        await execute(
          'UPDATE workflows SET name = ?, description = ?, steps = ?, schema_id = ?, updated_at = CURRENT_TIMESTAMP WHERE type = ?',
          [name, description, JSON.stringify(steps), schemaId || null, type],
        )
        return existing[0].id
      }

      // 创建新的
      const result = await execute(
        'INSERT INTO workflows (name, description, steps, schema_id, type) VALUES (?, ?, ?, ?, ?)',
        [name, description, JSON.stringify(steps), schemaId || null, type],
      )
      return result.lastInsertId as number
    }, 'Failed to upsert system workflow')

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
    getSystemWorkflow,
    upsertSystemWorkflow,
    updateWorkflow,
    deleteWorkflow,
  }
}
