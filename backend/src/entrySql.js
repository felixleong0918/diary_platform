// 日記列表共用的 SELECT；不含 mood_score（心情分數僅供作者個人回顧，不公開顯示）
import { avatarSql } from './people.js';

export const ENTRY_CARD = `
  e.entry_id, e.title, left(e.content, 140) AS excerpt, e.entry_date, e.published_at,
  e.visibility, e.status, (e.photo_url IS NOT NULL) AS has_photo, e.song_title,
  e.blog_id, b.blog_name, u.user_id AS author_id, u.nickname AS author_nickname,
  u.username AS author_username, ${avatarSql('u')} AS author_avatar, e.category_no, c.category_name,
  COALESCE((SELECT json_agg(json_build_object('tag_id', t.tag_id, 'tag_name', t.tag_name) ORDER BY t.tag_name)
              FROM diary_tag dt JOIN tag t ON t.tag_id = dt.tag_id
             WHERE dt.entry_id = e.entry_id), '[]'::json) AS tags,
  (SELECT count(*) FROM comment cm WHERE cm.entry_id = e.entry_id AND cm.status = 'visible') AS comment_count,
  (SELECT count(*) FROM diary_favorite f WHERE f.entry_id = e.entry_id) AS favorite_count,
  (SELECT count(*) FROM diary_reaction r WHERE r.entry_id = e.entry_id) AS reaction_count`;

export const ENTRY_FROM = `
  FROM diary_entry e
  JOIN blog b ON b.blog_id = e.blog_id
  JOIN user_account u ON u.user_id = b.user_id
  LEFT JOIN category c ON c.blog_id = e.blog_id AND c.category_no = e.category_no`;
