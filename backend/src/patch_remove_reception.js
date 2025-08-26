import { query } from './db.js';
const sql = `
BEGIN;
WITH dels AS (
  SELECT id FROM process_activities
  WHERE lower(name) ~ '^(terima|penerimaan)'
)
UPDATE activity_scans SET process_activity_id = NULL WHERE process_activity_id IN (SELECT id FROM dels);
UPDATE activity_scans SET next_activity_id = NULL WHERE next_activity_id IN (SELECT id FROM dels);
UPDATE process_activities SET next_on_accept = NULL WHERE next_on_accept IN (SELECT id FROM dels);
UPDATE process_activities SET next_on_reject = NULL WHERE next_on_reject IN (SELECT id FROM dels);
DELETE FROM process_activities WHERE id IN (SELECT id FROM dels);
WITH s AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY process_id ORDER BY order_no, name) AS new_order
  FROM process_activities
)
UPDATE process_activities pa SET order_no = s.new_order FROM s WHERE pa.id = s.id;
COMMIT;`;
await query(sql);
console.log('Removed reception activities and renumbered.');
process.exit(0);
