import { toast } from 'vue-sonner'

export interface ToastOptions {
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  cancel?: {
    label: string
    onClick?: () => void
  }
  id?: string | number
  dismissible?: boolean
  onDismiss?: (toast: any) => void
  onAutoClose?: (toast: any) => void
  duration?: number
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
  unstyled?: boolean
  actionButtonStyle?: Record<string, string>
  cancelButtonStyle?: Record<string, string>
  style?: Record<string, string>
  className?: string
  descriptionClassName?: string
  invert?: boolean
  important?: boolean
}

export function useToast() {
  /**
   * 显示成功消息
   */
  function success(message: string, options?: ToastOptions) {
    return toast.success(message, options)
  }

  /**
   * 显示错误消息
   */
  function error(message: string, options?: ToastOptions) {
    return toast.error(message, options)
  }

  /**
   * 显示警告消息
   */
  function warning(message: string, options?: ToastOptions) {
    return toast.warning(message, options)
  }

  /**
   * 显示信息消息
   */
  function info(message: string, options?: ToastOptions) {
    return toast.info(message, options)
  }

  /**
   * 显示普通消息
   */
  function message(message: string, options?: ToastOptions) {
    return toast(message, options)
  }

  /**
   * 显示加载消息
   */
  function loading(message: string, options?: ToastOptions) {
    return toast.loading(message, options)
  }

  /**
   * 显示自定义消息
   */
  function custom(jsx: any, options?: ToastOptions) {
    return toast.custom(jsx, options)
  }

  /**
   * 显示 Promise 消息
   */
  function promise<T>(
    promise: Promise<T>,
    msgs: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((error: any) => string)
    },
    // options?: ToastOptions,
  ) {
    return toast.promise(promise, msgs)
  }

  /**
   * 关闭指定的 toast
   */
  function dismiss(id?: string | number) {
    return toast.dismiss(id)
  }

  /**
   * 关闭所有 toast
   */
  function dismissAll() {
    return toast.dismiss()
  }

  return {
    success,
    error,
    warning,
    info,
    message,
    loading,
    custom,
    promise,
    dismiss,
    dismissAll,
    // 直接暴露 toast 对象，以防需要使用其他方法
    toast,
  }
}

// 默认导出，方便直接使用
export default useToast
