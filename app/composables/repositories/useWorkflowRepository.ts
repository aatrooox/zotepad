import type { Workflow, WorkflowSchema, WorkflowType } from '~/types/workflow'
import { useAsyncState } from '~/utils/async'
import { useTauriSQL } from '../useTauriSQL'
import { generateUUID } from '~/utils/uuid'

export function useWorkflowRepository() {
  const { execute, select } = useTauriSQL()
  const { isLoading, error, runAsync } = useAsyncState()

  const createWorkflow = (name: string, description: string, steps: any[], schemaId?: number, type: WorkflowType = 'user') =>
    runAsync(async () => {
      const now = new Date().toISOString()
      const uuid = generateUUID()
      const result = await execute(
        'INSERT INTO workflows (uuid, name, description, steps, schema_id, type, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid, name, description, JSON.stringify(steps), schemaId || null, type, -Date.now(), now],
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
        WHERE (w.type IS NULL OR w.type = 'user' OR NOT w.type LIKE 'system:%')
          AND w.deleted_at IS NULL
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

  // 获取全部工作流（包含系统工作流）
  const getAllWorkflowsWithSystem = () =>
    runAsync(async () => {
      const query = `
        SELECT w.*, s.name as schema_name, s.fields as schema_fields
        FROM workflows w
        LEFT JOIN workflow_schemas s ON w.schema_id = s.id
        WHERE w.deleted_at IS NULL
        ORDER BY w.updated_at DESC
      `
      const results = await select<any[]>(query)
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
    }, 'Failed to list all workflows')

  // 根据类型获取系统工作流
  const getSystemWorkflow = (type: WorkflowType) =>
    runAsync(async () => {
      const workflows = await select<Workflow[]>('SELECT * FROM workflows WHERE type = ? AND deleted_at IS NULL', [type])
      const workflow = workflows[0]

      if (workflow && workflow.schema_id) {
        const schemas = await select<WorkflowSchema[]>('SELECT * FROM workflow_schemas WHERE id = ?', [workflow.schema_id])
        if (schemas[0]) {
          workflow.schema = schemas[0]
        }
      }

      return workflow || null
    }, 'Failed to get system workflow')

  // 创建或更新系统工作流(根据 type 查找,存在则更新,不存在则创建)
  const upsertSystemWorkflow = (type: WorkflowType, name: string, description: string, steps: any[], schemaId?: number) =>
    runAsync(async () => {
      const now = new Date().toISOString()
      // 先检查是否存在(包括已删除的)
      const existing = await select<Workflow[]>('SELECT id, deleted_at FROM workflows WHERE type = ?', [type])

      if (existing.length > 0 && existing[0]) {
        // 如果有多个重复的,先永久删除多余的(保留第一个)
        if (existing.length > 1) {
          const idsToDelete = existing.slice(1).map(w => w.id)
          console.log(`[Workflow] 删除 ${idsToDelete.length} 个重复的系统流 (type: ${type})`)
          await execute(
            `DELETE FROM workflows WHERE id IN (${idsToDelete.map(() => '?').join(',')})`,
            idsToDelete,
          )
        }

        // 更新第一个(如果是已删除的则恢复)
        // 确保 steps 被正确更新
        const updateResult = await execute(
          'UPDATE workflows SET name = ?, description = ?, steps = ?, schema_id = ?, updated_at = ?, version = ?, deleted_at = NULL WHERE id = ?',
          [name, description, JSON.stringify(steps), schemaId || null, now, -Date.now(), existing[0].id],
        )
        console.log(`[Workflow] Upsert updated workflow ${existing[0].id}, rows affected: ${updateResult.rowsAffected}`)
        return existing[0].id
      }

      // 创建新的
      const uuid = generateUUID()
      const result = await execute(
        'INSERT INTO workflows (uuid, name, description, steps, schema_id, type, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid, name, description, JSON.stringify(steps), schemaId || null, type, -Date.now(), now],
      )
      return result.lastInsertId as number
    }, 'Failed to upsert system workflow')

  const updateWorkflow = (id: number, name: string, description: string, steps: any[], schemaId?: number) =>
    runAsync(async () => {
      const now = new Date().toISOString()
      await execute(
        'UPDATE workflows SET name = ?, description = ?, steps = ?, schema_id = ?, updated_at = ?, version = ? WHERE id = ?',
        [name, description, JSON.stringify(steps), schemaId || null, now, -Date.now(), id],
      )
      return { versionChanged: true, newVersion: -Date.now() }
    }, 'Failed to update workflow')

  const deleteWorkflow = (id: number) =>
    runAsync(() => execute(
      'UPDATE workflows SET deleted_at = ?, updated_at = ?, version = ? WHERE id = ?',
      [new Date().toISOString(), new Date().toISOString(), -Date.now(), id],
    ), 'Failed to delete workflow')

  // 删除所有相同 type 的工作流（用于清理多端同步导致的重复系统流）
  const deleteWorkflowsByType = (type: WorkflowType) =>
    runAsync(async () => {
      const now = new Date().toISOString()
      const result = await execute(
        'UPDATE workflows SET deleted_at = ?, updated_at = ?, version = ? WHERE type = ? AND deleted_at IS NULL',
        [now, now, -Date.now(), type],
      )
      return result.rowsAffected || 0
    }, 'Failed to delete workflows by type')

  return {
    isLoading,
    error,
    createWorkflow,
    getWorkflow,
    getAllWorkflows,
    getAllWorkflowsWithSystem,
    getSystemWorkflow,
    upsertSystemWorkflow,
    updateWorkflow,
    deleteWorkflow,
    deleteWorkflowsByType,
  }
}
