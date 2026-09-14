import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// node:sqlite 在 Node 22.22 的 builtinModules 里未被列出，Vite 会把它当成普通 npm 包
// 去解析并报 "Failed to load url sqlite"。用 createRequire 在运行时加载可绕开静态分析。
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

export type Db = InstanceType<typeof DatabaseSync>;

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

/** 打开数据库并执行幂等建表。path 传 ':memory:' 时得到内存库（测试用）。 */
export function openDb(file: string): Db {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

/** 供测试使用：每个用例一个全新内存库，互不污染。 */
export function createTestDb(): Db {
  return openDb(':memory:');
}
