import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import { useTauriStore } from './useTauriStore'

export interface CompressOptions {
  quality?: number
  targetFormat?: 'png' | 'jpeg' | 'jpg' | 'webp' | 'gif'
  force?: boolean
}

export const useImageCompressor = () => {
  const store = useTauriStore()

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
      console.error('Failed to load image settings', e)
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
      console.error('Failed to save image settings', e)
    }
  }

  const compressImage = async (file: File, options: CompressOptions = {}): Promise<File> => {
    // If options are provided (explicit usage), we ignore the global switch unless it's just an empty object
    const isExplicit = Object.keys(options).length > 0
    if (!enableCompression.value && !isExplicit && !options.force) {
      return file
    }

    try {
      const buffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(buffer)

      // Determine target format
      let targetFormat = options.targetFormat
      if (!targetFormat && enableFormatConversion.value) {
        targetFormat = conversionFormat.value
      }

      // Determine quality
      const quality = options.quality ?? compressionQuality.value
      console.log('Compressing image with quality:', quality, 'and target format:', targetFormat)
      const compressedData = await invoke<number[]>('compress_image', {
        buffer: Array.from(uint8Array),
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
      console.error('Image compression failed:', e)
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
