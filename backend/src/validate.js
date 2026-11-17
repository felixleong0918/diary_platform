import { badRequest } from './errors.js';

/** 取字串欄位：去除首尾空白並檢查長度（以字元計）。 */
export function text(value, name, { min = 1, max, optional = false, trim = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw badRequest(`請填寫${name}`);
  }
  if (typeof value !== 'string') throw badRequest(`${name}格式不正確`);
  const v = trim ? value.trim() : value;
  const len = [...v].length;
  if ([...v.trim()].length < min) {
    if (optional && len === 0) return null;
    throw badRequest(min <= 1 ? `請填寫${name}` : `${name}至少需要 ${min} 個字`);
  }
  if (max && len > max) throw badRequest(`${name}最多 ${max} 個字`);
  return v;
}

export function int(value, name, { min, max, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw badRequest(`請填寫${name}`);
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw badRequest(`${name}必須是整數`);
  if (min !== undefined && n < min) throw badRequest(`${name}不可小於 ${min}`);
  if (max !== undefined && n > max) throw badRequest(`${name}不可大於 ${max}`);
  return n;
}

export function oneOf(value, name, allowed, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw badRequest(`請選擇${name}`);
  }
  if (!allowed.includes(value)) throw badRequest(`${name}不是有效的選項`);
  return value;
}

export function date(value, name, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw badRequest(`請填寫${name}`);
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw badRequest(`${name}格式應為 YYYY-MM-DD`);
  }
  return value;
}

export function id(value, name, prefix) {
  if (typeof value !== 'string' || !new RegExp(`^${prefix}\\d{8}$`).test(value)) {
    throw badRequest(`${name}格式不正確`);
  }
  return value;
}

export function paging(req, defaultSize = 12, maxSize = 50) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(maxSize, Math.max(1, parseInt(req.query.size, 10) || defaultSize));
  return { page, size, limit: size, offset: (page - 1) * size };
}

/** 歌曲：連結與歌名須同時填寫或同時留空；連結只接受 https。 */
export function song(body) {
  const url = text(body.song_url, '歌曲連結', { max: 500, optional: true });
  const title = text(body.song_title, '歌名', { max: 120, optional: true });
  if (!url && !title) return { song_title: null, song_url: null };
  if (!url) throw badRequest('請貼上歌曲連結');
  let parsed;
  try { parsed = new URL(url); } catch { throw badRequest('歌曲連結格式不正確'); }
  if (parsed.protocol !== 'https:') throw badRequest('歌曲連結必須以 https:// 開頭');
  if (!title) throw badRequest('請填寫歌名');
  return { song_title: title, song_url: parsed.href };
}
