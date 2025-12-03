// 微信公众号允许的标签白名单
const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'blockquote',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'span',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'del',
  'a',
  'img',
  'br',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'section',
  'div', // div 会被转换为 section
  'figure',
  'figcaption',
]

// 允许的属性白名单
const ALLOWED_ATTRS: Record<string, string[]> = {
  '*': ['style'],
  'img': ['src', 'alt', 'width', 'height', 'data-src', 'data-ratio', 'data-w'],
  'a': ['href', 'target', 'title'],
  'th': ['colspan', 'rowspan', 'align'],
  'td': ['colspan', 'rowspan', 'align'],
}

// 需要提取的 CSS 属性白名单 (合并了 demo 中的 EffectCssAttrs)
const STYLE_WHITELIST = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'color',
  'text-align',
  'line-height',
  'text-decoration',
  'background-color',
  'background-image',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-width',
  'border-style',
  'border-radius',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  // 'display', // 移除 display，防止 flex 布局复制导致缺少对齐属性错乱
  'width',
  'max-width',
  // 'height', // 移除 height，防止高度固定导致内容溢出
  'list-style-type',
  'list-style-position',
  'white-space',
  'word-break',
  'overflow-x',
  // 'vertical-align', // 移除 vertical-align，防止基线对齐问题
  'box-sizing',
  'text-size-adjust', // demo
]

// 排除的类名
const EXCLUDE_CLASS_LIST = [
  'copy-button',
  'md-editor-code-action',
  'md-editor-icon',
  'md-editor-katex-inline', // 不支持 kateX 公式导出
  'md-editor-katex-block',
  // 'not-prose', // 排除不需要样式的元素
]

// 驼峰转连字符
// const camelCaseToHyphen = (str: string) => {
//   return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
// }

// 缓存
// const htmlCache: Record<string, Record<string, string>> = {}
// const styleValueCache: Record<string, string> = {}

interface LinkReference {
  text: string
  url: string
}

/**
 * 生成自定义的上标 HTML (用于替代 sup 标签)
 */
function getSupHtml(content: string): string {
  // 微信公众号不支持伪元素(inline style无法定义)，且 position: relative 兼容性不佳
  // 改用 vertical-align: super 配合 line-height: 0
  return `<span style="font-size: 0.75em; vertical-align: super; line-height: 0; margin: 0 2px;">${content}</span>`
}

/**
 * 获取单个 DOM 的带内联样式的 HTML (所见即所得模式)
 */
