import type { IStorageAdapter, StorageConfig } from '~/lib/storage/types'
import { COSAdapter } from '~/lib/storage/adapters/cos'
import { useSettingRepository } from './repositories/useSettingRepository'
import { useCurrentUser } from './useCurrentUser'
import { useImageCompressor } from './useImageCompressor'
import { useLog } from './useLog'
import { useStatsCollector } from './useStatsCollector'
import { useStorageSelector } from './useStorageSelector'

// 存储适配器工厂
class StorageFactory {
  static createAdapter(provider: string): IStorageAdapter {
    switch (provider) {
      case 'cos':
        return new COSAdapter()
      // 未来可扩展其他服务商
      // case 's3':
      //   return new S3Adapter()
      default:
        throw new Error(`Unknown storage provider: ${provider}`)
    }
  }
}

export function useStorageService() {
  const { getSettingsByCategory, getSetting } = useSettingRepository()
  const { openSelector } = useStorageSelector()
  const logger = useLog()
  const { compressImage, loadSettings: loadImageSettings } = useImageCompressor()
  const { incrementCounter } = useStatsCollector()
  const { currentUserId } = useCurrentUser()

  /**
   * 获取所有已配置可用的存储服务商
   */
  const getAvailableProviders = async (): Promise<string[]> => {
    const providers: string[] = []

    // Check COS
    try {
      const cosSettings = await getSettingsByCategory('cos')
      if (cosSettings.enabled === 'true' && cosSettings.secret_id && cosSettings.secret_key && cosSettings.bucket) {
        providers.push('cos')
      }
    }
    catch (e) {
      console.error('Check COS settings failed', e)
    }

    // Check others...

    return providers
  }

  /**
   * 确定要使用的存储服务商
   */
  const determineProvider = async (options?: { provider?: string }): Promise<string> => {
    if (options?.provider) {
      return options.provider
    }

    // 1. 尝试获取默认设置
    const defaultProvider = await getSetting('default_storage_provider')

    // 2. 获取所有可用服务
    const available = await getAvailableProviders()

    if (available.length === 0) {
      throw new Error('未配置任何可用的图床服务，请先在设置中启用并配置')
    }

    // 3. 决策逻辑
    if (defaultProvider && available.includes(defaultProvider)) {
      return defaultProvider
    }
    else if (available.length === 1) {
      return available[0]
    }
    else {
      // 多个可用且无有效默认值 -> 弹出选择器
      const selected = await openSelector(available)
      if (!selected) {
        throw new Error('用户取消上传')
      }
      return selected
    }
  }

  const uploadFile = async (file: File, options?: { provider?: string }) => {
    const provider = await determineProvider(options)

    logger.info(`[Storage] Starting upload. Provider: ${provider}, File: ${file.name}, Size: ${file.size}`)

    // 图片压缩处理
    let fileToUpload = file
    if (file.type.startsWith('image/')) {
      try {
        await loadImageSettings()
        const compressed = await compressImage(file)
        if (compressed !== file) {
          const savedBytes = file.size - compressed.size
          logger.info(`[Storage] Image compressed. Original: ${file.size}, Compressed: ${compressed.size}, Saved: ${savedBytes}, Type: ${compressed.type}`)
          fileToUpload = compressed

          // 记录压缩统计
          if (savedBytes > 0) {
            incrementCounter(currentUserId.value, 'asset.compression_saved_bytes', savedBytes)
            incrementCounter(currentUserId.value, 'asset.compressed_count', 1)
          }
        }
      }
      catch (e) {
        logger.error(`[Storage] Compression failed, using original file: ${e}`)
      }
    }

    try {
      // 2. 获取该 Provider 的配置
      const rawSettings = await getSettingsByCategory(provider)

      // 3. 映射配置到标准 StorageConfig
      let config: StorageConfig

      if (provider === 'cos') {
        if (!rawSettings.secret_id || !rawSettings.secret_key || !rawSettings.bucket || !rawSettings.region) {
          logger.error('[Storage] COS Settings missing')
          throw new Error('请先在设置中配置腾讯云 COS 信息')
        }

        config = {
          accessKeyId: rawSettings.secret_id,
          secretAccessKey: rawSettings.secret_key,
          bucket: rawSettings.bucket,
          region: rawSettings.region,
          pathPrefix: rawSettings.path_prefix,
          customDomain: rawSettings.custom_domain,
        }
      }
      // 未来添加其他 Provider 的配置映射
      // else if (provider === 's3') { ... }
      else {
        // 尝试使用通用字段名，或者抛出错误
        // 这里为了健壮性，假设其他 provider 使用标准字段名存储
        config = {
          accessKeyId: rawSettings.access_key_id || rawSettings.secret_id!,
          secretAccessKey: rawSettings.secret_access_key || rawSettings.secret_key!,
          bucket: rawSettings.bucket!,
          region: rawSettings.region!,
          endpoint: rawSettings.endpoint,
          pathPrefix: rawSettings.path_prefix,
          customDomain: rawSettings.custom_domain,
        }
      }

      // 4. 创建适配器并上传
      const adapter = StorageFactory.createAdapter(provider)
      const result = await adapter.upload(fileToUpload, config)

      logger.info(`[Storage] Upload success. URL: ${result.url}`)
      return {
        ...result,
        size: fileToUpload.size,
        filename: fileToUpload.name,
        mime_type: fileToUpload.type,
      }
    }
    catch (error) {
      logger.error(`[Storage] Upload process failed (${provider})`, error)
      throw error
    }
  }

  const uploadFiles = async (files: File[], options?: { provider?: string }) => {
    if (files.length === 0)
      return []

    // 批量上传时，先确定 Provider，避免每个文件都弹窗
    const provider = await determineProvider(options)

    // 并行上传
    return Promise.all(files.map(file => uploadFile(file, { provider })))
  }

  return {
    uploadFile,
    uploadFiles,
    getAvailableProviders,
  }
}
