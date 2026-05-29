-- Threads 2+3: Unified task entity for assignment + forward-looking work
-- Run once in the Neon SQL Editor after deploying the new code.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS prospect_tasks (
  id SERIAL PRIMARY KEY,
  prospect_id INTEGER NOT NULL REFERENCES prospect_companies(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  due_date DATE,
  assignee TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  completed_by TEXT
);

-- Index for the "My Tasks" badge query: (assignee = me OR assignee IS NULL) AND status = 'open'
CREATE INDEX IF NOT EXISTS idx_prospect_tasks_assignee_status
  ON prospect_tasks(assignee, status);

-- Index for per-prospect task lookups (ProspectDetail Tasks section, table column counts)
CREATE INDEX IF NOT EXISTS idx_prospect_tasks_prospect_status
  ON prospect_tasks(prospect_id, status);

-- Index for sort-by-due-date in TasksView
CREATE INDEX IF NOT EXISTS idx_prospect_tasks_due_date
  ON prospect_tasks(due_date);
