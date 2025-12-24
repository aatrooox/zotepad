import type { Editor } from '@leafer-in/editor'
import type { App, Box, Group, Image as LeaferImage } from 'leafer-ui'
import type { Ref } from 'vue'
import { onMounted, onUnmounted, ref } from 'vue'

export interface ImageItem {
  id: string
  url: string
  x: number
  y: number
  width?: number
  height?: number
  element?: LeaferImage
}

export interface CanvasLayout {
  type: 'grid' | 'horizontal' | 'vertical' | 'custom'
  gap?: number
  columns?: number
  padding?: number
}

export type CanvasTemplate = 'wechat-cover-235' | 'nine-grid'

export interface TemplateStyle {
  backgroundColor: string
  gap: number
  radius: number
  padding: number
}

interface TemplateSlot {
  id: string
  x: number
  y: number
  width: number
  height: number
  order: number
  placeholder?: any
}

export interface ExportOptions {
  filename?: string
  format?: 'png' | 'jpg' | 'webp'
  quality?: number
  pixelRatio?: number
}

export function useLeaferCanvas(containerRef: Ref<HTMLElement | null>) {
  const logInfo = (msg: string, data?: any) => console.log(`[LeaferCanvas] ${msg}`, data || '')
  const logError = (msg: string, data?: any) => console.error(`[LeaferCanvas] ${msg}`, data || '')
  const logWarning = (msg: string, data?: any) => console.warn(`[LeaferCanvas] ${msg}`, data || '')

  const isTauriRuntime = async () => {
    if (!import.meta.client)
      return false

    try {
      const core: any = await import('@tauri-apps/api/core')
      if (typeof core?.isTauri === 'function')
        return await core.isTauri()
    }
    catch {
      // ignore
    }

    return Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)
  }

  const app = ref<App | null>(null)
  const editor = ref<Editor | null>(null)

  // 导出容器：用于背景色与导出边界（避免只导出组件本身）
  const exportFrame = ref<Box | null>(null)

  const layoutLayer = ref<Group | null>(null)
  const group = ref<Group | null>(null)

  const activeTemplate = ref<CanvasTemplate | null>(null)
  const templateSlots = ref<TemplateSlot[]>([])
  const templateSlotToImageId = ref<Record<string, string>>({})
  const templateImageIdToSlotId = ref<Record<string, string>>({})

  const templateStyle = ref<TemplateStyle>({
    backgroundColor: '#fafafa',
    gap: 20,
    radius: 12,
    padding: 0,
  })

  const images = ref<ImageItem[]>([])
  const isReady = ref(false)
  const isLoading = ref(false)

  let resizeObserver: ResizeObserver | null = null
  let wheelHandler: ((e: WheelEvent) => void) | null = null
  let pointerDownHandler: ((e: PointerEvent) => void) | null = null
  let pointerMoveHandler: ((e: PointerEvent) => void) | null = null
  let pointerUpHandler: ((e: PointerEvent) => void) | null = null
  let keyDownHandler: ((e: KeyboardEvent) => void) | null = null
  let keyUpHandler: ((e: KeyboardEvent) => void) | null = null

  let isSpacePressed = false
  let isPanning = false
  let panPointerId: number | null = null
  let panStartClientX = 0
  let panStartClientY = 0
  let panStartViewX = 0
  let panStartViewY = 0

  const clearTemplate = () => {
    activeTemplate.value = null
    templateSlots.value.forEach((slot) => {
      if (slot.placeholder) {
        layoutLayer.value?.remove(slot.placeholder)
        slot.placeholder.destroy?.()
      }
    })
    templateSlots.value = []
    templateSlotToImageId.value = {}
    templateImageIdToSlotId.value = {}
  }

  const getTemplateSlotIdAtPoint = (x: number, y: number) => {
    for (const slot of templateSlots.value) {
      if (
        x >= slot.x
        && x <= slot.x + slot.width
        && y >= slot.y
        && y <= slot.y + slot.height
      ) {
        return slot.id
      }
    }
    return null
  }

  const snapImageToSlot = (imageId: string, slotId: string) => {
    const slot = templateSlots.value.find(s => s.id === slotId)
    if (!slot)
      return
    const item = images.value.find(i => i.id === imageId)
    if (!item?.element)
      return

    item.element.x = slot.x
    item.element.y = slot.y
    item.element.width = slot.width as any
    item.element.height = slot.height as any
    item.x = slot.x
    item.y = slot.y
    item.width = slot.width
    item.height = slot.height
  }

  const setBackgroundColor = (color: string) => {
    templateStyle.value.backgroundColor = color
    if (exportFrame.value)
      exportFrame.value.set({ fill: color } as any)
  }

  const getExportRoot = () => {
    return exportFrame.value || group.value
  }

  const exportFrameRect = ref({ x: 0, y: 0, width: 0, height: 0 })

  const setExportFrameRect = (rect: Partial<{ x: number, y: number, width: number, height: number }>) => {
    const next = {
      ...exportFrameRect.value,
      ...rect,
    }
    exportFrameRect.value = next
    if (exportFrame.value)
      exportFrame.value.set(next as any)
  }

  const centerExportFrameInView = () => {
    if (!exportFrame.value)
      return
    const { width: viewW, height: viewH } = getContainerSize()
    const w = exportFrameRect.value.width
    const h = exportFrameRect.value.height
    if (viewW <= 0 || viewH <= 0 || w <= 0 || h <= 0)
      return

    const x = Math.floor((viewW - w) / 2)
    const y = Math.floor((viewH - h) / 2)
    setExportFrameRect({ x, y })
  }

  const computeTemplateLayout = (template: CanvasTemplate): { width: number, height: number, slots: TemplateSlot[] } => {
    const padding = Math.max(0, templateStyle.value.padding)
    const gap = Math.max(0, templateStyle.value.gap)

    if (template === 'wechat-cover-235') {
      const h = 300
      const leftW = Math.round(h * 2.35)
      const rightW = h
      const width = padding * 2 + leftW + gap + rightW
      const height = padding * 2 + h
      const slots: TemplateSlot[] = [
        { id: 'wechat-left', x: padding, y: padding, width: leftW, height: h, order: 0 },
        { id: 'wechat-right', x: padding + leftW + gap, y: padding, width: rightW, height: h, order: 1 },
      ]
      return { width, height, slots }
    }

    // nine-grid
    const size = 200
    const width = padding * 2 + size * 3 + gap * 2
    const height = padding * 2 + size * 3 + gap * 2
    const slots: TemplateSlot[] = []
    let order = 0
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        slots.push({
          id: `nine-${row}-${col}`,
          x: padding + col * (size + gap),
          y: padding + row * (size + gap),
          width: size,
          height: size,
          order,
        })
        order++
      }
    }
    return { width, height, slots }
  }

  const refreshTemplateLayout = async () => {
    if (!activeTemplate.value)
      return

    const { width: frameW, height: frameH, slots: nextSlots } = computeTemplateLayout(activeTemplate.value)
    setExportFrameRect({ width: frameW, height: frameH })
    centerExportFrameInView()

    // 保留旧占位实例，更新几何参数
    const prevById = new Map(templateSlots.value.map(s => [s.id, s]))
    templateSlots.value = nextSlots.map((s) => {
      const prev = prevById.get(s.id)
      return {
        ...s,
        placeholder: prev?.placeholder,
      }
    })

    await renderTemplatePlaceholders()

    // 把已映射的图片吸附到新位置
    for (const slot of templateSlots.value) {
      const imageId = templateSlotToImageId.value[slot.id]
      if (imageId)
        snapImageToSlot(imageId, slot.id)
    }
  }

  const bindTemplateDragHandlers = async (item: ImageItem) => {
    if (!activeTemplate.value || !templateSlots.value.length)
      return
    if (!item.element)
      return

    const el: any = item.element
    if (el.__templateDragBound)
      return
    el.__templateDragBound = true

    const { DragEvent } = await import('leafer-ui')

    el.on(DragEvent.START, () => {
      // 拖拽时置顶，避免被其他格子遮住
      el.__prevZIndex = el.zIndex ?? 0
      el.zIndex = 999999
    })

    el.on(DragEvent.END, () => {
      // 恢复 zIndex
      if (el.__prevZIndex !== undefined)
        el.zIndex = el.__prevZIndex
      delete el.__prevZIndex

      const fromSlotId = templateImageIdToSlotId.value[item.id]
      if (!fromSlotId)
        return

      const w = Number(el.width) || item.width || 0
      const h = Number(el.height) || item.height || 0

      // 使用元素自身世界坐标计算命中（支持 zoom）
      const px = (Number(el.x) || item.x) + w / 2
      const py = (Number(el.y) || item.y) + h / 2

      const toSlotId = getTemplateSlotIdAtPoint(px, py)
      if (!toSlotId) {
        snapImageToSlot(item.id, fromSlotId)
        return
      }

      if (toSlotId === fromSlotId) {
        snapImageToSlot(item.id, fromSlotId)
        return
      }

      const otherImageId = templateSlotToImageId.value[toSlotId]

      if (!otherImageId || otherImageId === item.id) {
        delete templateSlotToImageId.value[fromSlotId]
        templateSlotToImageId.value[toSlotId] = item.id
        templateImageIdToSlotId.value[item.id] = toSlotId
        snapImageToSlot(item.id, toSlotId)
        return
      }

      templateSlotToImageId.value[fromSlotId] = otherImageId
      templateImageIdToSlotId.value[otherImageId] = fromSlotId
      snapImageToSlot(otherImageId, fromSlotId)

      templateSlotToImageId.value[toSlotId] = item.id
      templateImageIdToSlotId.value[item.id] = toSlotId
      snapImageToSlot(item.id, toSlotId)
    })
  }

  const removeImageInternal = (imageId: string) => {
    const index = images.value.findIndex(img => img.id === imageId)
    if (index === -1) {
      logWarning('图片不存在', { imageId })
      return
    }

    const slotId = templateImageIdToSlotId.value[imageId]
    if (slotId) {
      delete templateImageIdToSlotId.value[imageId]
      if (templateSlotToImageId.value[slotId] === imageId)
        delete templateSlotToImageId.value[slotId]
    }

    const item = images.value[index]
    if (item && item.element) {
      group.value?.remove(item.element)
      item.element.destroy?.()
    }

    images.value.splice(index, 1)
    logInfo('图片已移除', { imageId })
  }

  /**
   * 初始化 Leafer 画布
   */
  const init = async () => {
    if (!import.meta.client) {
      logWarning('LeaferJS 只能在客户端环境中初始化')
      return
    }

    if (!containerRef.value) {
      logError('容器元素不存在')
      return
    }

    try {
      isLoading.value = true
      const { App, Group } = await import('leafer-ui')
      const { Editor } = await import('@leafer-in/editor')
      await import('@leafer-in/view')
      await import('@leafer-in/export')

      // 创建 App 应用（分层架构）
      app.value = new App({
        view: containerRef.value,
        fill: 'transparent',
        tree: {
          type: 'design', // 设计模式
          fill: 'transparent', // 透明填充，显示底层网格
        },
        sky: {}, // sky 层：编辑器层
      })

      // 初始化尺寸（确保导出背景有正确宽高）
      {
        const { width, height } = getContainerSize()
        if (width > 0 && height > 0) {
          app.value.width = width
          app.value.height = height
        }
      }

      // 画布内缩放/拖拽（pan/zoom）
      // - 缩放：滚轮缩放（以鼠标点为中心，依赖 @leafer-in/view 的 zoomLayer）
      // - 平移：Space + 左键拖拽 或 中键拖拽
      keyDownHandler = (e: KeyboardEvent) => {
        if (e.code === 'Space')
          isSpacePressed = true
      }
      keyUpHandler = (e: KeyboardEvent) => {
        if (e.code === 'Space')
          isSpacePressed = false
      }
      window.addEventListener('keydown', keyDownHandler)
      window.addEventListener('keyup', keyUpHandler)

      wheelHandler = (e: WheelEvent) => {
        if (!app.value || !containerRef.value)
          return

        // 防止页面滚动，保证在画布内缩放
        e.preventDefault()

        const zoomLayer: any = (app.value as any).zoomLayer
        if (!zoomLayer)
          return

        const rect = containerRef.value.getBoundingClientRect()
        const point = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        }

        // deltaY > 0 缩小，deltaY < 0 放大
        const baseFactor = e.deltaY < 0 ? 1.1 : 0.9
        const factor = (app.value as any).getValidScale?.(baseFactor) ?? baseFactor

        try {
          zoomLayer.scaleOfWorld(point, factor, factor, false)
        }
        catch {
          // ignore
        }
      }
      containerRef.value.addEventListener('wheel', wheelHandler, { passive: false, capture: true })

      pointerDownHandler = (e: PointerEvent) => {
        if (!app.value || !containerRef.value)
          return

        const isMiddleButton = e.button === 1
        const isSpaceLeft = e.button === 0 && isSpacePressed
        if (!isMiddleButton && !isSpaceLeft)
          return

        const zoomLayer: any = (app.value as any).zoomLayer
        if (!zoomLayer)
          return

        e.preventDefault()
        e.stopPropagation()
        ;(e as any).stopImmediatePropagation?.()
        isPanning = true
        panPointerId = e.pointerId
        panStartClientX = e.clientX
        panStartClientY = e.clientY
        panStartViewX = Number(zoomLayer.__?.x) || 0
        panStartViewY = Number(zoomLayer.__?.y) || 0

        try {
          containerRef.value.setPointerCapture(e.pointerId)
        }
        catch {
          // ignore
        }
      }

      pointerMoveHandler = (e: PointerEvent) => {
        if (!isPanning || panPointerId !== e.pointerId)
          return
        if (!app.value)
          return

        const zoomLayer: any = (app.value as any).zoomLayer
        if (!zoomLayer)
          return

        e.preventDefault()
        e.stopPropagation()
        ;(e as any).stopImmediatePropagation?.()

        const dx = e.clientX - panStartClientX
        const dy = e.clientY - panStartClientY
        const nextX = panStartViewX + dx
        const nextY = panStartViewY + dy

        const scaleX = Number(zoomLayer.__?.scaleX) || 1
        const scaleY = Number(zoomLayer.__?.scaleY) || 1
        zoomLayer.set({ x: nextX, y: nextY, scaleX, scaleY })
      }

      pointerUpHandler = (e: PointerEvent) => {
        if (panPointerId !== e.pointerId)
          return
        e.preventDefault()
        e.stopPropagation()
        ;(e as any).stopImmediatePropagation?.()
        isPanning = false
        panPointerId = null
        try {
          containerRef.value?.releasePointerCapture(e.pointerId)
        }
        catch {
          // ignore
        }
      }

      containerRef.value.addEventListener('pointerdown', pointerDownHandler, { capture: true })
      containerRef.value.addEventListener('pointermove', pointerMoveHandler, { capture: true })
      containerRef.value.addEventListener('pointerup', pointerUpHandler, { capture: true })
      containerRef.value.addEventListener('pointercancel', pointerUpHandler, { capture: true })

      // 自适应容器变化：更新画布尺寸，并在模板布局下重算格子
      resizeObserver = new ResizeObserver(() => {
        if (!app.value || !containerRef.value)
          return

        const { width, height } = getContainerSize()
        if (width > 0 && height > 0) {
          app.value.width = width
          app.value.height = height
          ;(app.value as any).updateClientBounds?.()
          if (!activeTemplate.value)
            setExportFrameRect({ x: 0, y: 0, width, height })
        }
      })
      resizeObserver.observe(containerRef.value)

      // 添加网格背景到 ground 层
      if (app.value.ground) {
        const { Rect } = await import('leafer-ui')
        const gridSize = 20
        const gridColor = '#e5e5e5'

        // 创建网格图案（简单的点阵）
        for (let x = 0; x < 2000; x += gridSize) {
          for (let y = 0; y < 2000; y += gridSize) {
            const dot = new Rect({
              x,
              y,
              width: 1,
              height: 1,
              fill: gridColor,
            })
            app.value.ground.add(dot)
          }
        }
      }

      // 导出容器（Box：背景 + 裁剪边界 + 容器）
      const { Box } = await import('leafer-ui')

      const { width: bgW, height: bgH } = getContainerSize()
      exportFrame.value = new Box({
        x: 0,
        y: 0,
        width: bgW || app.value.width || 0,
        height: bgH || app.value.height || 0,
        fill: templateStyle.value.backgroundColor,
        cornerRadius: templateStyle.value.radius,
        overflow: 'hide',
      } as any)
      app.value.tree.add(exportFrame.value)
      setExportFrameRect({ x: 0, y: 0, width: bgW || app.value.width || 0, height: bgH || app.value.height || 0 })

      // 模板占位层（在图片层下方）
      layoutLayer.value = new Group()
      ;(layoutLayer.value as any).hittable = false
      exportFrame.value.add(layoutLayer.value)

      // 图片层
      group.value = new Group()
      exportFrame.value.add(group.value)

      // 创建编辑器并添加到 sky 层
      editor.value = new Editor()
      app.value.sky.add(editor.value)

      isReady.value = true
      logInfo('LeaferJS App 和编辑器初始化成功')
    }
    catch (error) {
      logError('Leafer 初始化失败', { error })
      throw error
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * 添加图片到画布
   */
  const addImage = async (url: string, x = 0, y = 0, width?: number, height?: number): Promise<ImageItem | null> => {
    if (!group.value) {
      logError('画布未初始化')
      return null
    }

    try {
      const { Image } = await import('leafer-ui')

      // 1. 先用原生 Image 获取图片实际尺寸
      const { width: naturalWidth, height: naturalHeight } = await new Promise<{ width: number, height: number }>((resolve, reject) => {
        const img = new window.Image()
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
        img.onerror = () => reject(new Error('图片加载失败'))
        img.src = url
      })

      // 2. 计算缩放尺寸（最大宽度 300px）
      const maxWidth = 300
      let finalWidth = naturalWidth
      let finalHeight = naturalHeight

      if (naturalWidth > maxWidth) {
        const scale = maxWidth / naturalWidth
        finalWidth = maxWidth
        finalHeight = naturalHeight * scale

        logInfo('图片将被缩放', {
          original: `${naturalWidth}x${naturalHeight}`,
          scaled: `${Math.round(finalWidth)}x${Math.round(finalHeight)}`,
          scale: scale.toFixed(2),
        })
      }

      const displayWidth = width || finalWidth
      const displayHeight = height || finalHeight

      // 3. 先创建 Image（不带 url），避免极快资源触发事件竞态
      const imageElement = new Image({
        x,
        y,
        width: displayWidth,
        height: displayHeight,
        editable: true,
        draggable: true,
      } as any)

      // 4. 先加入画布和响应式状态（避免“暂无图片”闪烁；UI 更快反馈）
      group.value.add(imageElement)
      const item: ImageItem = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        url,
        x,
        y,
        width: displayWidth,
        height: displayHeight,
        element: imageElement,
      }
      images.value.push(item)

      // 绑定模板拖拽规则（若启用模板）
      void bindTemplateDragHandlers(item)

      // 5. 后台等待加载完成（不阻塞 UI）
      void (async () => {
        try {
          const timeoutId = setTimeout(() => {
            logWarning('图片加载超时（继续等待中）', { url, id: item.id })
          }, 5000)

          await new Promise<void>((resolve, reject) => {
            if (imageElement.ready) {
              resolve()
              return
            }

            imageElement.once('loaded', () => resolve())
            imageElement.once('error', (e: any) => reject(e?.error || e))
          })

          clearTimeout(timeoutId)
          logInfo('图片加载完成', { url, id: item.id })
        }
        catch (e: any) {
          logError('图片加载失败', { url, id: item.id, error: e })
          // 若加载失败，移除占位元素
          removeImageInternal(item.id)
        }
      })()

      // 6. 最后再设置 url 触发加载
      imageElement.url = url

      logInfo('图片已添加到画布（立即可见）', {
        id: item.id,
        width: item.width,
        height: item.height,
        totalImages: images.value.length,
      })

      return item
    }
    catch (error) {
      logError('添加图片失败', { url, error })
      return null
    }
  }

  /**
   * 批量添加图片
   */
  const addImages = async (urls: string[]): Promise<ImageItem[]> => {
    logInfo('开始批量添加图片', { count: urls.length })
    const results = await Promise.all(urls.map(url => addImage(url)))
    const items = results.filter(Boolean) as ImageItem[]
    logInfo('批量添加完成', {
      loadedCount: items.length,
      totalImagesInState: images.value.length,
    })
    return items
  }

  /**
   * 移除图片
   */
  const removeImage = (imageId: string) => {
    removeImageInternal(imageId)
  }

  /**
   * 清空所有图片
   */
  const clear = () => {
    images.value.forEach((item) => {
      if (item && item.element) {
        group.value?.remove(item.element)
        item.element.destroy?.()
      }
    })
    images.value = []
    clearTemplate()
    logInfo('画布已清空')
  }

  function getContainerSize() {
    const el = containerRef.value
    if (!el)
      return { width: 0, height: 0 }
    const rect = el.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }

  const clientToWorldPoint = (clientX: number, clientY: number): { x: number, y: number } | null => {
    if (!app.value)
      return null
    try {
      const p = (app.value as any).getWorldPointByClient?.({ x: clientX, y: clientY }, true)
      if (p && typeof p.x === 'number' && typeof p.y === 'number')
        return { x: p.x, y: p.y }
    }
    catch {
      // ignore
    }
    return null
  }

  async function renderTemplatePlaceholders() {
    if (!layoutLayer.value)
      return
    const { Rect } = await import('leafer-ui')

    // 清理旧占位
    templateSlots.value.forEach((slot) => {
      if (slot.placeholder) {
        layoutLayer.value?.remove(slot.placeholder)
        slot.placeholder.destroy?.()
        slot.placeholder = undefined
      }
    })

    const gridColor = '#e5e5e5'
    for (const slot of templateSlots.value) {
      const rect = new Rect({
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        fill: 'transparent',
        stroke: gridColor,
        strokeWidth: 1,
        radius: templateStyle.value.radius,
      } as any)
      layoutLayer.value.add(rect)
      slot.placeholder = rect
    }
  }

  const applyTemplate = async (
    template: CanvasTemplate,
    options: { reflowExisting?: boolean, removeOverflow?: boolean } = {},
  ) => {
    if (!app.value || !group.value)
      return

    const reflowExisting = options.reflowExisting ?? true
    const removeOverflow = options.removeOverflow ?? true

    // 切换模板时：按“当前模板槽位顺序”优先保留图片（支持拖拽换序后的顺序）
    const existingImageIds: string[] = []
    const seen = new Set<string>()
    if (activeTemplate.value && templateSlots.value.length) {
      const slotsInOrder = [...templateSlots.value].sort((a, b) => a.order - b.order)
      for (const slot of slotsInOrder) {
        const id = templateSlotToImageId.value[slot.id]
        if (id && !seen.has(id)) {
          existingImageIds.push(id)
          seen.add(id)
        }
      }
    }

    for (const img of images.value) {
      if (!seen.has(img.id)) {
        existingImageIds.push(img.id)
        seen.add(img.id)
      }
    }

    clearTemplate()
    activeTemplate.value = template

    const { width: frameW, height: frameH, slots } = computeTemplateLayout(template)
    setExportFrameRect({ width: frameW, height: frameH })
    centerExportFrameInView()

    templateSlots.value = slots

    await renderTemplatePlaceholders()

    if (reflowExisting) {
      const slotsInOrder = [...templateSlots.value].sort((a, b) => a.order - b.order)
      const keepCount = slotsInOrder.length

      // 先把前 N 张图排到新格子
      for (let i = 0; i < Math.min(existingImageIds.length, keepCount); i++) {
        const imageId = existingImageIds[i]
        const item = images.value.find(img => img.id === imageId)
        const slot = slotsInOrder[i]
        if (!item?.id)
          continue
        if (!slot)
          continue

        templateSlotToImageId.value[slot.id] = item.id
        templateImageIdToSlotId.value[item.id] = slot.id
        snapImageToSlot(item.id, slot.id)
        void bindTemplateDragHandlers(item)
      }

      // 再清除多余的图片
      if (removeOverflow && existingImageIds.length > keepCount) {
        for (let i = keepCount; i < existingImageIds.length; i++) {
          const id = existingImageIds[i]
          if (!id)
            continue
          removeImageInternal(id)
        }
      }
    }
  }

  const setTemplateStyle = async (partial: Partial<TemplateStyle>) => {
    templateStyle.value = {
      ...templateStyle.value,
      ...partial,
    }

    if (partial.backgroundColor)
      setBackgroundColor(templateStyle.value.backgroundColor)

    if (partial.radius !== undefined && exportFrame.value)
      exportFrame.value.set({ cornerRadius: templateStyle.value.radius } as any)

    await refreshTemplateLayout()
  }

  const fillTemplateWithUrls = async (
    urls: string[],
    options: { targetSlotId?: string } = {},
  ): Promise<ImageItem[]> => {
    if (!activeTemplate.value || !templateSlots.value.length)
      return []

    const slotsInOrder = [...templateSlots.value].sort((a, b) => a.order - b.order)
    const added: ImageItem[] = []

    const pickNextSlotId = () => {
      for (const slot of slotsInOrder) {
        if (!templateSlotToImageId.value[slot.id])
          return slot.id
      }
      return null
    }

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]
      if (!url)
        continue
      const slotId = options.targetSlotId || pickNextSlotId()
      if (!slotId)
        break

      const slot = templateSlots.value.find(s => s.id === slotId)
      if (!slot)
        continue

      const existingImageId = templateSlotToImageId.value[slotId]
      if (existingImageId)
        removeImageInternal(existingImageId)

      const item = await addImage(url, slot.x, slot.y, slot.width, slot.height)
      if (!item)
        continue

      templateSlotToImageId.value[slotId] = item.id
      templateImageIdToSlotId.value[item.id] = slotId
      snapImageToSlot(item.id, slotId)
      added.push(item)

      if (options.targetSlotId)
        break
    }

    return added
  }

  /**
   * 布局：网格排列
   */
  const layoutGrid = (columns = 2, gap = 10, padding = 20) => {
    if (!images.value.length)
      return

    let x = padding
    let y = padding
    let maxHeightInRow = 0
    let currentColumn = 0

    images.value.forEach((item) => {
      if (!item.element)
        return

      item.element.x = x
      item.element.y = y

      const itemWidth = item.width || 100
      const itemHeight = item.height || 100

      maxHeightInRow = Math.max(maxHeightInRow, itemHeight)
      currentColumn++

      if (currentColumn >= columns) {
        // 换行
        x = padding
        y += maxHeightInRow + gap
        maxHeightInRow = 0
        currentColumn = 0
      }
      else {
        x += itemWidth + gap
      }
    })

    logInfo('网格布局完成', { columns, gap })
  }

  /**
   * 布局：水平排列
   */
  const layoutHorizontal = (gap = 10, padding = 20) => {
    if (!images.value.length)
      return

    let x = padding
    const y = padding

    images.value.forEach((item) => {
      if (!item.element)
        return

      item.element.x = x
      item.element.y = y

      x += (item.width || 100) + gap
    })

    logInfo('水平布局完成', { gap })
  }

  /**
   * 布局：垂直排列
   */
  const layoutVertical = (gap = 10, padding = 20) => {
    if (!images.value.length)
      return

    const x = padding
    let y = padding

    images.value.forEach((item) => {
      if (!item.element)
        return

      item.element.x = x
      item.element.y = y

      y += (item.height || 100) + gap
    })

    logInfo('垂直布局完成', { gap })
  }

  /**
   * 应用布局
   */
  const applyLayout = (layout: CanvasLayout) => {
    switch (layout.type) {
      case 'grid':
        layoutGrid(layout.columns || 2, layout.gap || 10, layout.padding || 20)
        break
      case 'horizontal':
        layoutHorizontal(layout.gap || 10, layout.padding || 20)
        break
      case 'vertical':
        layoutVertical(layout.gap || 10, layout.padding || 20)
        break
      default:
        logWarning('未知布局类型', { type: layout.type })
    }
  }

  /**
   * 导出为图片
   */
  const exportAsImage = async (options: ExportOptions = {}): Promise<{ data: string | Blob, width: number, height: number } | null> => {
    const box = exportFrame.value
    if (!box) {
      logError('导出容器未初始化')
      return null
    }

    const prevGuideVisible = (layoutLayer.value as any)?.visible
    if (layoutLayer.value)
      (layoutLayer.value as any).visible = false

    try {
      const {
        filename = `canvas_${Date.now()}.png`,
        format = 'png',
        pixelRatio = 2,
      } = options

      // 导出为 Blob（二进制数据）
      const result = await box.export(format, {
        pixelRatio,
        blob: true, // 导出为 Blob
        relative: 'world',
      })

      if (!result.data) {
        throw new Error('导出数据为空')
      }

      // Tauri 环境：使用 fs 插件保存文件
      if (await isTauriRuntime()) {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeFile } = await import('@tauri-apps/plugin-fs')

        // 弹出保存对话框
        const savePath = await save({
          defaultPath: filename,
          filters: [{
            name: 'Image',
            extensions: [format],
          }],
        })

        if (savePath) {
          // 将 Blob 转换为 Uint8Array
          const blob = result.data as Blob
          const arrayBuffer = await blob.arrayBuffer()
          const uint8Array = new Uint8Array(arrayBuffer)

          // 写入文件
          await writeFile(savePath, uint8Array)
          logInfo('文件已保存', { path: savePath })

          return {
            data: savePath,
            width: result.width || 0,
            height: result.height || 0,
          }
        }
        else {
          logInfo('用户取消保存')
          return null
        }
      }
      // 浏览器环境：使用传统下载方式
      else {
        const blob = result.data as Blob
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)

        logInfo('浏览器下载已触发', { filename })

        return {
          data: blob,
          width: result.width || 0,
          height: result.height || 0,
        }
      }
    }
    catch (error) {
      logError('导出失败', { error })
      return null
    }
    finally {
      if (layoutLayer.value)
        (layoutLayer.value as any).visible = prevGuideVisible ?? true
    }
  }

  /**
   * 导出为 Base64
   */
  const exportAsBase64 = async (format: 'png' | 'jpg' = 'png', pixelRatio = 2): Promise<string | null> => {
    const box = exportFrame.value
    if (!box) {
      logError('导出容器未初始化')
      return null
    }

    const prevGuideVisible = (layoutLayer.value as any)?.visible
    if (layoutLayer.value)
      (layoutLayer.value as any).visible = false

    try {
      // 不传文件名，返回 Base64
      const result = await box.export(format, { pixelRatio, relative: 'world' })

      return result.data as string
    }
    catch (error) {
      logError('导出 Base64 失败', { error })
      return null
    }
    finally {
      if (layoutLayer.value)
        (layoutLayer.value as any).visible = prevGuideVisible ?? true
    }
  }

  /**
   * 导出为 Blob（用于上传）
   */
  const exportAsBlob = async (format: 'png' | 'jpg' = 'png', pixelRatio = 2): Promise<Blob | null> => {
    const box = exportFrame.value
    if (!box) {
      logError('导出容器未初始化')
      return null
    }

    const prevGuideVisible = (layoutLayer.value as any)?.visible
    if (layoutLayer.value)
      (layoutLayer.value as any).visible = false

    try {
      // 第二个参数为 true 表示导出二进制
      const result = await box.export(format, { pixelRatio, blob: true, relative: 'world' })

      return result.data as Blob
    }
    catch (error) {
      logError('导出 Blob 失败', { error })
      return null
    }
    finally {
      if (layoutLayer.value)
        (layoutLayer.value as any).visible = prevGuideVisible ?? true
    }
  }

  /**
   * 获取画布尺寸（根据内容自适应）
   */
  const getCanvasSize = () => {
    const root = getExportRoot()
    if (!root)
      return { width: 0, height: 0 }

    const w = Number((exportFrame.value as any)?.width)
    const h = Number((exportFrame.value as any)?.height)
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
      return {
        width: Math.ceil(w),
        height: Math.ceil(h),
      }
    }

    const bounds = root.getBounds('box')
    return {
      width: Math.ceil(bounds.width),
      height: Math.ceil(bounds.height),
    }
  }

  /**
   * 设置画布大小
   */
  const setCanvasSize = (width: number, height: number) => {
    if (!app.value)
      return

    app.value.width = width
    app.value.height = height
    if (exportFrame.value)
      exportFrame.value.set({ width, height } as any)
    logInfo('画布尺寸已更新', { width, height })
  }

  /**
   * 销毁画布
   */
  const destroy = () => {
    clear()
    if (exportFrame.value) {
      exportFrame.value.destroy?.()
      exportFrame.value = null
    }
    if (editor.value) {
      editor.value.destroy()
      editor.value = null
    }
    if (app.value) {
      app.value.destroy()
      app.value = null
    }
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (wheelHandler && containerRef.value) {
      containerRef.value.removeEventListener('wheel', wheelHandler, { capture: true } as any)
      wheelHandler = null
    }
    if (pointerDownHandler && containerRef.value) {
      containerRef.value.removeEventListener('pointerdown', pointerDownHandler, { capture: true } as any)
      pointerDownHandler = null
    }
    if (pointerMoveHandler && containerRef.value) {
      containerRef.value.removeEventListener('pointermove', pointerMoveHandler, { capture: true } as any)
      pointerMoveHandler = null
    }
    if (pointerUpHandler && containerRef.value) {
      containerRef.value.removeEventListener('pointerup', pointerUpHandler, { capture: true } as any)
      containerRef.value.removeEventListener('pointercancel', pointerUpHandler, { capture: true } as any)
      pointerUpHandler = null
    }
    if (keyDownHandler) {
      window.removeEventListener('keydown', keyDownHandler)
      keyDownHandler = null
    }
    if (keyUpHandler) {
      window.removeEventListener('keyup', keyUpHandler)
      keyUpHandler = null
    }
    layoutLayer.value = null
    group.value = null
    isReady.value = false
    logInfo('画布已销毁')
  }

  // 自动初始化和清理
  onMounted(() => {
    if (import.meta.client) {
      init()
    }
  })

  onUnmounted(() => {
    destroy()
  })

  return {
    // 状态
    app,
    editor,
    group,
    layoutLayer,
    exportFrame,
    images,
    isReady,
    isLoading,

    // 模板布局
    activeTemplate,
    templateSlots,
    templateStyle,

    // 方法
    init,
    addImage,
    addImages,
    removeImage,
    clear,
    applyLayout,
    layoutGrid,
    layoutHorizontal,
    layoutVertical,
    exportAsImage,
    exportAsBase64,
    exportAsBlob,
    getCanvasSize,
    setCanvasSize,

    // 模板布局方法
    applyTemplate,
    fillTemplateWithUrls,
    getTemplateSlotIdAtPoint,
    clearTemplate,
    setTemplateStyle,
    setBackgroundColor,
    clientToWorldPoint,

    destroy,
  }
}
