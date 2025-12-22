/**
 * 应用配置
 * 包含积分系统、成就系统等配置项
 */
export default defineAppConfig({
  /**
   * 积分奖励配置
   */
  pointsRewards: {
    // 笔记相关
    note: {
      base: {
        points: 10,
        exp: 5,
      },
      // 字数奖励：每 N 字获得 1 积分 1 经验
      wordsPerBonus: 100,
    },

    // 动态相关
    moment: {
      base: {
        points: 5,
        exp: 3,
      },
      // 图片奖励：每张图片的积分和经验
      perImage: {
        points: 2,
        exp: 1,
      },
    },

    // 资源相关
    asset: {
      base: {
        points: 3,
        exp: 2,
      },
      // 大文件奖励：每 MB 的积分和经验
      perMB: {
        points: 1,
        exp: 1,
      },
      // 大文件阈值（字节）
      largeFileThreshold: 1024 * 1024, // 1MB
    },
  },
})
