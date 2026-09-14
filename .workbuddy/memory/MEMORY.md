# 家庭记账簿 · 项目长期记忆

## 技术栈（已定稿，不要反复横跳）
- 服务端：Node 22 + Express + `node:sqlite`（内置，无需原生编译）。金额全链路**整数分**存储，对外字符串元。
- 前端：**Vue 3.5** + `<script setup>` + Vite + TypeScript strict(`noUncheckedIndexedAccess`) + `vue-tsc`。
  - 2026-09-13 已从 React 18 整体重写为 Vue，React 依赖已清空。
- 存储：SQLite 为唯一事实源；前端 IndexedDB 仅做读缓存（SWR，5s）。

## 设计约定（用户确认，改动前先问）
- **配色：晴空** —— 冷白微蓝底 + 雾蓝主色。令牌名：`--brand` / `--expense` / `--income` / `--warn` / `--slate`（各带 `-deep` `-wash`）。
- 支出红、收入绿（中国习惯），永远不要反过来。
- **不要纸纹噪点、不要账簿横线**；列表用每行 `border-bottom` 分隔，日期分组用整条 `--paper-sunken` 色带。
- 页头固定「家庭财务」左 + 家庭名右，**不要图标**。
- 低频操作（编辑/删除）**收进详情弹层**，列表行只留高频动作（如负债的「还一笔」）。

## 运行环境坑（每次都要注意）
1. Git Bash 的 PATH 被上层脚本破坏：每条命令必须以 `export PATH="/usr/bin:/bin:$PATH"; cd "/c/Users/86188/WorkBuddy/2026-09-13-00-30-20" &&` 开头。
2. Node 用绝对路径 `C:/Users/86188/.workbuddy/binaries/node/versions/22.22.2-3/node.exe`。
3. **不要直接 `import from 'node:sqlite'`**（Node 22 的 builtinModules 不含它，Vite 会解析失败），统一从 `server/src/db/connection.ts` 取 `createTestDb()`。
4. vitest 用**路径过滤**，`--project` 参数在本项目找不到测试文件。
5. npm 必须走 `--registry=https://registry.npmmirror.com`，直连境外源会卡死。
6. 同一文件的多次 Edit 必须串行，并行会互相覆盖。

## 用户数据
- 家庭名「羽毛家」，用户已在真实记账。**任何时候都不要往库里塞演示数据。**
