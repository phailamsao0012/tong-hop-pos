-- An API token was entered in the numeric Shop ID field. Remove only that
-- misplaced value; the token is now held in a Site runtime secret.
UPDATE pos_shops
SET shop_id = NULL, status = 'pending', last_error = NULL
WHERE id = 'sieu-vo-gao' AND shop_id LIKE 'pos_user_%';
