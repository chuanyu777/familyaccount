#!/usr/bin/env node
/**
 * 从 shared/category-icons.ts 生成小程序可用的静态 SVG 文件。
 *
 * 背景：微信小程序 WXML 不支持内联 <svg> 标签，分类图标组件（mini/components/category-icon）
 * 改用 <image src="...svg"> 渲染，因此需要把每个 icon 的 path 落成静态 .svg 文件。
 *
 * 用法：node scripts/generate-category-icon-svgs.mjs
 * 输出：mini/assets/icons/categories/<key>.svg
 *
 * 修改图标后重跑本脚本；同时把 shared/category-icons.ts 复制到 mini/lib/category-icons.ts。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'shared/category-icons.ts'), 'utf8');

// 从 TS 源码里抓出 CATEGORY_ICON_PATHS 的 key: 'path' 对
const block = source.slice(
  source.indexOf('export const CATEGORY_ICON_PATHS'),
  source.indexOf('export const CATEGORY_ICON_VIEW_BOX'),
);
const pairs = [...block.matchAll(/^  (\w+): '(.+)',$/gm)];
if (pairs.length === 0) {
  console.error('没有解析到任何图标 path，检查 shared/category-icons.ts 格式');
  process.exit(1);
}

const outDir = resolve(root, 'mini/assets/icons/categories');
mkdirSync(outDir, { recursive: true });

// 单色中性灰；分类的支出/收入色由容器底色区分
const STROKE = '#596273';
for (const [, key, path] of pairs) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${STROKE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>\n`;
  writeFileSync(resolve(outDir, `${key}.svg`), svg, 'utf8');
  console.log(`生成 ${key}.svg`);
}
console.log(`共 ${pairs.length} 个图标 → mini/assets/icons/categories/`);
