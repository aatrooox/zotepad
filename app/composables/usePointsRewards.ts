/**
 * 积分奖励系统 Composable
 * 统一管理笔记、动态、资源的积分奖励逻辑
 */

import type { Asset, Moment, Note } from '~/types/models'

export function usePointsRewards() {
  const appConfig = useAppConfig()

  /**
   * 计算并添加笔记创建的积分奖励
   */
  const rewardNoteCreated = async (userId: number, noteId: number, content: string) => {
    const { usePointsSystem } = await import('./usePointsSystem')
    const { addPoints } = usePointsSystem()

    const config = appConfig.pointsRewards.note
    const wordCount = content.length

    console.log('[积分奖励] 笔记创建:', { userId, noteId, wordCount })

    // 基础积分奖励
    await addPoints(
      userId,
      'note',
      String(noteId),
      config.base.points,
      config.base.exp,
      '创建笔记',
    )

    // 字数奖励：每 N 字额外奖励
    if (wordCount > 0) {
      const wordBonus = Math.floor(wordCount / config.wordsPerBonus)
      if (wordBonus > 0) {
        await addPoints(
          userId,
          'note',
          String(noteId),
          wordBonus,
          wordBonus,
          `字数奖励 (${wordCount}字)`,
        )
      }
    }

    console.log('[积分奖励] 笔记积分已添加')
  }

  /**
   * 计算并添加动态创建的积分奖励
   */
  const rewardMomentCreated = async (userId: number, momentId: number, images: string[] = []) => {
    const { usePointsSystem } = await import('./usePointsSystem')
    const { addPoints } = usePointsSystem()

    const config = appConfig.pointsRewards.moment

    console.log('[积分奖励] 动态创建:', { userId, momentId, imageCount: images.length })

    // 基础积分奖励
    await addPoints(
      userId,
      'moment',
      String(momentId),
      config.base.points,
      config.base.exp,
      '发布动态',
    )

    // 图片奖励：每张图片额外奖励
    if (images.length > 0) {
      const imageBonus = images.length * config.perImage.points
      const imageExp = images.length * config.perImage.exp
      await addPoints(
        userId,
        'moment',
        String(momentId),
        imageBonus,
        imageExp,
        `图片奖励 (${images.length}张)`,
      )
    }

    console.log('[积分奖励] 动态积分已添加')
  }

  /**
   * 计算并添加资源上传的积分奖励
   */
  const rewardAssetUploaded = async (userId: number, assetId: number, mimeType?: string, size?: number) => {
    const { usePointsSystem } = await import('./usePointsSystem')
    const { addPoints } = usePointsSystem()

    const config = appConfig.pointsRewards.asset

    console.log('[积分奖励] 资源上传:', { userId, assetId, mimeType, size })

    // 基础积分奖励
    await addPoints(
      userId,
      'asset',
      String(assetId),
      config.base.points,
      config.base.exp,
      '上传资源',
    )

    // 大文件奖励：每 MB 额外奖励
    if (size && size > config.largeFileThreshold) {
      const sizeMB = Math.floor(size / config.largeFileThreshold)
      await addPoints(
        userId,
        'asset',
        String(assetId),
        sizeMB * config.perMB.points,
        sizeMB * config.perMB.exp,
        `大文件奖励 (${sizeMB}MB)`,
      )
    }

    console.log('[积分奖励] 资源积分已添加')
  }

  /**
   * 重新计算所有内容的积分奖励
   * 用于补全遗漏的积分（例如移动端创建的内容）
   */
  const recalculateAllPoints = async (userId: number) => {
    const { useTauriSQL } = await import('./useTauriSQL')
    const { select } = useTauriSQL()

    console.log('[积分奖励] 开始重新计算所有积分:', userId)

    try {
      // 1. 获取所有笔记（未删除且未记录积分的）
      const notes = await select<Array<{ id: number, content: string, created_at: string }>>(
        `SELECT id, content, created_at FROM notes 
         WHERE deleted_at IS NULL 
         AND id NOT IN (SELECT CAST(source_id AS INTEGER) FROM user_points_log WHERE user_id = ? AND source_type = 'note')
         ORDER BY created_at ASC`,
        [userId],
      )

      console.log('[积分奖励] 找到未记录积分的笔记', { count: notes.length })

      for (const note of notes) {
        await rewardNoteCreated(userId, note.id, note.content || '')
      }

      // 2. 获取所有动态（未删除且未记录积分的）
      const moments = await select<Array<{ id: number, images: string, created_at: string }>>(
        `SELECT id, images, created_at FROM moments 
         WHERE deleted_at IS NULL 
         AND id NOT IN (SELECT CAST(source_id AS INTEGER) FROM user_points_log WHERE user_id = ? AND source_type = 'moment')
         ORDER BY created_at ASC`,
        [userId],
      )

      console.log('[积分奖励] 找到未记录积分的动态:', moments.length)

      for (const moment of moments) {
        const images = moment.images ? JSON.parse(moment.images) : []
        await rewardMomentCreated(userId, moment.id, images)
      }

      // 3. 获取所有资源（未删除且未记录积分的）
      const assets = await select<Array<{ id: number, mime_type?: string, size?: number, created_at: string }>>(
        `SELECT id, mime_type, size, created_at FROM assets 
         WHERE deleted_at IS NULL 
         AND id NOT IN (SELECT CAST(source_id AS INTEGER) FROM user_points_log WHERE user_id = ? AND source_type = 'asset')
         ORDER BY created_at ASC`,
        [userId],
      )

      console.log('[积分奖励] 找到未记录积分的资源:', assets.length)

      for (const asset of assets) {
        await rewardAssetUploaded(userId, asset.id, asset.mime_type, asset.size)
      }

      const totalProcessed = notes.length + moments.length + assets.length
      console.log('[积分奖励] ✅ 重新计算完成:', totalProcessed)

      return {
        notes: notes.length,
        moments: moments.length,
        assets: assets.length,
        total: totalProcessed,
      }
    }
    catch (error) {
      console.error('[积分奖励] ❌ 重新计算失败:', error)
      throw error
    }
  }

  return {
    rewardNoteCreated,
    rewardMomentCreated,
    rewardAssetUploaded,
    recalculateAllPoints,
  }
}
