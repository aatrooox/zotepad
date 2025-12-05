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
 * @returns 缺失的变量列表（仅返回需要用户配置的环境变量）
 */
export function validateVariables(variables: string[], envKeys: string[]): string[] {
  const missing: string[] = []

  variables.forEach((variable) => {
    // 环境变量格式: env.XXX - 需要用户配置
    if (variable.startsWith('env.')) {
      const envKey = variable.slice(4) // 去掉 'env.' 前缀
      if (!envKeys.includes(envKey)) {
        missing.push(variable)
      }
    }
    // 步骤输出变量格式: step1, step1.data.xxx, step2.xxx 等 - 运行时自动产生，忽略
    else if (/^step\d+/.test(variable)) {
      // 忽略，这些是上一步骤的输出，运行时会自动注入
    }
    // 系统变量 - 内置可用
    else if (SYSTEM_VARIABLES.includes(variable)) {
      // 忽略，这些是系统内置变量
    }
    // 其他未知变量 - 可能是用户写错了，但不在这里报错
    // 因为可能是用户自定义的上下文变量
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
