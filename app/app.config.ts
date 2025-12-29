/**
 * 应用配置
 * 包含积分系统、成就系统、画布编辑器等配置项
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

  /**
   * 画布编辑器配置
   */
  canvasEditor: {
    /**
     * 图片尺寸阈值配置
     * 用于判断是否使用原图尺寸进行拼接，平衡画质与性能
     * 设置为 0 表示不限制，始终使用原图尺寸（可能影响性能）
     */
    imageSizeThresholds: {
      // 单张图片阈值（用于单图或少量图片场景）
      single: {
        maxDimension: 3000, // 单边最大像素 (0 = 不限制)
        maxPixels: 9000000, // 总像素上限：900万像素 (0 = 不限制)
      },
      // 多张图片阈值（用于九宫格等多图场景）
      multiple: {
        maxDimension: 2000, // 单边最大像素 (0 = 不限制)
        maxPixels: 4000000, // 总像素上限：400万像素 (0 = 不限制)
      },
      // 九宫格总尺寸限制（防止内存溢出）
      total: {
        maxDimension: 15000, // 拼接后单边最大像素 (0 = 不限制)
        maxPixels: 100000000, // 拼接后总像素上限：1亿像素 (0 = 不限制)
      },
    },

    /**
     * 模板布局高清尺寸配置
     * 当图片符合阈值时，使用以下高清尺寸替代默认尺寸
     */
    templateSizes: {
      nineGrid: 600, // 九宫格每格尺寸（默认 200）
      wechatCoverHeight: 900, // 公众号封面高度（默认 300）
    },
  },
})
