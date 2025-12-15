import { invoke } from '@tauri-apps/api/core'
import { info, error as logError } from '@tauri-apps/plugin-log'
import { ref } from 'vue'
import { useEnvironment } from './useEnvironment'
import { useTauriStore } from './useTauriStore'

export interface CompressOptions {
  quality?: number
  targetFormat?: 'png' | 'jpeg' | 'jpg' | 'webp' | 'gif'
  force?: boolean
}

export const useImageCompressor = () => {
  const store = useTauriStore()
  const { isMobile } = useEnvironment()

  const enableCompression = ref(false)
  const enableFormatConversion = ref(true)
  const compressionQuality = ref(80)
  const conversionFormat = ref<'png' | 'jpeg' | 'jpg' | 'webp'>('webp')
  const isInitializing = ref(true)

  const loadSettings = async () => {
    try {
      await store.initStore()
      const compress = await store.getItem<boolean>('settings:enable_compression')
      const convert = await store.getItem<boolean>('settings:enable_format_conversion')
      const quality = await store.getItem<number>('settings:compression_quality')
      const format = await store.getItem<string>('settings:conversion_format')

      enableCompression.value = compress ?? false
      enableFormatConversion.value = convert ?? true
      compressionQuality.value = quality ?? 80
      if (format && ['png', 'jpeg', 'jpg', 'webp'].includes(format)) {
        conversionFormat.value = format as any
      }
    }
    catch (e) {
      logError(`Failed to load image settings: ${JSON.stringify(e)}`)
    }
    finally {
      isInitializing.value = false
    }
  }

  const saveSettings = async () => {
    try {
      await store.setItem('settings:enable_compression', enableCompression.value)
      await store.setItem('settings:enable_format_conversion', enableFormatConversion.value)
      await store.setItem('settings:compression_quality', compressionQuality.value)
      await store.setItem('settings:conversion_format', conversionFormat.value)
      await store.saveStore()
    }
    catch (e) {
      logError(`Failed to save image settings: ${JSON.stringify(e)}`)
    }
  }

  const compressImageJs = async (file: File, quality: number, targetFormat?: string): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)

      img.onload = () => {
        URL.revokeObjectURL(url)
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas context not available'))
          return
        }
        ctx.drawImage(img, 0, 0)

        let mimeType = file.type
        let ext = file.name.split('.').pop() || ''

        if (targetFormat) {
          switch (targetFormat.toLowerCase()) {
            case 'png':
              mimeType = 'image/png'
              ext = 'png'
              break
            case 'jpeg':
            case 'jpg':
              mimeType = 'image/jpeg'
              ext = 'jpg'
              break
            case 'webp':
              mimeType = 'image/webp'
              ext = 'webp'
              break
          }
        }

        // Canvas toBlob quality is 0.0 - 1.0
        const q = quality / 100

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Canvas toBlob failed'))
            return
          }
          const newFileName = `${file.name.replace(/\.[^/.]+$/, '')}.${ext}`
          const newFile = new File([blob], newFileName, { type: mimeType })
          resolve(newFile)
        }, mimeType, q)
      }

      img.onerror = (e) => {
        URL.revokeObjectURL(url)
        reject(e)
      }

      img.src = url
    })
  }

  const compressImage = async (file: File, options: CompressOptions = {}): Promise<File> => {
    // If options are provided (explicit usage), we ignore the global switch unless it's just an empty object
    const isExplicit = Object.keys(options).length > 0
    if (!enableCompression.value && !isExplicit && !options.force) {
      return file
    }

    try {
      // Determine target format
      let targetFormat = options.targetFormat
      if (!targetFormat && enableFormatConversion.value) {
        targetFormat = conversionFormat.value
      }

      // Determine quality
      const quality = options.quality ?? compressionQuality.value

      // Mobile Optimization: Use JS Canvas for compression to avoid expensive IPC
      // Skip GIF as Canvas doesn't support animated GIF encoding
      if (isMobile.value && file.type !== 'image/gif' && (!targetFormat || targetFormat !== 'gif')) {
        await info('Using JS Canvas compression for mobile')
        return await compressImageJs(file, quality, targetFormat)
      }

      const buffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(buffer)

      await info(`Compressing image with quality: ${quality} and target format: ${targetFormat}`)
      const compressedData = await invoke<number[]>('compress_image', {
        buffer: uint8Array, // Pass Uint8Array directly, let Tauri handle serialization
        quality,
        targetFormat,
      })

      let mimeType = file.type
      let fileName = file.name

      if (targetFormat) {
        switch (targetFormat.toLowerCase()) {
          case 'png':
            mimeType = 'image/png'
            fileName = `${fileName.replace(/\.[^/.]+$/, '')}.png`
            break
          case 'jpeg':
          case 'jpg':
            mimeType = 'image/jpeg'
            fileName = `${fileName.replace(/\.[^/.]+$/, '')}.jpg`
            break
          case 'webp':
            mimeType = 'image/webp'
            fileName = `${fileName.replace(/\.[^/.]+$/, '')}.webp`
            break
          case 'gif':
            mimeType = 'image/gif'
            fileName = `${fileName.replace(/\.[^/.]+$/, '')}.gif`
            break
        }
      }

      return new File([new Uint8Array(compressedData)], fileName, { type: mimeType })
    }
    catch (e) {
      logError(`Image compression failed: ${JSON.stringify(e)}`)
      return file // Fallback to original
    }
  }

  return {
    enableCompression,
    enableFormatConversion,
    compressionQuality,
    conversionFormat,
    loadSettings,
    saveSettings,
    compressImage,
    isInitializing,
  }
}