function getOneDomCssStyle(node: Node, references: LinkReference[] = [], targetStyles?: string[]): string {
  if (!node)
    return ''

  // 文本节点
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue || ''
  }

  // 注释节点
  if (node.nodeType === Node.COMMENT_NODE) {
    return ''
  }

  // 只处理元素节点
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const el = node as HTMLElement
  const tagName = el.tagName.toLowerCase()

  // 任务列表 checkbox 处理
  if (tagName === 'input' && (el.getAttribute('type') === 'checkbox' || el.classList.contains('task-list-item-checkbox'))) {
    const isChecked = el.hasAttribute('checked') || (el as HTMLInputElement).checked
    // 使用 emoji 替代 checkbox
    // 强制使用 inline-block 并微调位置，确保在 flex 容器中也能正常显示
    // 使用 center 对齐
    return `<span style="display: inline-block; margin-right: 6px; line-height: 1; font-size: 1.1em;">${isChecked ? '✅' : '⬜'}</span>`
  }

  // sup 标签处理 (使用自定义样式替代)
  if (tagName === 'sup') {
    // 递归处理子元素以保留内部样式
    let childrenHtml = ''
    if (el.hasChildNodes()) {
      Array.from(el.childNodes).forEach((child) => {
        childrenHtml += getOneDomCssStyle(child, references)
      })
    }
    else {
      childrenHtml = el.innerHTML
    }
    return getSupHtml(childrenHtml)
  }

  // Mermaid 图表处理 (转为图片)
  if (el.classList.contains('md-editor-mermaid')) {
    try {
      const svg = el.querySelector('svg')
      if (svg) {
        // 获取 SVG 的实际渲染宽度，避免图片过大
        const rect = svg.getBoundingClientRect()
        const width = rect.width

        const serializer = new XMLSerializer()
        const svgString = serializer.serializeToString(svg)
        // 处理 Unicode 字符
        const base64 = window.btoa(unescape(encodeURIComponent(svgString)))
        const imgSrc = `data:image/svg+xml;base64,${base64}`

        // 设置宽度样式，如果获取到了有效宽度
        const widthStyle = width ? `width: ${width}px;` : ''
        return `<img src="${imgSrc}" style="display: block; margin: 10px auto; max-width: 100%; ${widthStyle} height: auto;" />`
      }
    }
    catch (e) {
      console.error('Mermaid SVG conversion failed:', e)
    }
  }

  // 忽略无效标签
  if (['script', 'style', 'button', 'link', 'meta', 'input', 'textarea', 'select'].includes(tagName)) {
    return ''
  }

  // 检查排除的 class
  if (el.classList && Array.from(el.classList).some(c => EXCLUDE_CLASS_LIST.includes(c))) {
    return ''
  }

  // 标签过滤
  let outTagName = tagName
  if (!ALLOWED_TAGS.includes(tagName)) {
    if (el.hasChildNodes()) {
      let childrenHtml = ''
      Array.from(el.childNodes).forEach((child) => {
        childrenHtml += getOneDomCssStyle(child, references)
      })
      return childrenHtml
    }
    return ''
  }

  // div -> section
  if (outTagName === 'div') {
    outTagName = 'section'
  }

  // 链接处理 (a -> span + sup)
  let linkSupHtml = ''
  if (outTagName === 'a') {
    const href = el.getAttribute('href')
    // 简单的外部链接判断 (包含 http 且不是锚点)
    if (href && (href.startsWith('http') || href.startsWith('//'))) {
      const text = el.textContent || ''
      references.push({ text, url: href })
      const index = references.length
      linkSupHtml = getSupHtml(`[${index}]`)
      // 将 a 标签转换为 span，保留样式但移除链接功能
      outTagName = 'span'
    }
  }
  // 获取计算样式
  const computedStyle = window.getComputedStyle(el)
  const styles: string[] = []

  // 确定要提取的属性列表
  const attrsToExtract = (targetStyles && targetStyles.length > 0) ? targetStyles : [...STYLE_WHITELIST]

  // 特殊处理：对于任务列表项、代码块头部、代码块内容，保留 display 属性以维持布局
  if (el.classList.contains('task-list-item')
    || el.classList.contains('md-editor-code-head')
    || el.classList.contains('md-editor-code-head-dots')
    || tagName === 'pre'
    || tagName === 'code') {
    if (!attrsToExtract.includes('display'))
      attrsToExtract.push('display')
    if (!attrsToExtract.includes('align-items'))
      attrsToExtract.push('align-items')
    if (!attrsToExtract.includes('justify-content'))
      attrsToExtract.push('justify-content')
    if (!attrsToExtract.includes('flex-direction'))
      attrsToExtract.push('flex-direction')
    if (!attrsToExtract.includes('flex-wrap'))
      attrsToExtract.push('flex-wrap')
  }

  // 特殊处理：代码块头部的圆点需要 height 和 width
  const parent = el.parentElement
  const isCodeHeadDot = parent && parent.classList.contains('md-editor-code-head-dots') && tagName === 'span'
  if (isCodeHeadDot) {
    if (!attrsToExtract.includes('height'))
      attrsToExtract.push('height')
    if (!attrsToExtract.includes('width'))
      attrsToExtract.push('width')
    if (!attrsToExtract.includes('display'))
      attrsToExtract.push('display')
    if (!attrsToExtract.includes('margin-right'))
      attrsToExtract.push('margin-right')
  }

  attrsToExtract.forEach((attr) => {
    const camelAttr = attr.replace(/-([a-z])/g, g => (g[1] ? g[1].toUpperCase() : ''))
    let value = computedStyle[camelAttr as any]

    // 过滤无效值
    if (!value || value === 'initial' || value === 'none' || value === 'normal' || value === 'auto') {
      // 保留 display 的特殊情况
      if (attr === 'display') {
        // 忽略默认的 display
      }
      else {
        // 颜色透明忽略
        if (value === 'rgba(0, 0, 0, 0)')
          return
        // 0px 忽略
        if (value === '0px')
          return
        // 过滤 border: 0px ...
        if (attr.startsWith('border') && value && value.startsWith('0px') && attr !== 'border-radius')
          return
      }
    }

    // 强制保留的属性 (demo 逻辑)
    if (outTagName === 'pre') {
      if (attr === 'white-space')
        value = 'pre-wrap'
      if (attr === 'word-break')
        value = 'break-all'
      if (attr === 'overflow-x')
        value = 'auto'
    }

    if (value) {
      styles.push(`${attr}:${value}`)
    }
  })

  // 修正：微信公众号对 margin 支持不佳，尝试将块级元素的垂直 margin 转换为 padding
  // 这样可以避免 margin 合并问题，以及部分情况下 margin 失效导致的内容挤压
  // if (['p', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].includes(outTagName)) {
  //   const newStyles: string[] = []
  //   styles.forEach((s) => {
  //     if (s.startsWith('margin-top:')) {
  //       newStyles.push(s.replace('margin-top:', 'padding-top:'))
  //     }
  //     else if (s.startsWith('margin-bottom:')) {
  //       newStyles.push(s.replace('margin-bottom:', 'padding-bottom:'))
  //     }
  //     else {
  //       newStyles.push(s)
  //     }
  //   })
  //   styles.length = 0
  //   styles.push(...newStyles)
  // }

  // 列表特殊处理 (ul/ol)
  if (outTagName === 'ul' || outTagName === 'ol') {
    // 确保有上下间距 (使用 padding)
    if (!styles.some(s => s.startsWith('padding-top:'))) {
      styles.push('padding-top: 8px')
    }
    if (!styles.some(s => s.startsWith('padding-bottom:'))) {
      styles.push('padding-bottom: 8px')
    }
    // 确保左侧有内边距
    if (!styles.some(s => s.startsWith('padding-left:'))) {
      styles.push('padding-left: 20px')
    }
  }

  // 列表项特殊处理 (li)
  if (outTagName === 'li') {
    if (!styles.some(s => s.startsWith('padding-bottom:'))) {
      styles.push('padding-bottom: 4px')
    }
    // 强制移除 list-style，防止任务列表出现双重标记
    if (el.classList.contains('task-list-item')) {
      styles.push('list-style: none')

      // 强制 Flex 布局
      // 先移除可能存在的 display (比如 block)
      const displayIdx = styles.findIndex(s => s.startsWith('display:'))
      if (displayIdx > -1)
        styles.splice(displayIdx, 1)
      styles.push('display: flex')

      if (!styles.some(s => s.startsWith('align-items:'))) {
        styles.push('align-items: center')
      }
    }
  }

  // 图片特殊处理
  if (outTagName === 'img') {
    styles.push('max-width: 100% !important')
    styles.push('height: auto !important')
    if (!styles.some(s => s.startsWith('display:'))) {
      styles.push('display: block')
      styles.push('margin: 10px auto')
    }
  }

  const styleStr = styles.join(';')

  // 递归处理子元素
  let childrenHtml = ''
  if (el.childNodes && el.childNodes.length > 0) {
    Array.from(el.childNodes).forEach((child) => {
      // 针对 pre/code 的子元素进行样式精简，防止污染
      // 如果当前是 pre，子元素只保留颜色等基本属性？
      // demo 逻辑：child.tagName === 'pre' ? ['color'] : []
      // 这里我们采用更智能的策略：如果父级是 pre/code，子级 span (通常是高亮) 只保留颜色和字体样式
      let childTargetStyles: string[] | undefined
      if (['pre', 'code'].includes(outTagName) && child.nodeName === 'SPAN') {
        childTargetStyles = ['color', 'font-weight', 'font-style', 'text-decoration', 'background-color']
      }

      childrenHtml += getOneDomCssStyle(child, references, childTargetStyles)
    })
  }
  else {
    // 如果没有子节点 (可能是空标签，或者某些特殊情况)，尝试使用 innerHTML 作为兜底
    // 注意：这可能会导致内部标签没有被内联样式处理，但至少能保留内容
    if (el.innerHTML) {
      childrenHtml = el.innerHTML
    }
  }

  // 组装属性
  const attrs: string[] = []
  if (styleStr) {
    // 修复 font-family 等可能包含双引号导致 style 属性截断的问题
    const safeStyleStr = styleStr.replace(/"/g, '\'')
    attrs.push(`style="${safeStyleStr}"`)
  }

  const allowedForTag = ALLOWED_ATTRS[outTagName] || []
  const globalAllowed = ALLOWED_ATTRS['*'] || []
  const allAllowed = new Set([...allowedForTag, ...globalAllowed])

  Array.from(el.attributes).forEach((attr) => {
    if (allAllowed.has(attr.name)) {
      if (attr.name === 'style')
        return
      attrs.push(`${attr.name}="${attr.value}"`)
    }
  })

  if (['img', 'br', 'hr'].includes(outTagName)) {
    return `<${outTagName} ${attrs.join(' ')} />`
  }

  // 如果是链接，在内容后面追加上标
  return `<${outTagName} ${attrs.join(' ')}>${childrenHtml}</${outTagName}>${linkSupHtml}`
}

