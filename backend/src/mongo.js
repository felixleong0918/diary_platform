import { MongoClient } from 'mongodb';
import { config } from './config.js';

/**
 * MongoDB 只儲存公開搜尋與頁面瀏覽事件（計畫書 2.7）：
 *   { ts, session, type: 'search' | 'view', target, target_type, keyword? }
 * 不儲存私密內文、心情分數或密碼。MongoDB 無法連線時 API 仍照常運作，只是不記錄事件。
 */
// Vercel 會在回應送出後凍結函式；waitUntil 讓事件寫入完成後才凍結
let waitUntil = null;
if (process.env.VERCEL) {
  try { ({ waitUntil } = await import('@vercel/functions')); } catch { /* 沒有這個套件時照常運作 */ }
}

let events = null;
let client = null;

export async function connectMongo() {
  if (!config.mongoUrl) {
    console.warn('[mongo] 未設定 MONGO_URL，略過事件記錄');
    return;
  }
  try {
    client = new MongoClient(config.mongoUrl, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    events = client.db(config.mongoDb).collection('events');
    await events.createIndex({ session: 1, ts: 1 });
    await events.createIndex({ type: 1, ts: -1 });
    console.log(`[mongo] 已連線：${config.mongoDb}.events`);
  } catch (err) {
    events = null;
    console.warn(`[mongo] 無法連線（${err.message}），略過事件記錄`);
  }
}

export const mongoReady = () => events !== null;
export const eventsCollection = () => events;
export const closeMongo = () => client?.close();

/** 寫入事件；不等待結果、失敗不影響回應。 */
export function logEvent(req, type, { target = null, target_type = null, keyword = null } = {}) {
  if (!events) return;
  const doc = { ts: new Date(), session: req.sessionId, type, target, target_type };
  if (keyword) doc.keyword = String(keyword).slice(0, 100);
  const pending = events.insertOne(doc).catch((err) => console.warn('[mongo] 事件寫入失敗', err.message));
  waitUntil?.(pending);
}

/**
 * 搜尋後閱讀的轉換率：某個匿名工作階段在搜尋之後 windowMinutes 分鐘內
 * 至少瀏覽一篇日記，就算一次轉換。
 */
export function conversionPipeline(since, windowMinutes = 30) {
  const windowMs = windowMinutes * 60 * 1000;
  return [
    { $match: { ts: { $gte: since }, type: { $in: ['search', 'view'] } } },
    { $group: { _id: '$session', events: { $push: { type: '$type', kind: '$target_type', ts: '$ts' } } } },
    {
      $project: {
        searches: {
          $map: {
            input: { $filter: { input: '$events', as: 'e', cond: { $eq: ['$$e.type', 'search'] } } },
            as: 'e',
            in: '$$e.ts',
          },
        },
        views: {
          $map: {
            input: {
              $filter: {
                input: '$events',
                as: 'e',
                cond: { $and: [{ $eq: ['$$e.type', 'view'] }, { $eq: ['$$e.kind', 'entry'] }] },
              },
            },
            as: 'e',
            in: '$$e.ts',
          },
        },
      },
    },
    { $match: { 'searches.0': { $exists: true } } },
    {
      $project: {
        search_count: { $size: '$searches' },
        converted_searches: {
          $size: {
            $filter: {
              input: '$searches',
              as: 's',
              cond: {
                $anyElementTrue: [{
                  $map: {
                    input: '$views',
                    as: 'v',
                    in: {
                      $and: [{ $gt: ['$$v', '$$s'] }, { $lte: [{ $subtract: ['$$v', '$$s'] }, windowMs] }],
                    },
                  },
                }],
              },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: null,
        sessions_with_search: { $sum: 1 },
        converted_sessions: { $sum: { $cond: [{ $gt: ['$converted_searches', 0] }, 1, 0] } },
        searches: { $sum: '$search_count' },
        converted_searches: { $sum: '$converted_searches' },
      },
    },
  ];
}

export const topKeywordsPipeline = (since, limit = 10) => [
  { $match: { ts: { $gte: since }, type: 'search', keyword: { $exists: true } } },
  { $group: { _id: { $toLower: '$keyword' }, count: { $sum: 1 }, sessions: { $addToSet: '$session' } } },
  { $project: { _id: 0, keyword: '$_id', count: 1, sessions: { $size: '$sessions' } } },
  { $sort: { count: -1, keyword: 1 } },
  { $limit: limit },
];

export const dailyEventsPipeline = (since) => [
  { $match: { ts: { $gte: since } } },
  {
    $group: {
      _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$ts', timezone: 'Asia/Taipei' } }, type: '$type' },
      count: { $sum: 1 },
    },
  },
  { $project: { _id: 0, day: '$_id.day', type: '$_id.type', count: 1 } },
  { $sort: { day: 1, type: 1 } },
];
