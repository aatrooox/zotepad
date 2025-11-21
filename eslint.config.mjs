// @ts-check
import antfu from '@antfu/eslint-config'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Your custom configs here
  {
    ignores: ['src-tauri/**', 'app/components/vue-bits/**'],
  },
  antfu({
    vue: {
      a11y: true,
    },
    typescript: true,
    formatters: {
      css: true,
      html: true,
      markdown: false,
    },
    ignores: ['app/components/ui/**', 'app/components/vue-bits/**', '**/*.md', 'src-tauri/**'],
  },
  // {
  //   files: ['*.vue'],
  //   plugins: {
  //     vue: pluginVue,
  //   },
  // },
  {
    ignores: ['app/components/ui/**', 'app/components/vue-bits/**', '**/*.md', 'src-tauri/**'],
    rules: {
      'ts/no-explicit-any': 'off',
      'no-console': 'off',
      'no-unreachable-loop': 'warn',
      'no-control-regex': 'warn',
      'vue-a11y/click-events-have-key-events': 'off',
      'vue-a11y/no-static-element-interactions': 'off',
      'vue-a11y/mouse-events-have-key-events': 'off',
      'vue-a11y/form-control-has-label': 'off',
      'vue-a11y/label-has-for': 'off',
      'antfu/top-level-function': 'off',
    },
  }),
)
