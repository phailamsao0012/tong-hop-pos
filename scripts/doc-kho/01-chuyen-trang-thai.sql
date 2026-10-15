WITH RECURSIVE
-- Lặp mọi POS, kể cả POS tắt; ép tìm theo tiền tố POS + khoảng first_closed_at.
orders AS MATERIALIZED (
  SELECT o.id, o.pos_id, o.seller_id, o.care_id, o.status_history_json
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
status_events AS MATERIALIZED (
  SELECT o.id, o.pos_id, o.seller_id, o.care_id,
    CASE WHEN json_type(h.value, '$.old_status') = 'integer'
      THEN json_extract(h.value, '$.old_status') END AS old_status,
    CASE WHEN json_type(h.value, '$.status') = 'integer'
      THEN json_extract(h.value, '$.status') END AS new_status,
    CAST(json_extract(h.value, '$.editor_id') AS TEXT) AS editor,
    julianday(json_extract(h.value, '$.updated_at')) AS at
  FROM orders o, json_each(CASE WHEN json_valid(o.status_history_json)
    AND json_type(o.status_history_json) = 'array' THEN o.status_history_json ELSE '[]' END) h
  WHERE h.type = 'object'
),
events AS (
  SELECT old_status, new_status, CASE WHEN e.editor IS NULL OR e.editor = '' OR u.user_id IS NULL THEN 'không rõ'
      WHEN e.editor = e.seller_id THEN 'chính Sale của đơn'
      WHEN e.editor = e.care_id THEN 'CSKH của đơn'
      ELSE u.actor END AS actor
  FROM status_events e LEFT JOIN classified_users u ON u.pos_id = e.pos_id AND u.user_id = e.editor
),
grouped AS (
  SELECT old_status, new_status, actor, count(*) AS n FROM events GROUP BY old_status, new_status, actor
)
SELECT old_status, new_status, actor, n,
  sum(n) OVER (PARTITION BY old_status, new_status) AS pair_total,
  sum(n) OVER () AS total
FROM grouped ORDER BY old_status, new_status, actor;
