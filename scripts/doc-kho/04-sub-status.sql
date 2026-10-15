WITH RECURSIVE
-- Lặp mọi POS, kể cả POS tắt; ép tìm theo tiền tố POS + khoảng first_closed_at.
orders AS MATERIALIZED (
  SELECT o.sub_status
  FROM pos_shops p
  CROSS JOIN raw_pos_orders o INDEXED BY idx_raw_orders_pos_closed_status_money
  WHERE o.pos_id = p.id
    AND o.first_closed_at >= strftime('%Y-%m-%dT%H:%M:%S', 'now', '-7 days')
    AND o.first_closed_at < strftime('%Y-%m-%dT%H:%M:%S', 'now')
    AND o.status_code NOT IN (0, 6, 7)
)
SELECT CASE WHEN sub_status IS NULL THEN 'không rõ'
    WHEN typeof(sub_status) = 'integer' THEN CAST(sub_status AS TEXT)
    ELSE 'giá trị khác' END AS label,
  count(*) AS n, (SELECT count(*) FROM orders) AS total
FROM orders GROUP BY label ORDER BY n DESC, label;
