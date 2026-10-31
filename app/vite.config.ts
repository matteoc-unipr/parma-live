import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Source map pubbliche: errori leggibili dal telefono (e Lighthouse le richiede). Il codice non ha segreti.
  build: { sourcemap: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Parma Live',
        short_name: 'Parma Live',
        description: 'Bus TEP in tempo reale, tabelloni di fermata, ricerca A→B e treni della stazione di Parma.',
        lang: 'it',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F2F2F7',
        theme_color: '#F2F2F7',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache: shell (HTML, JS anche dei worker .mjs, CSS, icone) e dati statici principali (~500 KB gzip),
        // così l'app funziona offline già dopo la prima visita. Le revisioni cambiano a ogni build notturna.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest}', 'data/*.json'],
        // Gli orari per fermata (~4500 file) no: si mettono in cache quando servono, qui sotto.
        globIgnores: ['data/stop-times/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/data\//],
        runtimeCaching: [
          {
            // Orari per fermata: si aprono on-demand, restano disponibili offline.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/data/stop-times/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'stop-times', expiration: { maxEntries: 300, maxAgeSeconds: 3 * 86400 } },
          },
          {
            // Stile della mappa: può cambiare, si aggiorna in background.
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org' && url.pathname.startsWith('/styles/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'map-style' },
          },
          {
            // Tile e sprite hanno la versione nell’URL, i font sono statici: si servono dalla cache.
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 1500, maxAgeSeconds: 30 * 86400 } },
          },
          // Realtime (Worker: bus, treni) e Photon non compaiono: sempre dalla rete, mai dalla cache.
        ],
      },
    }),
  ],
})
