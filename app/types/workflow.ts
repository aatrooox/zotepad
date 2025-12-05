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

// 系统工作流类型常量
export const WORKFLOW_TYPES = {
  USER: 'user', // 用户创建的普通工作流
  SYSTEM_WX_DRAFT: 'system:wx:draft', // 微信草稿箱工作流
} as const

export type WorkflowType = typeof WORKFLOW_TYPES[keyof typeof WORKFLOW_TYPES] | string

export interface Workflow {
  id: number
  name: string
  description?: string
  steps: string // JSON string of WorkflowStep[]
  schema_id?: number
  type?: WorkflowType // 工作流类型，system:* 开头的为系统内置流程
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
