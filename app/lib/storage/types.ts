export interface StorageConfig {
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  region: string
  endpoint?: string
  pathPrefix?: string
  customDomain?: string
  // 允许其他特定配置
  [key: string]: any
}

export interface UploadResult {
  url: string
  path: string
  // Optional metadata about the uploaded file (useful if compression changed it)
  size?: number
  filename?: string
  mime_type?: string
}

export interface IStorageAdapter {
  upload: (file: File, config: StorageConfig) => Promise<UploadResult>
}
