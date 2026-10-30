import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Parma Live',
        short_name: 'Parma Live',
        lang: 'it',
        display: 'standalone',
        background_color: '#F2F2F7',
        theme_color: '#F2F2F7',
      },
    }),
  ],
})
