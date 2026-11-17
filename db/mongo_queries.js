// MongoDB 代表性指令（mongosh diary_events db/mongo_queries.js）
// events 文件：{ ts, session, type: 'search' | 'view', target, target_type, keyword? }
// 不含私密內文、心情分數或密碼。

const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

print('事件數（依種類）');
printjson(db.events.aggregate([
  { $match: { ts: { $gte: since } } },
  { $group: { _id: '$type', count: { $sum: 1 } } },
]).toArray());

print('熱門搜尋字');
printjson(db.events.aggregate([
  { $match: { ts: { $gte: since }, type: 'search', keyword: { $exists: true } } },
  { $group: { _id: { $toLower: '$keyword' }, count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 },
]).toArray());

print('最常被瀏覽的公開日記');
printjson(db.events.aggregate([
  { $match: { ts: { $gte: since }, type: 'view', target_type: 'entry' } },
  { $group: { _id: '$target', views: { $sum: 1 }, sessions: { $addToSet: '$session' } } },
  { $project: { views: 1, sessions: { $size: '$sessions' } } },
  { $sort: { views: -1 } },
  { $limit: 10 },
]).toArray());

// 搜尋後 30 分鐘內閱讀的轉換率：完整 pipeline 見 backend/src/mongo.js 的 conversionPipeline()
