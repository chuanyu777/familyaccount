import { defineWorkspace } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// Vitest 2.x 用 defineWorkspace（3.x 才升级为 config 里的 projects 字段）。
export default defineWorkspace([
  {
    test: {
      name: 'server',
      environment: 'node',
      globals: true,
      include: ['server/src/**/*.test.ts'],
    },
  },
  {
    // vue 插件：让 .vue 单文件组件（资产/负债等页面）可在 jsdom 下被编译与 mount。
    // 注：@vitejs/plugin-vue 解析到根 vite，与 vitest 内置 vite 类型存在副本差异，这里放宽类型。
    plugins: [vue() as any],
    test: {
      name: 'web',
      environment: 'jsdom',
      globals: true,
      include: ['web/src/**/*.test.ts'],
      setupFiles: ['web/src/test-setup.ts'],
    },
  },
]);
