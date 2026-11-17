// 與後端 JSON API 溝通；登入狀態放在 httpOnly cookie，前端不接觸 token。
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, url, body) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${url}`, init);
  } catch {
    throw new ApiError(0, 'network', '無法連線到伺服器，請確認後端是否已啟動');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code || 'error', data?.error?.message || '發生錯誤，請稍後再試');
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};

/** 把物件轉成查詢字串，略過空值。 */
export function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const photoUrl = (entryId, bust = '') => `/api/entries/${entryId}/photo${bust ? `?v=${bust}` : ''}`;

const dateFmt = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const formatDate = (ymd) => (ymd ? dateFmt.format(new Date(`${ymd}T00:00:00`)) : '');
export const formatTime = (iso) => (iso ? timeFmt.format(new Date(iso)) : '');
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
