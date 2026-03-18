import type { ClientOptions } from '@tauri-apps/plugin-http'
import { Channel, invoke } from '@tauri-apps/api/core'

const ERROR_REQUEST_CANCELLED = 'Request cancelled'

type CompatFetchInit = RequestInit & ClientOptions

export async function tauriHttpFetch(input: URL | Request | string, init?: CompatFetchInit): Promise<Response> {
  const signal = init?.signal
  if (signal?.aborted) {
    throw new Error(ERROR_REQUEST_CANCELLED)
  }

  const maxRedirections = init?.maxRedirections
  const connectTimeout = init?.connectTimeout
  const proxy = init?.proxy
  const danger = init?.danger

  if (init) {
    delete init.maxRedirections
    delete init.connectTimeout
    delete init.proxy
    delete init.danger
  }

  const headers = init?.headers
    ? (init.headers instanceof Headers ? init.headers : new Headers(init.headers))
    : new Headers()

  const req = new Request(input, init)
  const buffer = await req.arrayBuffer()
  const data = buffer.byteLength !== 0 ? Array.from(new Uint8Array(buffer)) : null

  for (const [key, value] of req.headers) {
    if (!headers.get(key)) {
      headers.set(key, value)
    }
  }

  const headersArray = headers instanceof Headers
    ? Array.from(headers.entries())
    : Array.isArray(headers)
      ? headers
      : Object.entries(headers)

  const mappedHeaders = headersArray.map(([name, val]) => [
    name,
    typeof val === 'string' ? val : val.toString(),
  ])

  if (signal?.aborted) {
    throw new Error(ERROR_REQUEST_CANCELLED)
  }

  const rid = await invoke<number>('plugin:http|fetch', {
    clientConfig: {
      method: req.method,
      url: req.url,
      headers: mappedHeaders,
      data,
      maxRedirections,
      connectTimeout,
      proxy,
      danger,
    },
  })

  const abort = () => invoke('plugin:http|fetch_cancel', { rid })

  if (signal?.aborted) {
    void abort()
    throw new Error(ERROR_REQUEST_CANCELLED)
  }

  signal?.addEventListener('abort', () => {
    void abort()
  })

  const responseMeta = await invoke<{
    status: number
    statusText: string
    url: string
    headers: Array<[string, string]>
    rid: number
  }>('plugin:http|fetch_send', { rid })

  const body = [101, 103, 204, 205, 304].includes(responseMeta.status)
    ? null
    : new ReadableStream<Uint8Array>({
        start(controller) {
          const streamChannel = new Channel<ArrayBuffer | number[]>()

          streamChannel.onmessage = (res) => {
            if (signal?.aborted) {
              controller.error(ERROR_REQUEST_CANCELLED)
              return
            }

            const chunk = new Uint8Array(res)
            const lastByte = chunk[chunk.byteLength - 1]
            const actualData = chunk.slice(0, chunk.byteLength - 1)

            if (lastByte !== 1) {
              controller.enqueue(actualData)
            }
            else {
              controller.close()
            }
          }

          void invoke('plugin:http|fetch_read_body', {
            rid: responseMeta.rid,
            streamChannel,
          }).catch((error) => {
            controller.error(error)
          })
        },
      })

  const response = new Response(body, {
    status: responseMeta.status,
    statusText: responseMeta.statusText,
  })

  Object.defineProperty(response, 'url', { value: responseMeta.url })
  Object.defineProperty(response, 'headers', {
    value: new Headers(responseMeta.headers),
  })

  return response
}
