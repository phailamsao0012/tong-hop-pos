CREATE TABLE IF NOT EXISTS marketer_ids (
  marketer_id TEXT PRIMARY KEY NOT NULL,
  first_seen_at TEXT,
  last_seen_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_pos_customers_assigned_pos
ON pos_customers(assigned_user_id,pos_id) WHERE assigned_user_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS calls_coverage_pos (
  pos_id TEXT PRIMARY KEY NOT NULL,
  customers INTEGER NOT NULL DEFAULT 0,
  notes INTEGER NOT NULL DEFAULT 0,
  first_note TEXT,
  last_fetch TEXT
);
--> statement-breakpoint
CREATE TRIGGER calls_coverage_customer_insert AFTER INSERT ON pos_customers BEGIN
  UPDATE calls_coverage_pos SET customers=customers+1 WHERE pos_id=NEW.pos_id;
END;
--> statement-breakpoint
CREATE TRIGGER calls_coverage_customer_delete AFTER DELETE ON pos_customers BEGIN
  UPDATE calls_coverage_pos SET customers=customers-1 WHERE pos_id=OLD.pos_id;
END;
--> statement-breakpoint
CREATE TRIGGER calls_coverage_customer_move AFTER UPDATE OF pos_id ON pos_customers WHEN OLD.pos_id<>NEW.pos_id BEGIN
  UPDATE calls_coverage_pos SET customers=customers-1 WHERE pos_id=OLD.pos_id;
  UPDATE calls_coverage_pos SET customers=customers+1 WHERE pos_id=NEW.pos_id;
END;
--> statement-breakpoint
CREATE TRIGGER calls_coverage_note_insert AFTER INSERT ON customer_notes BEGIN
  UPDATE calls_coverage_pos SET notes=notes+1,
    first_note=CASE WHEN first_note IS NULL OR NEW.created_at<first_note THEN NEW.created_at ELSE first_note END,
    last_fetch=CASE WHEN last_fetch IS NULL OR NEW.fetched_at>last_fetch THEN NEW.fetched_at ELSE last_fetch END
  WHERE pos_id=NEW.pos_id;
END;
--> statement-breakpoint
CREATE TRIGGER calls_coverage_note_delete AFTER DELETE ON customer_notes BEGIN
  UPDATE calls_coverage_pos SET notes=notes-1,
    first_note=CASE WHEN OLD.created_at=first_note THEN (SELECT MIN(created_at) FROM customer_notes WHERE pos_id=OLD.pos_id) ELSE first_note END,
    last_fetch=CASE WHEN OLD.fetched_at=last_fetch THEN (SELECT MAX(fetched_at) FROM customer_notes WHERE pos_id=OLD.pos_id) ELSE last_fetch END
  WHERE pos_id=OLD.pos_id;
END;
--> statement-breakpoint
CREATE TRIGGER calls_coverage_note_update AFTER UPDATE OF pos_id,created_at,fetched_at ON customer_notes
WHEN OLD.pos_id IS NOT NEW.pos_id OR OLD.created_at IS NOT NEW.created_at OR OLD.fetched_at IS NOT NEW.fetched_at BEGIN
  UPDATE calls_coverage_pos SET notes=notes-1,
    first_note=CASE WHEN OLD.created_at=first_note THEN (SELECT MIN(created_at) FROM customer_notes WHERE pos_id=OLD.pos_id) ELSE first_note END,
    last_fetch=CASE WHEN OLD.fetched_at=last_fetch THEN (SELECT MAX(fetched_at) FROM customer_notes WHERE pos_id=OLD.pos_id) ELSE last_fetch END
  WHERE pos_id=OLD.pos_id;
  UPDATE calls_coverage_pos SET notes=notes+1,
    first_note=CASE WHEN first_note IS NULL OR NEW.created_at<first_note THEN NEW.created_at ELSE first_note END,
    last_fetch=CASE WHEN last_fetch IS NULL OR NEW.fetched_at>last_fetch THEN NEW.fetched_at ELSE last_fetch END
  WHERE pos_id=NEW.pos_id;
END;
