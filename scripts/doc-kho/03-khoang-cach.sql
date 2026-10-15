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
-- Mỗi đơn lấy lần đầu vào nguồn và đích; mẫu âm được đếm riêng và bỏ khỏi phân vị.
starts AS (
  SELECT id, '17→1' AS pair, min(at) AS started FROM status_events WHERE new_status = 17 AND at IS NOT NULL GROUP BY id
  UNION ALL
  SELECT id, '1→8', min(at) FROM status_events WHERE new_status = 1 AND at IS NOT NULL GROUP BY id
),
durations AS (
  SELECT s.id, s.pair, (min(e.at) - s.started) * 1440.0 AS minutes
  FROM starts s JOIN status_events e ON e.id = s.id
    AND e.new_status = CASE s.pair WHEN '17→1' THEN 1 ELSE 8 END
  GROUP BY s.id, s.pair
),
ranked AS (
  SELECT pair, minutes, row_number() OVER (PARTITION BY pair ORDER BY minutes) AS rn,
    count(*) OVER (PARTITION BY pair) AS n FROM durations WHERE minutes >= 0
),
pairs(pair) AS (SELECT '17→1' UNION ALL SELECT '1→8')
SELECT p.pair,
  (SELECT count(*) FROM durations d WHERE d.pair = p.pair) AS total,
  (SELECT count(*) FROM durations d WHERE d.pair = p.pair AND d.minutes < 0) AS discarded,
  avg(CASE WHEN r.rn IN ((r.n + 1) / 2, (r.n + 2) / 2) THEN r.minutes END) AS median_minutes,
  max(CASE WHEN r.rn = (9 * r.n + 9) / 10 THEN r.minutes END) AS p90_minutes
FROM pairs p LEFT JOIN ranked r ON r.pair = p.pair GROUP BY p.pair;
