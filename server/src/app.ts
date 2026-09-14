import express, { type Express } from 'express';
import type { Db } from './db/connection';
import { errorHandler } from './middleware/error';
import { familyRoutes } from './routes/family.routes';
import { memberRoutes } from './routes/member.routes';
import { accountRoutes } from './routes/account.routes';
import { categoryRoutes } from './routes/category.routes';
import { transactionRoutes } from './routes/transaction.routes';
import { assetRoutes } from './routes/asset.routes';
import { liabilityRoutes } from './routes/liability.routes';
import { repaymentRoutes } from './routes/repayment.routes';
import { statsRoutes } from './routes/stats.routes';

/**
 * 构造 Express 应用。签名固定（后续子代理会往里加路由）。
 * 仅做：JSON 解析 → 挂载各路由 → 末尾挂统一错误中间件。
 */
export function createApp(db: Db): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/family', familyRoutes(db));
  app.use('/api/members', memberRoutes(db));
  app.use('/api/accounts', accountRoutes(db));
  app.use('/api/categories', categoryRoutes(db));
  app.use('/api/transactions', transactionRoutes(db));
  app.use('/api/assets', assetRoutes(db));
  app.use('/api/liabilities', liabilityRoutes(db));
  app.use('/api/repayments', repaymentRoutes(db));
  app.use('/api/stats', statsRoutes(db));
  app.use(errorHandler);
  return app;
}
