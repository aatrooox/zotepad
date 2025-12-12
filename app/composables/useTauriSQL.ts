// Tauri SQL 基础服务（Infrastructure Layer）
// 仅负责数据库连接和基础 SQL 执行，不包含具体业务逻辑
import Database from '@tauri-apps/plugin-sql'
import { useAsyncState } from '~/utils/async'
import { useLog } from './useLog'

class DatabaseService {
  private db: Database | null = null
  private dbPath: string
  private logger = useLog()

  constructor(dbPath = 'sqlite:app_v3.db') {
    this.dbPath = dbPath
  }

  async init(): Promise<void> {
    if (!this.db) {
      this.db = await Database.load(this.dbPath)
      await this.logger.info('数据库连接成功', { tag: 'SQL' })
    }
  }

  private async ensureDB(): Promise<Database> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) {
      throw new Error('数据库初始化失败')
    }
    return this.db
  }

  async execute(query: string, bindValues?: unknown[]) {
    const db = await this.ensureDB()
    // await this.logger.info('Execute SQL', { tag: 'SQL', context: { query } })
    return await db.execute(query, bindValues)
  }

  async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
    const db = await this.ensureDB()
    return await db.select<T>(query, bindValues)
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
    }
  }
}

// 单例
const dbService = new DatabaseService()

export function useTauriSQL() {
  const isInitialized = ref(false)
  const { isLoading, error, runAsync } = useAsyncState()

  const initDatabase = async () => {
    if (isInitialized.value)
      return
    await runAsync(async () => {
      await dbService.init()
      isInitialized.value = true
    }, '数据库初始化失败')
  }

  const execute = (query: string, bindValues?: unknown[]) =>
    runAsync(() => dbService.execute(query, bindValues), 'SQL 执行失败')

  const select = <T>(query: string, bindValues?: unknown[]) =>
    runAsync(() => dbService.select<T>(query, bindValues), 'SQL 查询失败')

  const autoInit = async () => {
    if (import.meta.client && !isInitialized.value) {
      await initDatabase()
    }
  }

  return {
    isInitialized: readonly(isInitialized),
    isLoading,
    error,
    initDatabase,
    autoInit,
    execute,
    select,
  }
}
