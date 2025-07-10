import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import {mdi, aliases} from "vuetify/iconsets/mdi";

export default defineNuxtPlugin((nuxtApp) => {
    const vuetify = createVuetify({
        components,
        directives,
        icons: {
            defaultSet: 'mdi',
            aliases,
            sets: {
                mdi,
            },
        },
        theme: {
            defaultTheme: 'light',
            themes: {
                light: {
                    colors: {
                        primary: '#1976D2',
                        secondary: '#424242',
                        accent: '#82B1FF',
                        error: '#FF5252',
                        info: '#2196F3',
                        success: '#4CAF50',
                        warning: '#FFC107',
                        surface: '#FFFFFF',
                        'on-surface': '#000000',
                        background: '#F5F5F5'
                    }
                },
                dark: {
                    colors: {
                        primary: '#2196F3',
                        secondary: '#424242',
                        accent: '#FF4081',
                        error: '#FF5252',
                        info: '#2196F3',
                        success: '#4CAF50',
                        warning: '#FFC107',
                        surface: '#121212',
                        'on-surface': '#FFFFFF',
                        background: '#000000'
                    }
                }
            }
        },
        defaults: {
            VCard: {
                elevation: 2,
                rounded: 'lg'
            },
            VBtn: {
                elevation: 2,
                rounded: 'lg'
            },
            VTextField: {
                variant: 'outlined',
                density: 'comfortable'
            },
            VSelect: {
                variant: 'outlined',
                density: 'comfortable'
            }
        },
        // Display configuration for proper SSR
        display: {
            mobileBreakpoint: 'sm',
            thresholds: {
                xs: 0,
                sm: 600,
                md: 960,
                lg: 1264,
                xl: 1904,
            },
        }
    })

    nuxtApp.vueApp.use(vuetify)
})