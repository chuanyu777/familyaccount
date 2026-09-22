import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { openDb } from './db/connection';
import { ensureSeeded } from './db/seed';
import { createApp } from './app';
import { assertProductionAccessConfig, readAccessConfig } from './auth/config';

const DATA_DIR = resolve(process.cwd(), 'data');
const DB_PATH = resolve(DATA_DIR, 'ledger.db');
const PORT = Number(process.env.PORT) || 3001;

mkdirSync(DATA_DIR, { recursive: true });

const db = openDb(DB_PATH);
ensureSeeded(db);

const accessConfig = readAccessConfig(process.env);
assertProductionAccessConfig(accessConfig);

const app = createApp(db, { accessConfig });
app.listen(PORT, () => {
  console.log(`家庭记账簿服务端已启动: http://localhost:${PORT}`);
});