/**
 * 生成微信公众号格式的 HTML
 */
export const getWeChatStyledHTML = (rootEl: HTMLElement): string => {
  if (!rootEl)
    return ''

  // 清空缓存 (如果启用了缓存)
  // htmlCache = {}
  // styleValueCache = {}

  // 外层容器样式
  const containerStyle = `
    padding: 20px 16px;
    background-image: linear-gradient(90deg, rgba(50, 0, 0, 0.05) 3%, rgba(0, 0, 0, 0) 3%), linear-gradient(360deg, rgba(50, 0, 0, 0.05) 3%, rgba(0, 0, 0, 0) 3%);
    background-size: 20px 20px;
    background-position: center center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 16px;
    color: #333;
    word-wrap: break-word;
  `.replace(/\s+/g, ' ').trim()

  const references: LinkReference[] = []
  let contentHtml = ''
  Array.from(rootEl.childNodes).forEach((child) => {
    contentHtml += getOneDomCssStyle(child, references)
  })

  // 生成相关链接部分
  let referencesHtml = ''
  if (references.length > 0) {
    const refList = references.map((ref, index) => {
      return `<li style="margin-bottom: 5px;">[${index + 1}] ${ref.text}: ${ref.url}</li>`
    }).join('')

    referencesHtml = `
      <section style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">相关链接</h3>
        <ul style="font-size: 14px; color: #666; padding-left: 20px; margin: 0;">
          ${refList}
        </ul>
      </section>
    `
  }

  const footer = `
    <section style="margin-top: 32px; text-align: center; font-size: 12px; color: #999;">
      <p style="margin: 0;">Powered by ZotePad</p>
    </section>
  `

  return `<section style="${containerStyle}">${contentHtml}${referencesHtml}${footer}</section>`
}

/**
 * 复制 HTML 到剪贴板 (使用 ClipboardItem 以支持富文本)
 */
export const copyToClipboard = async (html: string) => {
  try {
    const blobHtml = new Blob([html], { type: 'text/html' })
    const blobText = new Blob([html], { type: 'text/plain' })
    const item = new ClipboardItem({
      'text/html': blobHtml,
      'text/plain': blobText,
    })
    await navigator.clipboard.write([item])
    return true
  }
  catch (e) {
    console.error('Copy failed:', e)
    return false
  }
}
