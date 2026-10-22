import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['illustrations/error-offline.webp', 'favicon.svg'],
      manifest: {
        name: 'Still With You',
        short_name: 'Still With You',
        description: 'พื้นที่ส่วนตัวสำหรับครอบครัว เพื่อเก็บความทรงจำ',
        lang: 'th',
        start_url: '/',
        display: 'standalone',
        background_color: '#F5F4ED',
        theme_color: '#4A7768',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,webp,svg,ico,woff2}'],
        globIgnores: ['**/mockServiceWorker.js'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
});
