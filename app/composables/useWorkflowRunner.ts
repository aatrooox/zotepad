import type { ExecutionLog, WorkflowStep } from '~/types/workflow'
import { useTauriHTTP } from '~/composables/useTauriHTTP'

export interface WorkflowContext {
  title: string
  content: string
  html: string
  tags: string[]
  [key: string]: any
}

export function useWorkflowRunner() {
  const { request } = useTauriHTTP()

  async function executeStep(step: WorkflowStep, ctx: WorkflowContext): Promise<any> {
    if (step.type === 'api') {
      return executeApiStep(step, ctx)
    }
    else if (step.type === 'javascript') {
      return executeScriptStep(step, ctx)
    }
    else {
      throw new Error(`Unsupported step type: ${step.type}`)
    }
  }

  async function executeApiStep(step: WorkflowStep, ctx: WorkflowContext) {
    if (!step.url)
      throw new Error('API URL is required')

    // Replace variables in URL, Headers, Body
    const replaceVars = (str: string) => {
      return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return ctx[key] !== undefined ? String(ctx[key]) : ''
      })
    }

    const url = replaceVars(step.url)
    const headers = step.headers || {}
    // Replace vars in headers values
    for (const key in headers) {
      headers[key] = replaceVars(headers[key] ?? '')
    }

    let body = step.body
    if (body) {
      // Special handling for JSON body to ensure valid JSON if replacing content
      // Simple replacement might break JSON structure if content has quotes
      // So we recommend users to use JS step to prepare body if complex
      // But for simple cases:
      body = body.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const val = ctx[key]
        // If replacing into a JSON string value, we should escape it?
        // This is tricky. A better approach is to use a JS step to build the body object
        // and pass it to the API step.
        // For now, we do simple string replacement.
        return val !== undefined ? String(val) : ''
      })
    }

    const response = await request(url, {
      method: step.method || 'GET',
      headers,
      body,
    })

    if (!response) {
      throw new Error('API request failed: No response received')
    }

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`)
    }

    return response.data
  }

  async function executeScriptStep(step: WorkflowStep, ctx: WorkflowContext) {
    if (!step.script)
      return null

    // Create a safe-ish execution environment
    // We pass 'ctx' and expect the script to return a new context or modified data
    // The script body should be like: "return { ...ctx, newField: 'value' }"
    // or just return some data.

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('ctx', step.script)
      const result = fn(ctx)
      return result
    }
    catch (e: any) {
      throw new Error(`Script execution failed: ${e.message}`)
    }
  }

  const runWorkflow = async (steps: WorkflowStep[], initialCtx: WorkflowContext) => {
    const logs: ExecutionLog[] = []
    let currentCtx = { ...initialCtx }

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
      }
      catch (e: any) {
        log.status = 'error'
        log.error = e.message
        log.endTime = Date.now()
        log.duration = log.endTime - startTime
        logs.push(log)
        throw e // Stop execution on error
      }

      log.endTime = Date.now()
      log.duration = log.endTime - startTime
      logs.push(log)
    }

    return { logs, finalCtx: currentCtx }
  }

  return {
    runWorkflow,
  }
}
