import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupSong, songProvider } from '../src/songInfo.js';

test('歌名查詢只連到 YouTube 與 Spotify 的 oEmbed', async () => {
  const calls = [];
  const fake = async (url) => { calls.push(url); return { ok: true, json: async () => ({ title: '  Song A  ' }) }; };
  assert.deepEqual(await lookupSong('https://youtu.be/abc', fake), { provider: 'YouTube', title: 'Song A' });
  assert.deepEqual(await lookupSong('https://open.spotify.com/track/1', fake), { provider: 'Spotify', title: 'Song A' });
  assert.ok(calls[0].startsWith('https://www.youtube.com/oembed?'));
  assert.ok(calls[1].startsWith('https://open.spotify.com/oembed?'));
  for (const url of ['http://youtu.be/abc', 'https://youtube.com.evil.example/x', 'https://127.0.0.1/', 'not a url']) {
    assert.equal(songProvider(url), null, url);
  }
  assert.equal(calls.length, 2);
  const failing = async () => { throw new Error('timeout'); };
  assert.deepEqual(await lookupSong('https://youtu.be/abc', failing), { provider: 'YouTube', title: null });
});
