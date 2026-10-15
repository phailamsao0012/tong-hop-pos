WITH RECURSIVE
-- Lặp mọi POS, kể cả POS tắt; ép tìm theo tiền tố POS + khoảng first_closed_at.
orders AS MATERIALIZED (
  SELECT o.id, o.tags_json
  FROM pos_shops p
  CROSS JOIN raw_pos_orders o INDEXED BY idx_raw_orders_pos_closed_status_money
  WHERE o.pos_id = p.id
    AND o.first_closed_at >= strftime('%Y-%m-%dT%H:%M:%S', 'now', '-7 days')
    AND o.first_closed_at < strftime('%Y-%m-%dT%H:%M:%S', 'now')
    AND o.status_code NOT IN (0, 6, 7)
),
tags AS (
  SELECT DISTINCT o.id, trim(CAST(json_extract(t.value, '$.name') AS TEXT)) AS label
  FROM orders o, json_each(CASE WHEN json_valid(o.tags_json) AND json_type(o.tags_json) = 'array'
    THEN o.tags_json ELSE '[]' END) t WHERE t.type = 'object' AND json_type(t.value, '$.name') = 'text'
),
grouped AS (
  SELECT label, count(*) AS n, (SELECT count(*) FROM orders) AS total FROM tags
  WHERE label <> '' AND length(label) <= 100
    AND label NOT GLOB '*[0-9][0-9][0-9][0-9][0-9][0-9]*'
    AND instr(label, '@') = 0 AND instr(label, '://') = 0
    AND label NOT GLOB '*[0-9]*[0-9]*[0-9]*[0-9]*[0-9]*[0-9]*'
  GROUP BY label
)
SELECT label, n, total FROM grouped WHERE n * 100.0 >= total * 3 ORDER BY n DESC, label;
