import vuetify from 'vite-plugin-vuetify'

export default defineNuxtConfig({
    devtools: { enabled: true },

    modules: [
        '@pinia/nuxt',
        '@vueuse/nuxt',
        (_options, nuxt) => {
            nuxt.hooks.hook('vite:extendConfig', (config) => {
                config?.plugins?.push(vuetify({autoImport: true}))
            })
        },
    ],

    css: [
        'vuetify/lib/styles/main.sass',
        '@mdi/font/css/materialdesignicons.css'
    ],

    build: {
        transpile: ['vuetify']
    },

    vite: {
        define: {
            'process.env.DEBUG': false,
        },
        server: {
            hmr: {
                port: 24678
            }
        }
    },

    runtimeConfig: {
        public: {
            serverUrl: process.env.NUXT_PUBLIC_SERVER_URL || 'http://localhost:3001'
        }
    },

    typescript: {
        strict: true,
        typeCheck: false
    }
})