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
  'display',
  'width',
  'max-width',
  'height',
  'list-style-type',
  'list-style-position',
  'white-space',
  'word-break',
  'overflow-x',
  'vertical-align',
  'box-sizing',
  'text-size-adjust', // demo
]

// 排除的类名
const EXCLUDE_CLASS_LIST = [
  'copy-button',
  'md-editor-code-action',
  'md-editor-icon',
  // 'not-prose', // 排除不需要样式的元素
]

// 驼峰转连字符
// const camelCaseToHyphen = (str: string) => {
//   return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
// }

// 缓存
// const htmlCache: Record<string, Record<string, string>> = {}
// const styleValueCache: Record<string, string> = {}

/**
 * 获取单个 DOM 的带内联样式的 HTML (所见即所得模式)
 */
function getOneDomCssStyle(node: Node, targetStyles?: string[]): string {
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
    return `<span style="display: inline-block; margin-right: 4px; vertical-align: middle;">${isChecked ? '✅' : '⬜'}</span>`
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
        childrenHtml += getOneDomCssStyle(child)
      })
      return childrenHtml
    }
    return ''
  }

  // div -> section
  if (outTagName === 'div') {
    outTagName = 'section'
  }

  // 缓存检查 (基于 outerHTML，注意：如果 outerHTML 包含动态内容可能不准，但在静态渲染后通常没问题)
  // 为了准确性，这里只对没有子元素的简单元素做缓存，或者谨慎使用
  // demo 中是直接使用 outerHTML 做 key。
  // 这里为了稳妥，暂时不启用激进缓存，因为 outerHTML 包含 class，但我们可能需要重新计算 style

  // 获取计算样式
  const computedStyle = window.getComputedStyle(el)
  const styles: string[] = []

  // 确定要提取的属性列表
  const attrsToExtract = (targetStyles && targetStyles.length > 0) ? targetStyles : STYLE_WHITELIST

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

      childrenHtml += getOneDomCssStyle(child, childTargetStyles)
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

  return `<${outTagName} ${attrs.join(' ')}>${childrenHtml}</${outTagName}>`
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
    line-height: 1.8;
    color: #333;
    word-wrap: break-word;
  `.replace(/\s+/g, ' ').trim()

  let contentHtml = ''
  Array.from(rootEl.childNodes).forEach((child) => {
    contentHtml += getOneDomCssStyle(child)
  })

  const footer = `
    <section style="margin-top: 32px; text-align: center; font-size: 12px; color: #999;">
      <p style="margin: 0;">Powered by ZotePad</p>
    </section>
  `

  return `<section style="${containerStyle}">${contentHtml}${footer}</section>`
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
