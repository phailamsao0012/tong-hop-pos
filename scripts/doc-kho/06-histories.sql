WITH RECURSIVE
-- Lặp mọi POS, kể cả POS tắt; ép tìm theo tiền tố POS + khoảng first_closed_at.
orders AS MATERIALIZED (
  SELECT o.id, o.pos_id, o.seller_id, o.care_id, o.raw_json
  FROM pos_shops p
  CROSS JOIN raw_pos_orders o INDEXED BY idx_raw_orders_pos_closed_status_money
  WHERE o.pos_id = p.id
    AND o.first_closed_at >= strftime('%Y-%m-%dT%H:%M:%S', 'now', '-7 days')
    AND o.first_closed_at < strftime('%Y-%m-%dT%H:%M:%S', 'now')
    AND o.status_code NOT IN (0, 6, 7)
),
-- Không xuất tên hay định danh. Chỉ giữ từ cuối đúng chữ ASCII IN HOA.
name_tokens(pos_id, user_id, rest, token) AS (
  SELECT pos_id, user_id,
    trim(name, ' ' || char(9) || char(10) || char(13)), ''
  FROM pos_users
  UNION ALL
  SELECT pos_id, user_id, substr(rest, 2),
    CASE WHEN substr(rest, 1, 1) IN (' ', char(9), char(10), char(13)) THEN ''
      ELSE token || substr(rest, 1, 1) END
  FROM name_tokens WHERE rest <> ''
),
user_suffix AS MATERIALIZED (
  SELECT pos_id, user_id, token AS suffix FROM name_tokens
  WHERE rest = '' AND token <> '' AND length(token) <= 8 AND token NOT GLOB '*[^A-Z]*'
),
allowed_suffix AS (
  SELECT suffix FROM user_suffix GROUP BY suffix HAVING count(DISTINCT user_id) >= 2
),
classified_users AS MATERIALIZED (
  SELECT u.pos_id, u.user_id,
    CASE WHEN a.suffix IS NOT NULL THEN 'người khác hậu tố ' || a.suffix
      ELSE 'người khác, không hậu tố' END AS actor
  FROM pos_users u
  LEFT JOIN user_suffix s ON s.pos_id = u.pos_id AND s.user_id = u.user_id
  LEFT JOIN allowed_suffix a ON a.suffix = s.suffix
),
raw_orders AS MATERIALIZED (
  SELECT *, CASE WHEN json_valid(raw_json) AND json_type(raw_json) = 'object' THEN raw_json ELSE '{}' END AS raw
  FROM orders
),
histories AS MATERIALIZED (
  SELECT o.id, o.pos_id, o.seller_id, o.care_id, h.key AS history_key, h.value AS entry,
    CAST(coalesce(json_extract(h.value, '$.editor_id'), json_extract(h.value, '$.user_id'),
      json_extract(h.value, '$.updated_by.id'), json_extract(h.value, '$.updated_by'),
      json_extract(h.value, '$.editor.id'), json_extract(h.value, '$.user.id'),
      json_extract(h.value, '$.created_by.id')) AS TEXT) AS editor
  FROM raw_orders o, json_each(CASE WHEN json_type(o.raw, '$.histories') = 'array'
    THEN json_extract(o.raw, '$.histories') ELSE '[]' END) h WHERE h.type = 'object'
),
field_candidates AS (
  SELECT h.*, coalesce(
    CASE WHEN json_type(entry, '$.field') = 'text' THEN json_extract(entry, '$.field') END,
    CASE WHEN json_type(entry, '$.field_name') = 'text' THEN json_extract(entry, '$.field_name') END,
    CASE WHEN json_type(entry, '$.key') = 'text' THEN json_extract(entry, '$.key') END,
    k.key) AS field
  FROM histories h LEFT JOIN json_each(h.entry) k
    ON json_type(entry, '$.field') IS NOT 'text' AND json_type(entry, '$.field_name') IS NOT 'text'
    AND json_type(entry, '$.key') IS NOT 'text'
    AND k.key NOT IN ('editor_id','user_id','updated_by','editor','user','created_by','updated_at','created_at','id')
),
fields AS (
  SELECT DISTINCT id, pos_id, seller_id, care_id, history_key, editor,
    CASE WHEN length(field) BETWEEN 1 AND 64 AND field NOT GLOB '*[^A-Za-z0-9_]*'
      AND substr(field, 1, 1) GLOB '[A-Za-z_]' AND field NOT GLOB '*[0-9][0-9][0-9][0-9][0-9][0-9]*'
      THEN field ELSE 'trường khác' END AS field FROM field_candidates
),
classified AS (
  SELECT f.field, CASE WHEN f.editor IS NULL OR f.editor = '' OR u.user_id IS NULL THEN 'không rõ'
      WHEN f.editor = f.seller_id THEN 'chính Sale của đơn'
      WHEN f.editor = f.care_id THEN 'CSKH của đơn'
      ELSE u.actor END AS actor
  FROM fields f LEFT JOIN classified_users u ON u.pos_id = f.pos_id AND u.user_id = f.editor
),
grouped AS (
  SELECT field AS label, actor, count(*) AS n FROM classified GROUP BY field, actor
)
SELECT 'coverage' AS kind, 'raw_json' AS label, '' AS actor,
  coalesce(sum(raw_json IS NOT NULL AND trim(raw_json) <> ''), 0) AS n, count(*) AS total FROM raw_orders
UNION ALL
SELECT 'coverage', 'histories', '', coalesce(sum(json_array_length(raw, '$.histories') > 0), 0), count(*) FROM raw_orders
UNION ALL
SELECT 'fields', label, actor, n, (SELECT count(*) FROM histories) FROM grouped
ORDER BY kind, label, actor;
