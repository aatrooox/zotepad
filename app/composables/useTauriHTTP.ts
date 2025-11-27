/**
 * Tauri HTTP 客户端 Composable
 * 基于 @tauri-apps/plugin-http 封装的 HTTP 请求工具
 */

import { fetch } from '@tauri-apps/plugin-http'
import { error as logError } from '@tauri-apps/plugin-log'

// ============= 类型定义 =============

/**
 * HTTP 请求配置
 */
export interface HTTPConfig {
  baseURL?: string
  timeout?: number
  headers?: Record<string, string>
  retries?: number
  retryDelay?: number
}

/**
 * HTTP 响应类型
 */
export interface HTTPResponse<T = any> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string>
  ok: boolean
}

/**
 * HTTP 错误类型
 */
export interface HTTPError {
  message: string
  status?: number
  statusText?: string
  url?: string
}

/**
 * 请求选项
 */
export interface RequestOptions extends RequestInit {
  timeout?: number
  retries?: number
  retryDelay?: number
  baseURL?: string
}

// ============= HTTP 客户端类 =============

/**
 * HTTP 客户端
 */
export class TauriHTTPClient {
  private config: HTTPConfig

  constructor(config: HTTPConfig = {}) {
    this.config = {
      timeout: 10000,
      retries: 3,
      retryDelay: 1000,
      headers: {
        'Content-Type': 'application/json',
      },
      ...config,
    }
  }

