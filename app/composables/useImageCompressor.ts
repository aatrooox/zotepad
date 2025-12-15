import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import { useTauriStore } from './useTauriStore'

export const useImageCompressor = () => {
  const store = useTauriStore()

  const enableCompression = ref(false)
  const enableFormatConversion = ref(true)
  const isInitializing = ref(true)

  const loadSettings = async () => {
    try {
      await store.initStore()
      const compress = await store.getItem<boolean>('settings:enable_compression')
      const convert = await store.getItem<boolean>('settings:enable_format_conversion')

      enableCompression.value = compress ?? false
      enableFormatConversion.value = convert ?? true
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
      await store.saveStore()
    }
    catch (e) {
      console.error('Failed to save image settings', e)
    }
  }

  const compressImage = async (file: File): Promise<File> => {
    if (!enableCompression.value) {
      return file
    }

    try {
      const buffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(buffer)

      const targetFormat = enableFormatConversion.value ? 'webp' : null

      const compressedData = await invoke<number[]>('compress_image', {
        buffer: Array.from(uint8Array),
        quality: 80,
        targetFormat,
      })

      let mimeType = file.type
      let fileName = file.name

      if (enableFormatConversion.value) {
        mimeType = 'image/webp'
        fileName = `${fileName.replace(/\.[^/.]+$/, '')}.webp`
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
    loadSettings,
    saveSettings,
    compressImage,
    isInitializing,
  }
}
