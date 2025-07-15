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
        },
        ssr: {
            noExternal: ['vuetify']
        }
    },
    runtimeConfig: {
        public: {
            socketServerUrl: process.env.SOCKET_SERVER_URL || 'http://localhost:3001',
            socketAutoConnect: process.env.SOCKET_AUTOCONNECT ? 'true' === process.env.SOCKET_AUTOCONNECT : true,
        },
    },

    // App configuration
    app: {
        head: {
            title: 'WebRTC Video Streaming',
            meta: [
                { charset: 'utf-8' },
                { name: 'viewport', content: 'width=device-width, initial-scale=1' },
                { name: 'description', content: 'WebRTC Video Streaming with Chat' }
            ]
        }
    },

    // Auto-imports
    imports: {
        dirs: [
            'stores',
            'utils',
            'composables'
        ]
    },

    // TypeScript configuration
    typescript: {
        strict: true,
        typeCheck: false // Disable during development for faster builds
    },

    // Nitro configuration for SSR
    nitro: {
        experimental: {
            wasm: true
        }
    },

    // Development server configuration
    devServer: {
        port: 3000,
        host: 'localhost'
    }
})
