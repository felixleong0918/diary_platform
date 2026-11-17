// 由歌曲連結查歌名。只向 YouTube 與 Spotify 的官方 oEmbed 端點查詢，
// 不會連到使用者提供的任意網址。
const PROVIDERS = [
  { name: 'YouTube', hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'],
    endpoint: (url) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}` },
  { name: 'Spotify', hosts: ['open.spotify.com'],
    endpoint: (url) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}` },
];

export function songProvider(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== 'https:') return null;
  return PROVIDERS.find((p) => p.hosts.includes(parsed.hostname.toLowerCase())) || null;
}

/** 回傳 { provider, title }；不支援的網站或查不到時 title 為 null。 */
export async function lookupSong(url, fetchImpl = fetch) {
  const provider = songProvider(url);
  if (!provider) return { provider: null, title: null };
  try {
    const res = await fetchImpl(provider.endpoint(url), { signal: AbortSignal.timeout(4000), redirect: 'error' });
    if (!res.ok) return { provider: provider.name, title: null };
    const data = await res.json();
    const title = typeof data.title === 'string' ? data.title.trim().slice(0, 120) : '';
    return { provider: provider.name, title: title || null };
  } catch {
    return { provider: provider.name, title: null };
  }
}
