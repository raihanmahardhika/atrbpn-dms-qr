CREATE TABLE IF NOT EXISTS processes (
  id UUID PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS process_activities (
  id UUID PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_no INTEGER NOT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  is_decision BOOLEAN NOT NULL DEFAULT FALSE,
  decision_accept_label TEXT,
  decision_reject_label TEXT,
  next_on_accept UUID REFERENCES process_activities(id),
  next_on_reject UUID REFERENCES process_activities(id)
);
CREATE INDEX IF NOT EXISTS idx_process_activities_process ON process_activities(process_id, order_no);

CREATE TABLE IF NOT EXISTS admins (
  admin_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  office_type TEXT NOT NULL,
  region TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  process_id UUID REFERENCES processes(id),
  doc_type TEXT NOT NULL,
  office_type TEXT,
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS activity_scans (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  process_activity_id UUID REFERENCES process_activities(id),
  activity_name TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER,
  waiting_seconds INTEGER,
  resting_seconds INTEGER,
  next_activity_id UUID REFERENCES process_activities(id)
);

CREATE INDEX IF NOT EXISTS idx_activity_document ON activity_scans(document_id);
CREATE INDEX IF NOT EXISTS idx_activity_open ON activity_scans(document_id, end_time);

ALTER TABLE public.documents DROP COLUMN IF EXISTS customer_name;
ALTER TABLE public.documents DROP COLUMN IF EXISTS doc_number;

ALTER TABLE public.activity_scans ADD COLUMN IF NOT EXISTS resting_seconds INTEGER;
ALTER TABLE public.activity_scans DROP COLUMN IF EXISTS employee_name;
ALTER TABLE public.activity_scans DROP COLUMN IF EXISTS office_type;
ALTER TABLE public.activity_scans DROP COLUMN IF EXISTS region;
