WITH RECURSIVE
-- Lặp mọi POS, kể cả POS tắt; ép tìm theo tiền tố POS + khoảng first_closed_at.
orders AS MATERIALIZED (
  SELECT o.id, o.pos_id, o.seller_id, o.care_id, o.status_code, o.status_history_json
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
paths AS (
  SELECT o.id,
    max(CASE WHEN e.new_status = 17 OR e.old_status = 17 OR o.status_code = 17 THEN 1 ELSE 0 END) AS has17,
    max(CASE WHEN e.new_status = 1 OR e.old_status = 1 OR o.status_code = 1 THEN 1 ELSE 0 END) AS has1,
    max(CASE WHEN e.new_status IN (8,9,2,3,4,5,15,16) OR e.old_status IN (8,9,2,3,4,5,15,16)
      OR o.status_code IN (8,9,2,3,4,5,15,16) THEN 1 ELSE 0 END) AS packed
  FROM orders o LEFT JOIN status_events e ON e.id = o.id GROUP BY o.id
)
SELECT 'has17' AS metric, coalesce(sum(has17), 0) AS n, count(*) AS total FROM paths
UNION ALL SELECT 'has1', coalesce(sum(has1), 0), count(*) FROM paths
UNION ALL SELECT 'has1_without17', coalesce(sum(has1 = 1 AND has17 = 0), 0), count(*) FROM paths
UNION ALL SELECT 'packed', coalesce(sum(packed), 0), count(*) FROM paths;
