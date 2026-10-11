import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const root = fileURLToPath(new URL('.', import.meta.url));
// shared/ 在仓库根，vite.config.ts 在 web/ 下，往上一层找
const sharedDir = resolve(root, '..', 'shared');

export default defineConfig({
  root,
  plugins: [vue()],
  appType: 'spa',
  resolve: {
    alias: {
      '@shared': sharedDir,
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
