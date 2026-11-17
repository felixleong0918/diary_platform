import pg from 'pg';
import { config } from './config.js';

// date 欄位以 'YYYY-MM-DD' 字串回傳，避免時區換算造成日期位移
pg.types.setTypeParser(1082, (v) => v);
// count() / bigint 以數字回傳
pg.types.setTypeParser(20, (v) => Number(v));
// numeric（平均值）以數字回傳
pg.types.setTypeParser(1700, (v) => Number(v));

// Supabase 等雲端資料庫需要 TLS。
//   DATABASE_CA_CERT：貼上伺服器根憑證（PEM），會驗證伺服器身分
//   DATABASE_SSL=true：只加密、不驗證憑證
// 連線字串裡的 sslmode 參數會蓋掉這裡的設定，所以先拿掉。
function connectionOptions() {
  let connectionString = config.databaseUrl;
  let ssl;
  if (config.databaseCaCert) ssl = { ca: config.databaseCaCert.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  else if (config.databaseSsl) ssl = { rejectUnauthorized: false };
  if (ssl) {
    try {
      const url = new URL(connectionString);
      url.searchParams.delete('sslmode');
      connectionString = url.toString();
    } catch { /* 交給 pg 回報格式錯誤 */ }
  }
  // 無伺服器環境每個執行個體各有一個連線池，數量要小，交給 Supabase 的 pooler 彙整
  return { connectionString, ssl, max: config.poolMax, idleTimeoutMillis: config.onVercel ? 5000 : 10000 };
}

export const pool = new pg.Pool(connectionOptions());

export const query = (text, params) => pool.query(text, params);

/** 在同一個交易內執行 fn(client)；丟出例外則 ROLLBACK。 */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
