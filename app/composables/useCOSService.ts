import { useStorageService as useBaseStorageService } from './useStorageService'

// 重新导出 useStorageService 以保持兼容性
// 建议后续代码直接使用 useStorageService
export const useStorageService = useBaseStorageService
export const useCOSService = useBaseStorageService
