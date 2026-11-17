export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg) => new HttpError(400, 'bad_request', msg);
export const unauthorized = (msg = '請先登入') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = '沒有權限執行這個操作') => new HttpError(403, 'forbidden', msg);
export const notFound = (msg = '找不到資料') => new HttpError(404, 'not_found', msg);
// 無權閱讀與不存在回同一種結果，避免洩漏內容是否存在
export const unavailable = () => new HttpError(404, 'unavailable', '內容目前無法瀏覽');
export const conflict = (code, msg) => new HttpError(409, code, msg);

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const PG_MESSAGES = {
  user_account_username_key: '這個登入帳號已經有人使用',
  user_account_email_key: '這個電子郵件已經註冊過',
  theme_theme_name_key: '主題名稱已存在',
  theme_style_key_key: '這個樣式已被其他主題使用',
  tag_tag_name_key: '標籤名稱已存在',
  category_blog_id_category_name_key: '同一空間內已有相同名稱的分類',
  category_name_normalized_uq: '同一空間內已有相同名稱的分類',
};

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err?.code === '23505') {
    const message = PG_MESSAGES[err.constraint] || '資料重複';
    return res.status(409).json({ error: { code: 'duplicate', message } });
  }
  if (err?.code === '23514' || err?.code === '22001') {
    return res.status(400).json({ error: { code: 'bad_request', message: '資料不符合欄位限制' } });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: { code: 'bad_request', message: '照片大小不可超過 4 MB' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: '伺服器發生錯誤' } });
}
