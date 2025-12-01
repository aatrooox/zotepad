import COS from 'cos-js-sdk-v5'
import { useSettingRepository } from './repositories/useSettingRepository'

export function useCOSService() {
  const { getSettingsByCategory } = useSettingRepository()

  const getCOSInstance = async () => {
    const settings = await getSettingsByCategory('cos')
    if (!settings.secret_id || !settings.secret_key || !settings.bucket || !settings.region) {
      throw new Error('请先在设置中配置腾讯云 COS 信息')
    }

    return {
      cos: new COS({
        SecretId: settings.secret_id,
        SecretKey: settings.secret_key,
      }),
      config: settings as { secret_id: string, secret_key: string, bucket: string, region: string, path_prefix?: string, custom_domain?: string },
    }
  }

  const uploadFile = async (file: File) => {
    const { cos, config } = await getCOSInstance()
    const ext = file.name.split('.').pop()
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

    let prefix = config.path_prefix || ''
    if (prefix.startsWith('/')) {
      prefix = prefix.slice(1)
    }
    if (prefix && !prefix.endsWith('/')) {
      prefix += '/'
    }

    const path = `${prefix}${filename}`

    return new Promise<{ url: string, path: string }>((resolve, reject) => {
      cos.putObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: path,
        Body: file,
      }, (err, data) => {
        if (err) {
          reject(err)
        }
        else {
          let url = `https://${data.Location}`
          if (config.custom_domain) {
            // Ensure custom domain doesn't end with /
            let domain = config.custom_domain
            if (domain.endsWith('/')) {
              domain = domain.slice(0, -1)
            }
            // Ensure path starts with /
            const urlPath = path.startsWith('/') ? path : `/${path}`
            url = `${domain}${urlPath}`
          }
          resolve({ url, path })
        }
      })
    })
  }

  return {
    uploadFile,
  }
}
