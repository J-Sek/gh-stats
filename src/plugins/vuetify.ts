/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Composables
import { createVuetify } from 'vuetify'

// Icon set – Solar via UnoCSS (vuetifyjs/vuetify#22706)
import { aliases, solar } from '@/iconsets/solar'

// Styles
import '../styles/layers.css'
import 'vuetify/styles'

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  icons: {
    defaultSet: 'solar',
    aliases,
    sets: { solar },
  },
  theme: {
    defaultTheme: 'system',
  },
})
