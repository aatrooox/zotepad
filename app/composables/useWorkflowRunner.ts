import type { ExecutionLog, WorkflowSchemaField, WorkflowStep } from '~/types/workflow'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { debug, info, error as logError } from '@tauri-apps/plugin-log'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'
import { useTauriHTTP } from '~/composables/useTauriHTTP'
import { encryptObjectForServer } from '~/lib/clientCrypto'

// 需要加密请求体的 API URL
const ENCRYPTED_API_URLS = [
  'https://zzao.club/api/v1/wx/cgi-bin/token',
  'http://localhost:4775/api/v1/wx/cgi-bin/token',
]

// 微信素材上传接口 - 需要特殊处理 (FormData + 遍历 photos)
const WX_MATERIAL_UPLOAD_URLS = [
  'https://zzao.club/api/v1/wx/cgi-bin/material/add_material',
  'http://localhost:4775/api/v1/wx/cgi-bin/material/add_material',
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
  const activity = useActivityStatus()

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

    // ============ 微信素材上传特殊处理 ============
    // 检测到素材上传接口时，遍历 photos 数组逐个上传
    if (WX_MATERIAL_UPLOAD_URLS.some(apiUrl => url.startsWith(apiUrl))) {
      await info(`[Workflow] Detected WX material upload API, executing batch upload`)
      return executeWxMaterialUpload(url, headers, ctx)
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
    await info(`[Workflow] API Response Start ==========================`)
    await info(JSON.stringify(response.data, null, 2))
    await info(`[Workflow] API Response EDN ==========================`)
    return response.data
  }

  /**
   * 微信素材上传特殊处理
   * 遍历 photos 数组，将每个图片 URL 下载后转为 FormData 上传到微信
   * 返回 { uploadedMedia: [...], imageUrlMap: { 原始URL: 微信URL } }
   */
  async function executeWxMaterialUpload(
    apiUrl: string,
    headers: Record<string, string>,
    ctx: WorkflowContext,
  ) {
    const photos: string[] = ctx.photos || []
    if (photos.length === 0) {
      await logError('[Workflow] No photos to upload')
      throw new Error('No photos available for upload. Please add at least one image.')
    }

    await info(`[Workflow] Starting WX material upload for ${photos.length} photo(s)`)

    // 获取 access_token (从上一步的输出中获取)
    const accessToken = ctx.step1?.data?.accessToken
    if (!accessToken) {
      await logError('[Workflow] Access token not found in context (step1.data.accessToken)')
      throw new Error('Access token not found. Please ensure step 1 (get token) completed successfully.')
    }

    const uploadedMedia: Array<{
      originalUrl: string
      mediaId: string
      wxUrl: string
      index: number
    }> = []
    const imageUrlMap: Record<string, string> = {}

    for (let i = 0; i < photos.length; i++) {
      const photoUrl = photos[i]
      if (!photoUrl)
        continue

      await info(`[Workflow] Uploading photo ${i + 1}/${photos.length}: ${photoUrl.substring(0, 80)}...`)

      try {
        // 1. 下载远程图片
        await debug(`[Workflow] Downloading image from: ${photoUrl}`)
        const imageResponse = await tauriFetch(photoUrl)
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: HTTP ${imageResponse.status}`)
        }

        const imageBlob = await imageResponse.blob()
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'

        // 从 URL 提取文件名，或使用默认名
        const urlParts = photoUrl.split('/')
        let filename = urlParts[urlParts.length - 1] || `image_${i}.jpg`
        // 移除 query string
        filename = filename.split('?')[0] || filename

        await debug(`[Workflow] Image downloaded: ${imageBlob.size} bytes, type: ${contentType}, name: ${filename}`)

        // 2. 构建 FormData
        const formData = new FormData()
        formData.append('access_token', accessToken)
        formData.append('type', 'image')
        // 创建 File 对象
        const file = new File([imageBlob], filename, { type: contentType })
        formData.append('media', file)

        // 3. 上传到微信（通过代理服务器）
        // 注意：这里需要用原生 fetch 因为 FormData 需要自动设置 boundary
        const uploadHeaders: Record<string, string> = {}
        // 只保留 Authorization header，Content-Type 由 FormData 自动设置
        if (headers.Authorization) {
          uploadHeaders.Authorization = headers.Authorization
        }

        const uploadResponse = await tauriFetch(apiUrl, {
          method: 'POST',
          headers: uploadHeaders,
          body: formData,
        })

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text()
          throw new Error(`Upload failed: HTTP ${uploadResponse.status} - ${errorText}`)
        }

        const result = await uploadResponse.json() as {
          code?: number
          message?: string
          data?: { media_id?: string, url?: string }
          // 微信原始返回格式可能是这样
          media_id?: string
          url?: string
          errcode?: number
          errmsg?: string
        }

        // 调试：打印完整响应
        await info(`[Workflow] Upload response: ${JSON.stringify(result)}`)

        // 兼容多种返回格式
        let mediaId: string | undefined
        let wxUrl: string | undefined

        // 格式1: 代理服务器包装格式 { code, data: { media_id, url } }
        if (result.data?.media_id) {
          mediaId = result.data.media_id
          wxUrl = result.data.url
        }
        // 格式2: 微信原始格式 { media_id, url }
        else if (result.media_id) {
          mediaId = result.media_id
          wxUrl = result.url
        }

        // 检查是否有错误
        if (result.errcode && result.errcode !== 0) {
          throw new Error(`WeChat API error: ${result.errcode} - ${result.errmsg || 'Unknown'}`)
        }

        if (!mediaId) {
          throw new Error(`Upload API error: No media_id in response. Raw: ${JSON.stringify(result)}`)
        }

        const finalWxUrl = wxUrl || ''

        uploadedMedia.push({
          originalUrl: photoUrl,
          mediaId,
          wxUrl: finalWxUrl,
          index: i,
        })

        // 仅当微信返回了可用的 URL 时才替换；否则保留原图地址，避免替换成空字符串
        imageUrlMap[photoUrl] = finalWxUrl || photoUrl

        await info(`[Workflow] Photo ${i + 1} uploaded successfully. media_id: ${mediaId}`)
      }
      catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        await logError(`[Workflow] Failed to upload photo ${i + 1}: ${errMsg}`)
        throw new Error(`Failed to upload photo ${i + 1} (${photoUrl}): ${errMsg}`)
      }
    }

    await info(`[Workflow] All ${photos.length} photo(s) uploaded successfully`)

    // 将 HTML/图片列表中的原始链接替换为微信返回的链接
    const originalHtml = ctx.html || ''
    let replacedHtml = originalHtml
    const escapeReg = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    for (const [orig, wx] of Object.entries(imageUrlMap)) {
      if (!orig || !wx)
        continue
      const reg = new RegExp(escapeReg(orig), 'g')
      replacedHtml = replacedHtml.replace(reg, wx)
    }
    const replacedPhotos = (ctx.photos || []).map((url: string) => imageUrlMap[url] || url)

    await info(`[Workflow] Image URL replacements applied: ${Object.keys(imageUrlMap).length} mapping(s)`)

    // 返回上传结果，包含映射关系供后续步骤使用
    return {
      code: 200,
      message: 'All photos uploaded successfully',
      data: {
        uploadedMedia,
        imageUrlMap,
        coverMediaId: uploadedMedia[0]?.mediaId || '', // 第一张作为封面
        totalUploaded: uploadedMedia.length,
        html: replacedHtml,
        photos: replacedPhotos,
      },
    }
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

    const runId = Date.now().toString()
    const workflowTitle = initialCtx.title || 'Workflow'
    activity.startWorkflow(runId, workflowTitle, steps.length)

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

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!
      const stepIndex = i + 1 // 索引从 1 开始

      activity.updateWorkflowStep(runId, i, step.name)

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

        // 将步骤输出存储到 step1, step2, ... 中，避免后续步骤覆盖
        if (typeof output === 'object' && output !== null) {
          currentCtx = {
            ...currentCtx,
            ...output, // merge returned fields into context (e.g., updated html/photos)
            [`step${stepIndex}`]: output,
          }
        }

        await info(`[Workflow] Step "${step.name}" (step${stepIndex}) completed successfully`)
      }
      catch (e: any) {
        log.status = 'error'
        log.error = e.message
        log.endTime = Date.now()
        log.duration = log.endTime - startTime
        logs.push(log)

        await logError(`[Workflow] Step "${step.name}" failed: ${e.message}`)
        activity.finishWorkflow(runId, 'error')
        throw e // Stop execution on error
      }

      log.endTime = Date.now()
      log.duration = log.endTime - startTime
      logs.push(log)
    }

    await info(`[Workflow] Workflow completed successfully`)
    activity.finishWorkflow(runId, 'success')
    return { logs, finalCtx: currentCtx }
  }

  return {
    runWorkflow,
  }
}
