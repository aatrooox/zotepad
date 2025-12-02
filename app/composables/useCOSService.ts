import COS from 'cos-js-sdk-v5'
import { useSettingRepository } from './repositories/useSettingRepository'
import { useLog } from './useLog'

export function useCOSService() {
  const { getSettingsByCategory } = useSettingRepository()
  const logger = useLog()

  const getCOSInstance = async () => {
    logger.info('[COS] Getting settings...')
    const settings = await getSettingsByCategory('cos')
    if (!settings.secret_id || !settings.secret_key || !settings.bucket || !settings.region) {
      logger.error('[COS] Settings missing')
      throw new Error('请先在设置中配置腾讯云 COS 信息')
    }
    logger.info(`[COS] Settings loaded. Bucket: ${settings.bucket}, Region: ${settings.region}`)

    return {
      cos: new COS({
        SecretId: settings.secret_id,
        SecretKey: settings.secret_key,
      }),
      config: settings as { secret_id: string, secret_key: string, bucket: string, region: string, path_prefix?: string, custom_domain?: string },
    }
  }

  const uploadFile = async (file: File) => {
    logger.info(`[COS] Starting upload. File: ${file.name}, Size: ${file.size}`)

    try {
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
      logger.debug(`[COS] Upload path generated: ${path}`)

      return new Promise<{ url: string, path: string }>((resolve, reject) => {
        cos.putObject({
          Bucket: config.bucket,
          Region: config.region,
          Key: path,
          Body: file,
        }, (err, data) => {
          if (err) {
            logger.error('[COS] putObject error', err)
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
            logger.info(`[COS] Upload success. URL: ${url}`)
            resolve({ url, path })
          }
        })
      })
    }
    catch (error) {
      logger.error('[COS] Upload process failed', error)
      throw error
    }
  }

  return {
    uploadFile,
  }
}
