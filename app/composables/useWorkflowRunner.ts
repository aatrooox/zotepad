import type { ExecutionLog, WorkflowSchemaField, WorkflowStep } from '~/types/workflow'
import { debug, info, error as logError } from '@tauri-apps/plugin-log'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'
import { useTauriHTTP } from '~/composables/useTauriHTTP'
import { encryptObjectForServer } from '~/lib/clientCrypto'

// 需要加密请求体的 API URL
const ENCRYPTED_API_URLS = [
  'https://zzao.club/api/v1/wx/cgi-bin/token',
]

export interface WorkflowContext {
  title: string
  content: string
  html: string
  tags: string[]
  [key: string]: any
}

export function useWorkflowRunner() {
  const { request, error: httpError } = useTauriHTTP()
  const { getEnvObject } = useEnvironmentRepository()

  // function validateContext(schema: WorkflowSchemaField[], ctx: WorkflowContext) {
  //   const missingFields: string[] = []
  //   const invalidFields: string[] = []

  //   for (const field of schema) {
  //     const value = ctx[field.key]

  //     // Check required
  //     if (field.required && (value === undefined || value === null || value === '')) {
  //       missingFields.push(field.key)
  //       continue
  //     }

  //     // Check type (if value exists)
  //     if (value !== undefined && value !== null) {
  //       if (field.type === 'json') {
  //         if (typeof value !== 'object') {
  //           invalidFields.push(`${field.key} (expected json/object, got ${typeof value})`)
  //         }
  //       }
  //       else if (typeof value !== field.type) {
  //         // Allow number to string conversion implicitly in many cases, but strict check here?
  //         // Let's be strict for now, or allow string->number if it parses?
  //         // For simplicity, strict JS typeof check
  //         invalidFields.push(`${field.key} (expected ${field.type}, got ${typeof value})`)
  //       }
  //     }
  //   }

  //   if (missingFields.length > 0 || invalidFields.length > 0) {
  //     const errorParts = []
  //     if (missingFields.length > 0)
  //       errorParts.push(`Missing required fields: ${missingFields.join(', ')}`)
  //     if (invalidFields.length > 0)
  //       errorParts.push(`Invalid field types: ${invalidFields.join(', ')}`)
  //     throw new Error(`Context validation failed: ${errorParts.join('; ')}`)
  //   }
  // }

  async function executeStep(step: WorkflowStep, ctx: WorkflowContext): Promise<any> {
    await debug(`[Workflow] Executing step: ${step.name} (${step.type})`)

    if (step.type === 'api') {
      return executeApiStep(step, ctx)
    }
    else if (step.type === 'javascript') {
      return executeScriptStep(step, ctx)
    }
    else {
      const errorMsg = `Unsupported step type: ${step.type}`
      await logError(`[Workflow] ${errorMsg}`)
      throw new Error(errorMsg)
    }
  }

  async function executeApiStep(step: WorkflowStep, ctx: WorkflowContext) {
    if (!step.url) {
      await logError('[Workflow] API URL is required')
      throw new Error('API URL is required')
    }

    // Helper to resolve a value from context
    const resolveValue = (key: string): any => {
      const keys = key.split('.')
      let val: any = ctx
      for (const k of keys) {
        if (val === undefined || val === null)
          break
        val = val[k]
      }
      // console.log(`[Workflow] Resolved value for key "${key}":`, val)
      return val
    }

    // Helper to replace variables in a string
    const replaceString = (str: string) => {
      return str.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
        const val = resolveValue(key)

        // If value is undefined (filtered out by schema), return empty string
        if (val === undefined)
          return ''
        if (typeof val === 'object')
          return JSON.stringify(val)
        return String(val)
      })
    }

    const method = (step.method || 'GET').toUpperCase()
    const url = replaceString(step.url)
    await info(`[Workflow] API Request: ${method} ${url}`)

    // Clone headers to avoid mutating the original step object
    const headers: Record<string, string> = { ...(step.headers || {}) }
    for (const key in headers) {
      headers[key] = replaceString(headers[key] ?? '')
    }

    let body = step.body
    // GET and HEAD requests cannot have a body
    if (method === 'GET' || method === 'HEAD') {
      body = undefined
    }
    else if (body) {
      // Smart JSON handling
      try {
        // Try to parse body as JSON
        const jsonBody = JSON.parse(body)

        // Recursive function to replace variables in object values
        const processObject = (obj: any): any => {
          if (typeof obj === 'string') {
            // Check for exact match {{key}} to preserve types (arrays, objects, numbers)
            const exactMatch = obj.match(/^\{\{([\w.]+)\}\}$/)
            if (exactMatch && exactMatch[1]) {
              const val = resolveValue(exactMatch[1])
              // If val is undefined, we might want to return null or keep the template?
              // For now, let's return null if undefined to avoid breaking JSON structure with undefined
              return val === undefined ? null : val
            }
            return replaceString(obj)
          }
          if (Array.isArray(obj)) {
            return obj.map(item => processObject(item))
          }
          if (typeof obj === 'object' && obj !== null) {
            const newObj: any = {}
            for (const key in obj) {
              newObj[key] = processObject(obj[key])
            }
            return newObj
          }
          return obj
        }

        const processedBody = processObject(jsonBody)
        body = JSON.stringify(processedBody)
      }
      catch {
        // If not JSON, fall back to simple string replacement
        // This might break if content has quotes, but it's the best we can do for non-JSON
        body = replaceString(body)
      }

      await debug(`[Workflow] API Body: ${body.substring(0, 200)}${body.length > 200 ? '...' : ''}`)
    }

    // 检查是否需要加密请求体
    if (body && ENCRYPTED_API_URLS.some(apiUrl => url.startsWith(apiUrl))) {
      await info(`[Workflow] Encrypting request body for secure API`)
      try {
        const bodyObj = JSON.parse(body)
        // 从 runtimeConfig 获取项目级别的加密密钥
        const config = useRuntimeConfig()
        const secretKey = config.public.cryptoSecretKey
        if (!secretKey) {
          throw new Error('Crypto secret key is not configured')
        }
        const encrypted = await encryptObjectForServer(bodyObj, secretKey)
        body = JSON.stringify({ encrypted })
        await debug(`[Workflow] Body encrypted successfully`)
      }
      catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        await logError(`[Workflow] Failed to encrypt body: ${errMsg}`)
        throw new Error(`Failed to encrypt request body: ${errMsg}`)
      }
    }

    const response = await request(url, {
      method,
      headers,
      body,
    })

    if (!response) {
      const errMsg = httpError.value?.message || 'No response received'
      await logError(`[Workflow] API request failed: ${errMsg}`)
      throw new Error(`API request failed: ${errMsg}`)
    }

    if (!response.ok) {
      const errorData = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data)
      await logError(`[Workflow] API request failed with status ${response.status}. Response: ${errorData}`)
      throw new Error(`API request failed with status ${response.status}: ${errorData}`)
    }

    await info(`[Workflow] API Response: Success (${response.status})`)
    return response.data
  }

  async function executeScriptStep(step: WorkflowStep, ctx: WorkflowContext) {
    if (!step.script)
      return null

    await debug(`[Workflow] Executing JavaScript: ${step.script.substring(0, 100)}${step.script.length > 100 ? '...' : ''}`)

    // Create a safe-ish execution environment
    // We pass 'ctx' and expect the script to return a new context or modified data
    // The script body should be like: "return { ...ctx, newField: 'value' }"
    // or just return some data.

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('ctx', step.script)
      const result = fn(ctx)
      await info('[Workflow] JavaScript executed successfully')
      return result
    }
    catch (e: any) {
      const errorMsg = `Script execution failed: ${e.message}`
      await logError(`[Workflow] ${errorMsg}`)
      throw new Error(errorMsg)
    }
  }

  const runWorkflow = async (steps: WorkflowStep[], initialCtx: WorkflowContext, _schema?: WorkflowSchemaField[]) => {
    await info(`[Workflow] Starting workflow with ${steps.length} step(s)`)

    // Use full context by default, ignoring schema filtering for flexibility
    let currentCtx = { ...initialCtx }

    // Alias images to photos for compatibility
    if (currentCtx.images && !currentCtx.photos) {
      currentCtx.photos = currentCtx.images
    }

    // Inject System Variables & Environment Variables
    // These are trusted sources
    try {
      const envs = await getEnvObject()
      const systemCtx = {
        timestamp: Date.now(),
        date: new Date().toISOString(),
        locale_date: new Date().toLocaleString(),
        platform: 'desktop', // Could use Tauri API to get OS
      }

      currentCtx = {
        ...currentCtx,
        env: envs,
        system: systemCtx,
      }
      await debug('[Workflow] System and Environment variables injected')
    }
    catch (e: any) {
      await logError(`[Workflow] Failed to inject system/env variables: ${e.message}`)
    }

    const logs: ExecutionLog[] = []

    for (const step of steps) {
      const startTime = Date.now()
      const log: ExecutionLog = {
        stepId: step.id,
        stepName: step.name,
        status: 'success',
        duration: 0,
        startTime,
        endTime: 0,
      }

      try {
        const output = await executeStep(step, currentCtx)
        log.output = output

        // If output is an object, merge it into context
        if (typeof output === 'object' && output !== null) {
          currentCtx = { ...currentCtx, ...output }
        }

        await info(`[Workflow] Step "${step.name}" completed successfully`)
      }
      catch (e: any) {
        log.status = 'error'
        log.error = e.message
        log.endTime = Date.now()
        log.duration = log.endTime - startTime
        logs.push(log)

        await logError(`[Workflow] Step "${step.name}" failed: ${e.message}`)
        throw e // Stop execution on error
      }

      log.endTime = Date.now()
      log.duration = log.endTime - startTime
      logs.push(log)
    }

    await info(`[Workflow] Workflow completed successfully`)
    return { logs, finalCtx: currentCtx }
  }

  return {
    runWorkflow,
  }
}
