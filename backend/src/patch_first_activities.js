import { query } from './db.js';
const sql = `
BEGIN;
UPDATE process_activities
SET order_no = 9999,
    is_mandatory = FALSE,
    is_decision = FALSE,
    decision_accept_label = NULL,
    decision_reject_label = NULL,
    next_on_accept = NULL,
    next_on_reject = NULL,
    name = CASE
             WHEN name ~* '\\(deprecated\\)$' THEN name
             ELSE name || ' (deprecated)'
           END
WHERE lower(name) ~ '^(terima|penerimaan)';
WITH s AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY process_id ORDER BY order_no, name) AS new_order
  FROM process_activities WHERE order_no <> 9999
)
UPDATE process_activities pa SET order_no = s.new_order FROM s WHERE pa.id = s.id;
COMMIT;`;
await query(sql);
console.log('Deprecated reception activities and renumbered.');
process.exit(0);
