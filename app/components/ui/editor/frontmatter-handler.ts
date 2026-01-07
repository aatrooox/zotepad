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
     * 设置 frontmatter（用于手动编辑）
     */
    setFrontmatter(frontmatter: string): void {
      cachedFrontmatter = frontmatter
    },

    /**
     * 清空 frontmatter 缓存
     */
    clear(): void {
      cachedFrontmatter = ''
    },
  }
}
