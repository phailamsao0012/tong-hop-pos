WITH RECURSIVE
-- Lặp mọi POS, kể cả POS tắt; ép tìm theo tiền tố POS + khoảng first_closed_at.
orders AS MATERIALIZED (
  SELECT o.pos_id, o.seller_id, o.care_id, o.last_editor_id
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
classified AS (
  SELECT CASE WHEN o.last_editor_id IS NULL OR o.last_editor_id = '' OR u.user_id IS NULL THEN 'không rõ'
      WHEN o.last_editor_id = o.seller_id THEN 'chính Sale của đơn'
      WHEN o.last_editor_id = o.care_id THEN 'CSKH của đơn'
      ELSE u.actor END AS label
  FROM orders o LEFT JOIN classified_users u ON u.pos_id = o.pos_id AND u.user_id = o.last_editor_id
)
SELECT label, count(*) AS n, (SELECT count(*) FROM orders) AS total FROM classified GROUP BY label ORDER BY n DESC, label;
