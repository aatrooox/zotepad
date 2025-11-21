import { readonly, ref } from 'vue'

interface NavBarConfig {
  title?: string
  showBackButton?: boolean
  leftIcon?: string
  leftAction?: () => void
  rightIcon?: string
  rightAction?: () => void
  backgroundColor?: string
  textColor?: string
  transparent?: boolean
  hideBorder?: boolean
}

const navBarConfig = ref<NavBarConfig>({})

export function useNavBar() {
  const setNavBar = (config: NavBarConfig) => {
    navBarConfig.value = { ...config }
  }

  const clearNavBar = () => {
    navBarConfig.value = {}
  }

  const setTitle = (title: string) => {
    navBarConfig.value.title = title
  }

  const setLeftButton = (icon: string, action: () => void) => {
    navBarConfig.value.leftIcon = icon
    navBarConfig.value.leftAction = action
  }

  const setRightButton = (icon: string, action: () => void) => {
    navBarConfig.value.rightIcon = icon
    navBarConfig.value.rightAction = action
  }

  const showBackButton = (show: boolean = true) => {
    navBarConfig.value.showBackButton = show
  }

  const setColors = (backgroundColor?: string, textColor?: string) => {
    if (backgroundColor) {
      navBarConfig.value.backgroundColor = backgroundColor
    }
    if (textColor) {
      navBarConfig.value.textColor = textColor
    }
  }

  const setTransparent = (transparent: boolean = true, hideBorder: boolean = true) => {
    navBarConfig.value.transparent = transparent
    navBarConfig.value.hideBorder = hideBorder
    if (transparent) {
      navBarConfig.value.backgroundColor = 'bg-transparent'
    }
  }

  return {
    navBarConfig: readonly(navBarConfig),
    setNavBar,
    clearNavBar,
    setTitle,
    setLeftButton,
    setRightButton,
    showBackButton,
    setColors,
    setTransparent,
  }
}
