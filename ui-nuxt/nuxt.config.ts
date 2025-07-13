// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2025-05-15',
    devtools: { enabled: true },
    css: ['vuetify/lib/styles/main.sass', '@mdi/font/css/materialdesignicons.css', 'vuetify/styles'],
    build: {
        transpile: ['vuetify'],
    },
    modules: [
        '@pinia/nuxt',
        '@vueuse/nuxt',
        (_options, nuxt) => {
            nuxt.hooks.hook('vite:extendConfig', (config) => {
                config?.plugins?.push(
                    require('vite-plugin-vuetify')({
                        autoImport: true,
                    })
                )
            })
        },
    ],
    plugins: ['~/plugins/vuetify.ts'],
    vite: {
        define: {
            'process.env.DEBUG': false,
        }
    },
    runtimeConfig: {
        public: {
            socketServerUrl: process.env.SOCKET_SERVER_URL || 'http://localhost:3001',
            socketAutoConnect: process.env.SOCKET_AUTOCONNECT === 'true' || true,
        },
    }
})