  /**
   * 构建完整 URL
   */
  private buildURL(url: string, baseURL?: string): string {
    const base = baseURL || this.config.baseURL || ''

    if (!base)
      return url
    if (url.startsWith('http://') || url.startsWith('https://'))
      return url

    return `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
  }

  /**
   * 合并请求头
   */
  private mergeHeaders(options?: RequestOptions): Record<string, string> {
    return Object.assign({} as Record<string, string>, {
      ...this.config.headers,
      ...options?.headers,
    })
  }

  /**
   * 创建 AbortController 用于超时控制
   */
  private createTimeoutController(timeout?: number): AbortController {
    const controller = new AbortController()
    const timeoutMs = timeout || this.config.timeout || 10000

    setTimeout(() => {
      controller.abort()
    }, timeoutMs)

    return controller
  }

  /**
   * 执行 HTTP 请求
   */
  async request<T = any>(url: string, options: RequestOptions = {}): Promise<HTTPResponse<T>> {
    const fullURL = this.buildURL(url, options.baseURL)
    const headers = this.mergeHeaders(options)
    const retries = options.retries ?? this.config.retries ?? 3
    const retryDelay = options.retryDelay ?? this.config.retryDelay ?? 1000

    let lastError: HTTPError | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = this.createTimeoutController(options.timeout)

        const response = await fetch(fullURL, {
          ...options,
          headers,
          signal: controller.signal,
        })

        // 解析响应数据
        let data: T
        const contentType = response.headers.get('content-type') || ''

        if (contentType.includes('application/json')) {
          data = await response.json()
        }
        else if (contentType.includes('text/')) {
          data = await response.text() as T
        }
        else {
          data = await response.arrayBuffer() as T
        }

        // 构建响应对象
        const httpResponse: HTTPResponse<T> = {
          data,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          ok: response.ok,
        }

        return httpResponse
      }
      catch (error: any) {
        console.error('[HTTP] Raw error in loop:', error)
        await logError(`[HTTP] Raw error in loop: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`)

        lastError = {
          message: error.message || 'Request failed',
          status: error.status,
          statusText: error.statusText,
          url: fullURL,
        }

        // 如果是最后一次尝试，抛出错误
        if (attempt === retries) {
          throw lastError
        }

        // 等待后重试
        if (retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
      }
    }

    throw lastError
  }

  /**
   * GET 请求
   */
  async get<T = any>(url: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<HTTPResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' })
  }

  /**
   * POST 请求
   */
  async post<T = any>(url: string, data?: any, options: Omit<RequestOptions, 'method'> = {}): Promise<HTTPResponse<T>> {
    const body = data ? JSON.stringify(data) : undefined
    return this.request<T>(url, { ...options, method: 'POST', body })
  }

  /**
   * PUT 请求
   */
  async put<T = any>(url: string, data?: any, options: Omit<RequestOptions, 'method'> = {}): Promise<HTTPResponse<T>> {
    const body = data ? JSON.stringify(data) : undefined
    return this.request<T>(url, { ...options, method: 'PUT', body })
  }

  /**
   * DELETE 请求
   */
  async delete<T = any>(url: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<HTTPResponse<T>> {
    return this.request<T>(url, { ...options, method: 'DELETE' })
  }

  /**
   * PATCH 请求
   */
  async patch<T = any>(url: string, data?: any, options: Omit<RequestOptions, 'method'> = {}): Promise<HTTPResponse<T>> {
    const body = data ? JSON.stringify(data) : undefined
    return this.request<T>(url, { ...options, method: 'PATCH', body })
  }
}

// ============= Composable 函数 =============

/**
 * 全局 HTTP 客户端实例
 */
let globalHTTPClient: TauriHTTPClient | null = null

/**
 * Tauri HTTP Composable
 */
export function useTauriHTTP(config?: HTTPConfig) {
  // 创建或获取 HTTP 客户端实例
  const httpClient = config
    ? new TauriHTTPClient(config)
    : (
        globalHTTPClient || (globalHTTPClient = new TauriHTTPClient())
      )

  // 响应式状态
  const loading = ref(false)
  const error = ref<HTTPError | null>(null)

  /**
   * 执行请求的包装函数
   */
  async function executeRequest<T>(requestFn: () => Promise<HTTPResponse<T>>): Promise<HTTPResponse<T> | null> {
    try {
      loading.value = true
      error.value = null

      const response = await requestFn()
      return response
    }
    catch (err: any) {
      error.value = err
      console.error('HTTP 请求失败:', err)
      await logError(`[HTTP] Request failed: ${err.message || err}`)
      return null
    }
    finally {
      loading.value = false
    }
  }

  /**
   * GET 请求
   */
  async function get<T = any>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
    return executeRequest(() => httpClient.get<T>(url, options))
  }

  /**
   * POST 请求
   */
  async function post<T = any>(url: string, data?: any, options?: Omit<RequestOptions, 'method'>) {
    return executeRequest(() => httpClient.post<T>(url, data, options))
  }

  /**
   * PUT 请求
   */
  async function put<T = any>(url: string, data?: any, options?: Omit<RequestOptions, 'method'>) {
    return executeRequest(() => httpClient.put<T>(url, data, options))
  }

  /**
   * DELETE 请求
   */
  async function del<T = any>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
    return executeRequest(() => httpClient.delete<T>(url, options))
  }

  /**
   * PATCH 请求
   */
  async function patch<T = any>(url: string, data?: any, options?: Omit<RequestOptions, 'method'>) {
    return executeRequest(() => httpClient.patch<T>(url, data, options))
  }

  /**
   * 自定义请求
   */
  async function request<T = any>(url: string, options?: RequestOptions) {
    return executeRequest(() => httpClient.request<T>(url, options))
  }

  /**
   * 清除错误状态
   */
  function clearError() {
    error.value = null
  }

  return {
    // HTTP 客户端实例
    httpClient,

    // 响应式状态
    loading: readonly(loading),
    error: readonly(error),

    // HTTP 方法
    get,
    post,
    put,
    delete: del,
    patch,
    request,

    // 工具方法
    clearError,
  }
}

// ============= 便捷函数 =============

/**
 * 创建带有基础配置的 HTTP 客户端
 */
export function createHTTPClient(config: HTTPConfig) {
  return new TauriHTTPClient(config)
}

/**
 * 设置全局 HTTP 配置
 */
export function setGlobalHTTPConfig(config: HTTPConfig) {
  globalHTTPClient = new TauriHTTPClient(config)
}

/**
 * 快速 GET 请求
 */
export async function httpGet<T = any>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T | null> {
  try {
    const client = globalHTTPClient || new TauriHTTPClient()
    const response = await client.get<T>(url, options)
    return response.data
  }
  catch (error) {
    console.error('HTTP GET 失败:', error)
    return null
  }
}

/**
 * 快速 POST 请求
 */
export async function httpPost<T = any>(url: string, data?: any, options?: Omit<RequestOptions, 'method'>): Promise<T | null> {
  try {
    const client = globalHTTPClient || new TauriHTTPClient()
    const response = await client.post<T>(url, data, options)
    return response.data
  }
  catch (error) {
    console.error('HTTP POST 失败:', error)
    return null
  }
}

// ============= 导出默认实例 =============

export default useTauriHTTP
