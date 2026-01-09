/**
 * Frontmatter 预处理器
 * 用于在编辑器加载/保存时提取和恢复 YAML frontmatter
 * 
 * 原理：
 * - 加载时：提取 frontmatter，只把正文传给编辑器
 * - 保存时：将 frontmatter 拼接回正文开头
 */

export interface FrontmatterData {
  frontmatter: string // 原始 frontmatter 内容（不含 ---）
  content: string     // 正文内容
}

/**
 * Frontmatter 字段类型
 */
export interface FrontmatterFields {
  title?: string
  date?: string       // ISO 8601 格式
  lastmod?: string    // ISO 8601 格式
  tags?: string[]
  [key: string]: any  // 允许其他自定义字段
}

/**
 * 从 Markdown 文本中提取 frontmatter
 * @param markdown 完整的 Markdown 文本
 * @returns 分离后的 frontmatter 和正文
 */
export function extractFrontmatter(markdown: string): FrontmatterData {
  // 匹配文档开头的 YAML frontmatter
  // 支持 --- 或 *** 作为分隔符（Markdown 标准都支持）
  // 格式：(可选 BOM) + 开头分隔符 + 内容 + 结束分隔符
  const frontmatterRegex = /^(?:\uFEFF)?(?:---|[*]{3})\r?\n([\s\S]*?)\r?\n(?:---|[*]{3})\r?\n/

  const match = markdown.match(frontmatterRegex)

  if (match) {
    return {
      frontmatter: match[1] as string, // 提取 frontmatter 内容
      content: markdown.slice(match[0].length), // 提取正文
    }
  }

  // 没有 frontmatter
  return {
    frontmatter: '',
    content: markdown,
  }
}

/**
 * 将 frontmatter 和正文合并回完整的 Markdown
 * @param data 包含 frontmatter 和正文的对象
 * @returns 完整的 Markdown 文本
 */
export function combineFrontmatter(data: FrontmatterData): string {
  if (!data.frontmatter.trim()) {
    return data.content
  }

  return `---\n${data.frontmatter}\n---\n${data.content}`
}

/**
 * 简单的 YAML 解析器（仅支持基本字段）
 * @param yamlString YAML 字符串
 * @returns 解析后的对象
 */
export function parseYAML(yamlString: string): FrontmatterFields {
  const result: FrontmatterFields = {}
  
  if (!yamlString.trim()) {
    return result
  }

  const lines = yamlString.split('\n')
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    // 匹配 key: value 格式
    const match = trimmed.match(/^([^:]+):\s*(.*)$/)
    if (!match) {
      continue
    }

    const [, key, value] = match
    const cleanKey = (key ?? '').trim()
    let cleanValue = (value ?? '').trim()

    // 处理引号包裹的值
    if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
        (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
      cleanValue = cleanValue.slice(1, -1)
    }

    // 处理数组格式 [tag1, tag2]
    if (cleanValue.startsWith('[') && cleanValue.endsWith(']')) {
      const arrayContent = cleanValue.slice(1, -1)
      result[cleanKey] = arrayContent
        .split(',')
        .map(item => item.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    }
    else {
      result[cleanKey] = cleanValue
    }
  }

  return result
}

/**
 * 将字段对象转换为 YAML 字符串
 * @param fields 字段对象
 * @returns YAML 字符串
 */
export function stringifyYAML(fields: FrontmatterFields): string {
  const lines: string[] = []

  // 固定顺序：title, date, lastmod, tags, 其他字段
  const orderedKeys = ['title', 'date', 'lastmod', 'tags']
  const otherKeys = Object.keys(fields).filter(k => !orderedKeys.includes(k))

  for (const key of [...orderedKeys, ...otherKeys]) {
    const value = fields[key]
    if (value === undefined || value === null) {
      continue
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        lines.push(`${key}: [${value.map(v => `"${v}"`).join(', ')}]`)
      }
    }
    else {
      // 如果值包含特殊字符，需要引号
      const stringValue = String(value)
      if (stringValue.includes(':') || stringValue.includes('#')) {
        lines.push(`${key}: "${stringValue}"`)
      }
      else {
        lines.push(`${key}: ${stringValue}`)
      }
    }
  }

  return lines.join('\n')
}

/**
 * 更新 frontmatter 中的指定字段
 * @param yamlString 原始 YAML 字符串
 * @param updates 要更新的字段
 * @returns 更新后的 YAML 字符串
 */
export function updateFrontmatterFields(yamlString: string, updates: Partial<FrontmatterFields>): string {
  const parsed = parseYAML(yamlString)
  const merged = { ...parsed, ...updates }
  return stringifyYAML(merged)
}

/**
 * 创建一个 Frontmatter 处理器实例
 * 用于管理编辑器的 frontmatter 状态
 */
export function createFrontmatterHandler() {
  let cachedFrontmatter = ''

  return {
    /**
     * 准备 Markdown 用于编辑器加载
     * 提取并缓存 frontmatter，返回纯正文
     */
    prepareForEditor(markdown: string): string {
      const { frontmatter, content } = extractFrontmatter(markdown)
      console.log('📝 提取 frontmatter 长度:', frontmatter.length, '字符')
      console.log('📄 正文长度:', content.length, '字符')
      if (frontmatter) {
        console.log('✅ Frontmatter 已隐藏（首行）:', frontmatter.split('\n')[0])
      }
      cachedFrontmatter = frontmatter
      return content
    },

    /**
     * 准备 Markdown 用于保存
     * 将缓存的 frontmatter 与编辑器内容合并
     */
    prepareForSave(content: string): string {
      return combineFrontmatter({
        frontmatter: cachedFrontmatter,
        content,
      })
    },

    /**
     * 获取当前缓存的 frontmatter
     */
    getFrontmatter(): string {
      return cachedFrontmatter
    },

    /**
     * 获取解析后的 frontmatter 字段
     */
    getParsedFrontmatter(): FrontmatterFields {
      return parseYAML(cachedFrontmatter)
    },

    /**
     * 设置 frontmatter（用于手动编辑）
     */
    setFrontmatter(frontmatter: string): void {
      cachedFrontmatter = frontmatter
    },

    /**
     * 更新 frontmatter 字段
     */
    updateFields(updates: Partial<FrontmatterFields>): void {
      cachedFrontmatter = updateFrontmatterFields(cachedFrontmatter, updates)
    },

    /**
     * 清空 frontmatter 缓存
     */
    clear(): void {
      cachedFrontmatter = ''
    },
  }
}
