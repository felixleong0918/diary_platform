// Vercel 的進入點：整個 Express 應用程式就是一個 Vercel Function。
// vercel.json 把 /api/* 的請求都轉到這裡，Express 依原本的路徑處理。
import { createApp } from '../backend/src/app.js';
import { connectMongo } from '../backend/src/mongo.js';

await connectMongo();

export default createApp();
