import type { IStorageAdapter, StorageConfig, UploadResult } from '../types'
import COS from 'cos-js-sdk-v5'

export class COSAdapter implements IStorageAdapter {
  async upload(file: File, config: StorageConfig): Promise<UploadResult> {
    // 初始化 COS 实例
    const cos = new COS({
      SecretId: config.accessKeyId,
      SecretKey: config.secretAccessKey,
    })

    // 生成文件名
    const ext = file.name.split('.').pop()
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

    // 处理路径前缀
    let prefix = config.pathPrefix || ''
    if (prefix.startsWith('/')) {
      prefix = prefix.slice(1)
    }
    if (prefix && !prefix.endsWith('/')) {
      prefix += '/'
    }

    const path = `${prefix}${filename}`

    return new Promise((resolve, reject) => {
      cos.putObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: path,
        Body: file,
      }, (err, data) => {
        if (err) {
          return reject(err)
        }

        let url = `https://${data.Location}`

        // 处理自定义域名
        if (config.customDomain) {
          let domain = config.customDomain
          if (domain.endsWith('/')) {
            domain = domain.slice(0, -1)
          }
          // 确保路径以 / 开头
          const urlPath = path.startsWith('/') ? path : `/${path}`
          url = `${domain}${urlPath}`
        }

        resolve({ url, path })
      })
    })
  }
}
