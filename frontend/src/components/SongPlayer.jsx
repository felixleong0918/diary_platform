// 歌曲播放器：YouTube 連結在頁面內播放（空間頁會嘗試自動播放），
// Spotify 連結顯示官方的嵌入播放器（未登入 Spotify 時是 30 秒試聽），
// 其他網站維持開新分頁的連結。
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { SongLink } from './ui.jsx';

/** 由連結判斷來源。回傳 { provider: 'youtube', id }、{ provider: 'spotify', kind, id } 或 null。 */
export function parseSong(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const ID = /^[A-Za-z0-9_-]{11}$/;
  if (host === 'youtu.be') {
    const id = u.pathname.split('/')[1] || '';
    return ID.test(id) ? { provider: 'youtube', id } : null;
  }
  if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    const parts = u.pathname.split('/').filter(Boolean);
    const id = parts[0] === 'watch' ? u.searchParams.get('v') || '' : ['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] || '' : '';
    return ID.test(id) ? { provider: 'youtube', id } : null;
  }
  if (host === 'open.spotify.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (/^intl-[a-z]{2,5}$/i.test(parts[0] || '')) parts.shift();          // /intl-zh/track/… 這類帶語系的網址
    const [kind, id] = parts;
    if (['track', 'album', 'playlist', 'episode'].includes(kind) && /^[A-Za-z0-9]{10,40}$/.test(id || '')) {
      return { provider: 'spotify', kind, id };
    }
  }
  return null;
}

// YouTube IFrame Player API 只載入一次
let apiPromise = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { apiPromise = null; reject(new Error('無法載入 YouTube 播放器')); };
      document.head.appendChild(script);
      setTimeout(() => { if (!window.YT?.Player) { apiPromise = null; reject(new Error('YouTube 播放器載入逾時')); } }, 10000);
    });
  }
  return apiPromise;
}

function YouTubePlayer({ id, title, url, autoplay, className }) {
  // idle：尚未載入；loading；playing；paused；blocked：瀏覽器擋下自動播放；error：無法嵌入
  const [state, setState] = useState(autoplay ? 'loading' : 'idle');
  const [wanted, setWanted] = useState(autoplay);        // 是否已經要載入播放器
  const holder = useRef(null);
  const player = useRef(null);

  useEffect(() => {
    if (!wanted) return undefined;
    let cancelled = false;
    let check;
    const mount = document.createElement('div');
    holder.current.appendChild(mount);
    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      player.current = new YT.Player(mount, {
        videoId: id,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => {
            e.target.playVideo();
            // 沒有使用者互動時瀏覽器會擋下有聲音的自動播放：過一會仍未開始，就請對方按播放
            check = setTimeout(() => {
              const s = e.target.getPlayerState?.();
              if (!cancelled && s !== YT.PlayerState.PLAYING && s !== YT.PlayerState.BUFFERING) setState('blocked');
            }, 1500);
          },
          onStateChange: (e) => {
            if (cancelled) return;
            if (e.data === YT.PlayerState.PLAYING) setState('playing');
            else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) setState('paused');
          },
          onError: () => { if (!cancelled) setState('error'); },     // 例如影片不允許嵌入
        },
      });
    }).catch(() => { if (!cancelled) setState('error'); });
    return () => {
      cancelled = true;
      clearTimeout(check);
      try { player.current?.destroy(); } catch { /* 播放器尚未建立完成 */ }
      player.current = null;
      mount.remove();
    };
  }, [wanted, id]);

  if (state === 'error') return <SongLink title={title} url={url} className={className} />;
  const playing = state === 'playing';
  const toggle = () => {
    if (!wanted) { setWanted(true); setState('loading'); return; }
    const p = player.current;
    if (!p?.playVideo) return;
    if (playing) p.pauseVideo(); else p.playVideo();
  };
  const hint = { idle: 'YouTube', loading: '載入中…', playing: '播放中', paused: '已暫停', blocked: '按一下開始播放' }[state];

  return (
    <div className={`player ${className}`}>
      <div className="song">
        <button type="button" className="song-disc" onClick={toggle} disabled={state === 'loading'}
          aria-label={playing ? `暫停 ${title}` : `播放 ${title}`}>
          <Icon name={playing ? 'pause' : 'play'} size={16} filled />
        </button>
        <span className="song-text"><b>{title}</b><span aria-live="polite">{hint}</span></span>
        <a href={url} target="_blank" rel="noopener noreferrer nofollow" aria-label="在 YouTube 開啟"><Icon name="external" size={15} /></a>
      </div>
      {/* YouTube 的使用條款要求播放器必須看得見，所以保留一個小畫面 */}
      <div ref={holder} className="player-frame" hidden={!wanted} />
    </div>
  );
}

function SpotifyPlayer({ kind, id, title, className }) {
  return (
    <div className={`player is-spotify ${className}`}>
      <iframe
        title={`Spotify：${title}`} loading="lazy" height={kind === 'track' || kind === 'episode' ? 80 : 152}
        src={`https://open.spotify.com/embed/${kind}/${id}?utm_source=generator`}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      />
      <span className="tiny">沒有登入 Spotify 時會播放 30 秒試聽</span>
    </div>
  );
}

export default function SongPlayer({ title, url, autoplay = false, className = '' }) {
  if (!title || !url) return null;
  const song = parseSong(url);
  if (song?.provider === 'youtube') return <YouTubePlayer key={song.id} id={song.id} title={title} url={url} autoplay={autoplay} className={className} />;
  if (song?.provider === 'spotify') return <SpotifyPlayer kind={song.kind} id={song.id} title={title} className={className} />;
  return <SongLink title={title} url={url} className={className} />;
}
