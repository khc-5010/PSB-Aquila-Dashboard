-- Key Dates Schema for Alliance Calendar Integration
-- Run this SQL against your Neon PostgreSQL database

-- Create key_dates table
CREATE TABLE IF NOT EXISTS key_dates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  date_type VARCHAR(50) NOT NULL, -- 'deadline', 'shutdown', 'event', 'recurring'

  -- For fixed dates
  fixed_date DATE,
  end_date DATE,

  -- For recurring dates (month/day)
  recurring_month INTEGER CHECK (recurring_month >= 1 AND recurring_month <= 12),
  recurring_day INTEGER CHECK (recurring_day >= 1 AND recurring_day <= 31),
  recurring_end_month INTEGER CHECK (recurring_end_month >= 1 AND recurring_end_month <= 12),
  recurring_end_day INTEGER CHECK (recurring_end_day >= 1 AND recurring_end_day <= 31),

  -- Warning thresholds (days before)
  warn_days_red INTEGER DEFAULT 14,
  warn_days_yellow INTEGER DEFAULT 30,
  warn_days_blue INTEGER DEFAULT 60,

  -- Project type filtering (NULL = applies to all)
  applies_to_project_types TEXT[],

  -- Display settings
  warning_message TEXT,
  action_suggestion TEXT,
  is_opportunity BOOLEAN DEFAULT false, -- Is this an opportunity (e.g., career fair)?
  priority INTEGER DEFAULT 2, -- 1=high, 2=medium, 3=low
  active BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_key_dates_date_type ON key_dates(date_type);
CREATE INDEX IF NOT EXISTS idx_key_dates_active ON key_dates(active);
CREATE INDEX IF NOT EXISTS idx_key_dates_fixed_date ON key_dates(fixed_date);

-- Seed initial key dates

-- Senior Design Deadline (August 15, recurring)
INSERT INTO key_dates (name, description, date_type, recurring_month, recurring_day, warn_days_red, warn_days_yellow, warn_days_blue, applies_to_project_types, warning_message, priority)
VALUES (
  'Senior Design Project Deadline',
  'Deadline for fall semester Senior Design project placements',
  'deadline',
  8, 15,
  14, 45, 90,
  ARRAY['Senior Design'],
  'Projects must be finalized by August 15 for fall semester placement. Contact Dean Lewis (dal16@psu.edu) immediately.',
  1
)
ON CONFLICT DO NOTHING;

-- Winter Shutdown (Dec 20 - Jan 6, recurring)
INSERT INTO key_dates (name, description, date_type, recurring_month, recurring_day, recurring_end_month, recurring_end_day, warn_days_red, warn_days_yellow, warn_days_blue, applies_to_project_types, warning_message, priority)
VALUES (
  'PSB Winter Shutdown',
  'University closed - no contract processing during this period',
  'shutdown',
  12, 20,
  1, 6,
  7, 21, 45,
  ARRAY['Research Agreement', 'Senior Design', 'Consulting Engagement'],
  'No contract processing during winter shutdown (Dec 20 - Jan 6). Plan submissions accordingly.',
  1
)
ON CONFLICT DO NOTHING;

-- Fall Career Fair (typically late September, recurring)
INSERT INTO key_dates (name, description, date_type, recurring_month, recurring_day, warn_days_red, warn_days_yellow, warn_days_blue, warning_message, action_suggestion, is_opportunity, priority)
VALUES (
  'PSB Fall Career Fair',
  'Annual fall career fair - opportunity for industry engagement',
  'event',
  9, 25,
  7, 21, 60,
  'PSB Fall Career Fair approaching',
  'Great opportunity to meet potential partners and promote alliance opportunities',
  true,
  2
)
ON CONFLICT DO NOTHING;

-- Spring Career Fair (typically mid-February, recurring)
INSERT INTO key_dates (name, description, date_type, recurring_month, recurring_day, warn_days_red, warn_days_yellow, warn_days_blue, warning_message, action_suggestion, is_opportunity, priority)
VALUES (
  'PSB Spring Career Fair',
  'Annual spring career fair - opportunity for industry engagement',
  'event',
  2, 15,
  7, 21, 60,
  'PSB Spring Career Fair approaching',
  'Connect with companies for summer/fall opportunities',
  true,
  2
)
ON CONFLICT DO NOTHING;

-- ANTEC 2026 (fixed date example)
INSERT INTO key_dates (name, description, date_type, fixed_date, warn_days_red, warn_days_yellow, warn_days_blue, warning_message, action_suggestion, is_opportunity, priority)
VALUES (
  'ANTEC 2026',
  'Annual Technical Conference - plastics industry event',
  'event',
  '2026-05-04',
  14, 45, 90,
  'ANTEC 2026 conference approaching',
  'Prime networking opportunity for plastics industry partnerships',
  true,
  2
)
ON CONFLICT DO NOTHING;

-- Fasenmyer Conference (fixed date example)
INSERT INTO key_dates (name, description, date_type, fixed_date, warn_days_red, warn_days_yellow, warn_days_blue, warning_message, action_suggestion, is_opportunity, priority)
VALUES (
  'Fasenmyer Conference 2025',
  'Annual entrepreneurship and innovation conference at PSB',
  'event',
  '2025-04-10',
  7, 30, 60,
  'Fasenmyer Conference approaching',
  'Excellent venue to showcase alliance projects and recruit partners',
  true,
  2
)
ON CONFLICT DO NOTHING;

-- PSB Innovation Conference
INSERT INTO key_dates (name, description, date_type, fixed_date, warn_days_red, warn_days_yellow, warn_days_blue, warning_message, action_suggestion, is_opportunity, priority)
VALUES (
  'PSB Innovation Showcase 2025',
  'Annual innovation and technology showcase event',
  'event',
  '2025-10-15',
  7, 30, 60,
  'PSB Innovation Showcase approaching',
  'Opportunity to demonstrate AI capabilities and connect with industry leaders',
  true,
  2
)
ON CONFLICT DO NOTHING;

-- Fall Semester Start
INSERT INTO key_dates (name, description, date_type, recurring_month, recurring_day, warn_days_red, warn_days_yellow, warn_days_blue, applies_to_project_types, warning_message, priority)
VALUES (
  'Fall Semester Start',
  'Fall semester begins - Senior Design projects kick off',
  'recurring',
  8, 26,
  7, 14, 30,
  ARRAY['Senior Design'],
  'Fall semester starting soon. Ensure project scopes are finalized.',
  2
)
ON CONFLICT DO NOTHING;

-- Spring Semester Start
INSERT INTO key_dates (name, description, date_type, recurring_month, recurring_day, warn_days_red, warn_days_yellow, warn_days_blue, applies_to_project_types, warning_message, priority)
VALUES (
  'Spring Semester Start',
  'Spring semester begins',
  'recurring',
  1, 13,
  7, 14, 30,
  ARRAY['Senior Design'],
  'Spring semester starting soon.',
  2
)
ON CONFLICT DO NOTHING;

-- Research Agreement Processing Reminder (informational)
INSERT INTO key_dates (name, description, date_type, recurring_month, recurring_day, warn_days_red, warn_days_yellow, warn_days_blue, applies_to_project_types, warning_message, action_suggestion, priority)
VALUES (
  'Q4 Research Agreement Planning',
  'Reminder to start research agreements early due to 4-6 week processing',
  'recurring',
  10, 1,
  7, 21, 45,
  ARRAY['Research Agreement'],
  'Start research agreement paperwork now for year-end completion',
  'Allow 4-6 weeks for research agreement processing. Contact Alicyn Rhoades early.',
  2
)
ON CONFLICT DO NOTHING;
