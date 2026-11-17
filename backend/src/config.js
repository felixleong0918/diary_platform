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
  cookieSecure: process.env.COOKIE_SECURE === 'true' || Boolean(process.env.VERCEL),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || 'uploads'),
  // 設定後照片改存 Supabase Storage 的私有 bucket（部署到 Vercel 時必填）
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_SERVICE_KEY || '',
  supabaseBucket: process.env.SUPABASE_BUCKET || 'diary-photos',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  databaseCaCert: process.env.DATABASE_CA_CERT || '',
  poolMax: Number(process.env.PG_POOL_MAX || (process.env.VERCEL ? 3 : 10)),
  onVercel: Boolean(process.env.VERCEL),
  frontendDist: path.resolve(root, '../frontend/dist'),
};

// 已部署於前端的樣式清單；THEME.style_key 只能使用這些值
export const STYLE_KEYS = ['aurora', 'dawn', 'ocean', 'meadow', 'dusk', 'graphite'];
