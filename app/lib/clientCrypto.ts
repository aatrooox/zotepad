/**
 * 客户端加密工具（用于 Tauri App / 浏览器）
 * 使用 Web Crypto API 实现 AES-256-GCM 加密
 *
 * 注意：这个文件可以在浏览器端使用，不依赖 Node.js
 */

const ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12

/**
 * 将字符串转换为 Uint8Array
 */
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

/**
 * 将 Uint8Array 转换为 Base64
 */
function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

/**
 * 从密钥字符串生成 CryptoKey
 * 使用 SHA-256 哈希确保密钥长度为 256 位
 */
async function getKeyFromString(keyString: string): Promise<CryptoKey> {
  const keyBytes = stringToBytes(keyString)
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes as unknown as BufferSource)
  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * 加密数据
 * @param plaintext 明文
 * @param secretKey 密钥字符串（与服务端 NUXT_CRYPTO_SECRET_KEY 相同）
 * @returns 加密后的字符串（格式：iv:authTag:ciphertext，均为 base64）
 */
export async function encryptForServer(plaintext: string, secretKey: string): Promise<string> {
  const key = await getKeyFromString(secretKey)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encodedText = stringToBytes(plaintext)

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encodedText as unknown as BufferSource,
  )

  const encryptedBytes = new Uint8Array(encryptedBuffer)
  // AES-GCM 的输出包含密文和 authTag（最后 16 字节）
  const ciphertext = encryptedBytes.slice(0, -16)
  const authTag = encryptedBytes.slice(-16)

  return `${bytesToBase64(iv)}:${bytesToBase64(authTag)}:${bytesToBase64(ciphertext)}`
}

/**
 * 加密对象
 * @param obj 要加密的对象
 * @param secretKey 密钥字符串
 * @returns 加密后的字符串
 */
export async function encryptObjectForServer<T>(obj: T, secretKey: string): Promise<string> {
  return encryptForServer(JSON.stringify(obj), secretKey)
}

/**
 * 使用示例（在 Tauri App 中）：
 *
 * ```typescript
 * import { encryptObjectForServer } from '~/shared/utils/clientCrypto'
 *
 * const CRYPTO_KEY = 'your-shared-secret-key' // 与服务端相同的密钥
 *
 * async function getWxToken(appId: string, appSecret: string) {
 *   const encrypted = await encryptObjectForServer(
 *     { appId, appSecret },
 *     CRYPTO_KEY
 *   )
 *
 *   const response = await fetch('https://zzao.club/api/v1/wx/cgi-bin/token', {
 *     method: 'POST',
 *     headers: {
 *       'Content-Type': 'application/json',
 *       'Authorization': `Bearer ${userToken}`, // 用户登录后的 JWT
 *       'X-App-Source': 'zotepad', // 可选的来源标识
 *     },
 *     body: JSON.stringify({ encrypted }),
 *   })
 *
 *   const data = await response.json()
 *   if (data.code === 0) {
 *     console.log('Access Token:', data.data.accessToken)
 *     console.log('Expires In:', data.data.expiresIn)
 *   }
 * }
 * ```
 */
