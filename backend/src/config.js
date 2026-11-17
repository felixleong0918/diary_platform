import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://diary:diary@localhost:5432/diary',
  mongoUrl: process.env.MONGO_URL ?? 'mongodb://localhost:27017',
  mongoDb: process.env.MONGO_DB || 'diary_events',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || 'uploads'),
  frontendDist: path.resolve(root, '../frontend/dist'),
};

// 已部署於前端的樣式清單；THEME.style_key 只能使用這些值
export const STYLE_KEYS = ['aurora', 'dawn', 'ocean', 'meadow', 'dusk', 'graphite'];
