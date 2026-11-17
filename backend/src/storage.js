// 照片儲存。資料庫只存位置（media/<檔名>），實際檔案放在：
//   - 本機開發：backend/uploads/（預設）
//   - 部署：Supabase Storage 的私有 bucket（設定 SUPABASE_URL 與 SUPABASE_SERVICE_KEY 時啟用）
// 兩種情況都只有後端能讀寫，讀取前由路由先做日記權限檢查。
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const contentTypeOf = (name) => TYPES[path.extname(name)] || 'application/octet-stream';
const nameOf = (location) => path.basename(location);

export const usingSupabase = Boolean(config.supabaseUrl && config.supabaseKey);

let bucket = null;
async function getBucket() {
  if (!bucket) {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    bucket = client.storage.from(config.supabaseBucket);
  }
  return bucket;
}

export async function prepare() {
  if (!usingSupabase) await fs.mkdir(config.uploadDir, { recursive: true });
}

export async function save(name, buffer) {
  if (usingSupabase) {
    const { error } = await (await getBucket()).upload(name, buffer, { contentType: contentTypeOf(name), upsert: false });
    if (error) throw new Error(`照片上傳失敗：${error.message}`);
  } else {
    await fs.writeFile(path.join(config.uploadDir, name), buffer);
  }
  return `media/${name}`;
}

/** 回傳 { buffer, contentType }；檔案不存在時回傳 null。 */
export async function read(location) {
  const name = nameOf(location);
  try {
    if (usingSupabase) {
      const { data, error } = await (await getBucket()).download(name);
      if (error || !data) return null;
      return { buffer: Buffer.from(await data.arrayBuffer()), contentType: contentTypeOf(name) };
    }
    return { buffer: await fs.readFile(path.join(config.uploadDir, name)), contentType: contentTypeOf(name) };
  } catch {
    return null;
  }
}

/** 刪除舊照片；失敗不影響主要流程。 */
export async function remove(location) {
  if (!location) return;
  const name = nameOf(location);
  try {
    if (usingSupabase) await (await getBucket()).remove([name]);
    else await fs.unlink(path.join(config.uploadDir, name));
  } catch { /* 留下孤兒檔案不影響功能 */ }
}
