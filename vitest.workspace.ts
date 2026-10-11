import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineWorkspace } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// vitest 2.x 不支持 extends。把 web 端需要的 resolve.alias inline 到此，
// 与 web/vite.config.ts 的 alias 必须保持一致（共享目录 shared/）。
const root = fileURLToPath(new URL('.', import.meta.url));
const sharedDir = resolve(root, 'shared');

// 后端测试已迁到 backend/（Maven + JUnit）：cd backend && mvn -s mvn-settings.xml test
export default defineWorkspace([
  {
    plugins: [vue() as any],
    resolve: {
      alias: { '@shared': sharedDir },
    },
    test: {
      name: 'web',
      environment: 'jsdom',
      globals: true,
      include: ['web/src/**/*.test.ts'],
      setupFiles: ['web/src/test-setup.ts'],
    },
  },
  {
    test: {
      name: 'mini',
      environment: 'node',
      globals: true,
      include: ['mini/**/*.test.ts'],
    },
  },
]);