import presetIcons from '@unocss/preset-icons'
import { defineConfig, transformerDirectives } from 'unocss'
import { presetVuetify } from 'unocss-preset-vuetify'

export default defineConfig({
  presets: [
    presetIcons({
      processor (props) {
        delete props.color
      },
    }),
    presetVuetify({
      font: {
        heading: 'Kanit, sans-serif',
        body: 'Kanit, sans-serif',
        mono: 'monospace',
      },
      typography: 'md3',
      elevation: 'md3',
    }),
  ],
  transformers: [
    transformerDirectives(),
  ],
  safelist: [
    ...Array.from({ length: 6 }, (_, i) => `elevation-${i}`),
    ...['', '-0', '-sm', '-lg', '-xl', '-pill', '-circle', '-shaped'].map(suffix => `rounded${suffix}`),
  ],
  outputToCssLayers: {
    cssLayerName: layer => layer === 'properties' ? null : `uno-${layer}`,
  },
})
