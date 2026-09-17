/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com
 */

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Composables
import { createVuetify, type ThemeDefinition } from 'vuetify'

// Clinical workstation theme — light shell, blue controls, black diagnostic canvas.
const clinicalWorkstation: ThemeDefinition = {
  dark: false,
  colors: {
    background: '#D6DCE2',
    surface: '#EEF1F4',
    'surface-bright': '#FFFFFF',
    'surface-light': '#DFE5EA',
    'surface-variant': '#DFE5EA',
    'on-surface-variant': '#526575',

    primary: '#1672AD',
    'primary-darken-1': '#0F5685',
    secondary: '#5F7E96',
    'secondary-darken-1': '#486276',

    accent: '#1672AD',
    error: '#B33142',
    info: '#236F9F',
    success: '#2E795B',
    warning: '#B46D14',

    'on-background': '#1D2A35',
    'on-surface': '#1D2A35',
    'on-primary': '#FFFFFF',
    'on-secondary': '#FFFFFF',
  },
  variables: {
    'border-color': '#9EABB7',
    'border-opacity': 1,
  },
}

export default createVuetify({
  theme: {
    defaultTheme: 'clinicalWorkstation',
    themes: { clinicalWorkstation },
  },
  defaults: {
    VBtn: { rounded: 'sm' },
    VCard: { rounded: 'md' },
    VTextField: { variant: 'outlined', density: 'compact' },
    VSelect: { variant: 'outlined', density: 'compact' },
  },
})
