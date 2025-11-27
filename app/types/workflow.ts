export type StepType = 'api' | 'javascript' | 'shell'

export interface WorkflowSchemaField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'json'
  required: boolean
  description?: string
}

export interface WorkflowStep {
  id: string
  name: string
  type: StepType
  // API 相关配置
  url?: string
  method?: string
  headers?: Record<string, string>
  body?: string // 支持模板变量 {{title}}
  // 脚本相关配置
  script?: string // JS 代码或 Shell 命令
  // 通用
  timeout?: number
}

export interface WorkflowSchema {
  id: number
  name: string
  description?: string
  fields: string // JSON string of WorkflowSchemaField[]
  created_at?: string
  updated_at?: string
}

export interface Workflow {
  id: number
  name: string
  description?: string
  steps: string // JSON string of WorkflowStep[]
  schema_id?: number
  // 运行时关联查询出来的完整 Schema 对象
  schema?: WorkflowSchema
  created_at?: string
  updated_at?: string
}

export interface ExecutionLog {
  stepId: string
  stepName: string
  status: 'success' | 'error' | 'skipped'
  duration: number
  output?: any
  error?: string
  startTime: number
  endTime: number
}
