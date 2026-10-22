import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function resolveUseMsw(mode: string): boolean {
  const fileEnv = loadEnv(mode, path.resolve(__dirname), '');
  return fileEnv.VITE_USE_MSW === 'true' || process.env.VITE_USE_MSW === 'true';
}

function stripPwaWhenMsw(useMsw: boolean): Plugin {
  return {
    name: 'strip-pwa-when-msw',
    closeBundle() {
      if (!useMsw) return;
      const dist = path.resolve(__dirname, 'dist');
      for (const name of fs.readdirSync(dist)) {
        if (name === 'manifest.webmanifest' || name.startsWith('workbox-')) {
          fs.rmSync(path.join(dist, name), { force: true });
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const useMsw = resolveUseMsw(mode);

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // PWA sw.js and MSW's mockServiceWorker.js cannot share the page scope.
        disable: useMsw,
        injectRegister: false,
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
          navigateFallbackDenylist: [/^\/mockServiceWorker\.js$/, /^\/sw\.js$/],
        },
      }),
      stripPwaWhenMsw(useMsw),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
    },
  };
});
