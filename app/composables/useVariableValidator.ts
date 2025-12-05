import type { WorkflowStep } from '~/types/workflow'

/**
 * 从文本中提取所有 {{xxx}} 格式的变量
 */
export function extractVariables(text: string): string[] {
  if (!text) {
    return []
  }
  const regex = /\{\{([^}]+)\}\}/g
  const matches: string[] = []
  const results = Array.from(text.matchAll(regex))
  for (const match of results) {
    const varName = match[1]
    if (varName) {
      matches.push(varName.trim())
    }
  }
  return [...new Set(matches)] // 去重
}

/**
 * 从工作流步骤中提取所有使用的变量
 */
export function extractStepVariables(step: WorkflowStep): string[] {
  const variables: string[] = []

  // 从 URL 提取
  if (step.url) {
    variables.push(...extractVariables(step.url))
  }

  // 从 Body 提取
  if (step.body) {
    variables.push(...extractVariables(step.body))
  }

  // 从 Headers 提取
  if (step.headers) {
    Object.values(step.headers).forEach((value) => {
      variables.push(...extractVariables(value))
    })
  }

  // 从 Script 提取（虽然脚本里可能用不同方式访问变量，但也检测一下）
  if (step.script) {
    variables.push(...extractVariables(step.script))
  }

  return [...new Set(variables)]
}

/**
 * 从工作流所有步骤中提取所有使用的变量
 */
export function extractWorkflowVariables(steps: WorkflowStep[]): string[] {
  const variables: string[] = []
  steps.forEach((step) => {
    variables.push(...extractStepVariables(step))
  })
  return [...new Set(variables)]
}

/**
 * 系统内置变量列表
 */
export const SYSTEM_VARIABLES = [
  'title',
  'content',
  'html',
  'tags',
  'photos',
  'noteId',
  'system.timestamp',
  'system.date',
  'system.locale_date',
]

/**
 * 验证变量可用性
 * @param variables 使用的变量列表
 * @param envKeys 已配置的环境变量 key 列表
 * @returns 缺失的变量列表
 */
export function validateVariables(variables: string[], envKeys: string[]): string[] {
  const missing: string[] = []

  variables.forEach((variable) => {
    // 环境变量格式: env.XXX
    if (variable.startsWith('env.')) {
      const envKey = variable.slice(4) // 去掉 'env.' 前缀
      if (!envKeys.includes(envKey)) {
        missing.push(variable)
      }
    }
    // 系统变量
    else if (!SYSTEM_VARIABLES.includes(variable)) {
      // 既不是系统变量，也不是 env. 开头，可能是用户写错了
      missing.push(variable)
    }
  })

  return missing
}

/**
 * 组合式函数：变量验证器
 */
export function useVariableValidator() {
  return {
    extractVariables,
    extractStepVariables,
    extractWorkflowVariables,
    validateVariables,
    SYSTEM_VARIABLES,
  }
}
