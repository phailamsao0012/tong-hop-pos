WITH RECURSIVE
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
)
SELECT s.suffix AS label, count(DISTINCT s.user_id) AS n,
  (SELECT count(DISTINCT user_id) FROM pos_users) AS total
FROM user_suffix s JOIN allowed_suffix a ON a.suffix = s.suffix
GROUP BY s.suffix ORDER BY n DESC, label;
