import pg from 'pg';
import { config } from './config.js';

// date 欄位以 'YYYY-MM-DD' 字串回傳，避免時區換算造成日期位移
pg.types.setTypeParser(1082, (v) => v);
// count() / bigint 以數字回傳
pg.types.setTypeParser(20, (v) => Number(v));
// numeric（平均值）以數字回傳
pg.types.setTypeParser(1700, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

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
