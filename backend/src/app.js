import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { attachUser } from './auth.js';
import { errorHandler, notFound } from './errors.js';
import authRoutes from './routes/auth.js';
import blogRoutes from './routes/blogs.js';
import entryRoutes from './routes/entries.js';
import socialRoutes from './routes/social.js';
import operatorRoutes from './routes/operator.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(attachUser);
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', authRoutes);
  api.use('/operator', operatorRoutes);
  api.use(blogRoutes);
  api.use(entryRoutes);
  api.use(socialRoutes);
  api.use((_req, _res, next) => next(notFound('找不到這個 API')));
  app.use('/api', api);

  // 有建置過前端時，由後端一併提供靜態檔（單一網址即可展示）
  if (fs.existsSync(path.join(config.frontendDist, 'index.html'))) {
    app.use(express.static(config.frontendDist));
    app.get('*', (_req, res) => res.sendFile(path.join(config.frontendDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
