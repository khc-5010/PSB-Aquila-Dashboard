-- Communication Rules Schema for Dynamic Stakeholder Alerts
-- Run this SQL against your Neon PostgreSQL database

-- Create communication_rules table
CREATE TABLE IF NOT EXISTS communication_rules (
  id SERIAL PRIMARY KEY,
  rule_name VARCHAR(100) NOT NULL UNIQUE,
  trigger_type VARCHAR(50) NOT NULL, -- 'project_type_set', 'stage_change', 'value_threshold', 'deadline_proximity'
  trigger_condition JSONB NOT NULL, -- flexible conditions like {"project_type": "Research Agreement"} or {"to": "negotiation"}
  stakeholder_name VARCHAR(100) NOT NULL,
  stakeholder_role VARCHAR(200),
  stakeholder_email VARCHAR(200),
  engagement_level CHAR(1) NOT NULL CHECK (engagement_level IN ('A', 'C', 'I', 'O')), -- A=Approve, C=Consult, I=Inform, O=Optional
  alert_message TEXT NOT NULL,
  category VARCHAR(50), -- 'research', 'contracts', 'senior_design', 'partnership', etc.
  priority INTEGER DEFAULT 2, -- 1=high, 2=medium, 3=low
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create dismissed_alerts table
CREATE TABLE IF NOT EXISTS dismissed_alerts (
  id SERIAL PRIMARY KEY,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  rule_id INTEGER NOT NULL REFERENCES communication_rules(id) ON DELETE CASCADE,
  dismissed_by VARCHAR(100),
  dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(opportunity_id, rule_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_communication_rules_trigger_type ON communication_rules(trigger_type);
CREATE INDEX IF NOT EXISTS idx_communication_rules_active ON communication_rules(active);
CREATE INDEX IF NOT EXISTS idx_dismissed_alerts_opportunity_id ON dismissed_alerts(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_dismissed_alerts_rule_id ON dismissed_alerts(rule_id);

-- Seed initial communication rules based on Communication Matrix

-- Project Type: Research Agreement
INSERT INTO communication_rules (rule_name, trigger_type, trigger_condition, stakeholder_name, stakeholder_role, stakeholder_email, engagement_level, alert_message, category, priority)
VALUES
  ('research_alicyn', 'project_type_set', '{"project_type": "Research Agreement"}', 'Alicyn Rhoades', 'VC Research & Assoc. Dean', NULL, 'A', 'Research agreements require Alicyn''s approval. Allow 4-6 weeks for processing. Contact early to discuss scope and timeline.', 'research', 1),
  ('research_jennifer', 'project_type_set', '{"project_type": "Research Agreement"}', 'Jennifer Surrena', 'Contracts Administrator', NULL, 'C', 'Loop in Jennifer for contract drafting and review. She handles all research agreement paperwork.', 'contracts', 2)
ON CONFLICT (rule_name) DO NOTHING;

-- Project Type: Senior Design
INSERT INTO communication_rules (rule_name, trigger_type, trigger_condition, stakeholder_name, stakeholder_role, stakeholder_email, engagement_level, alert_message, category, priority)
VALUES
  ('senior_design_dean', 'project_type_set', '{"project_type": "Senior Design"}', 'Dean Lewis', 'Senior Design Coordinator', 'dal16@psu.edu', 'A', 'Senior Design projects must be coordinated through Dean Lewis. Critical: August 15 deadline for fall semester placement.', 'senior_design', 1),
  ('senior_design_tim', 'project_type_set', '{"project_type": "Senior Design"}', 'Tim Harrigan', 'Program Director', NULL, 'I', 'Inform Tim about senior design project placements for program tracking.', 'senior_design', 3)
ON CONFLICT (rule_name) DO NOTHING;

-- Project Type: Consulting Engagement
INSERT INTO communication_rules (rule_name, trigger_type, trigger_condition, stakeholder_name, stakeholder_role, stakeholder_email, engagement_level, alert_message, category, priority)
VALUES
  ('consulting_amy', 'project_type_set', '{"project_type": "Consulting Engagement"}', 'Amy Bridger', 'Partnership Lead', NULL, 'C', 'Consult Amy on partnership structure for consulting engagements. Aquila leads these projects.', 'partnership', 2)
ON CONFLICT (rule_name) DO NOTHING;

-- Project Type: Alliance Membership
INSERT INTO communication_rules (rule_name, trigger_type, trigger_condition, stakeholder_name, stakeholder_role, stakeholder_email, engagement_level, alert_message, category, priority)
VALUES
  ('alliance_amy', 'project_type_set', '{"project_type": "Alliance Membership"}', 'Amy Bridger', 'Partnership Lead', NULL, 'A', 'Amy handles all Alliance membership discussions and revenue model negotiations.', 'partnership', 1)
ON CONFLICT (rule_name) DO NOTHING;

-- Project Type: Workforce Training
INSERT INTO communication_rules (rule_name, trigger_type, trigger_condition, stakeholder_name, stakeholder_role, stakeholder_email, engagement_level, alert_message, category, priority)
VALUES
  ('workforce_tbd', 'project_type_set', '{"project_type": "Workforce Training"}', 'Program Coordinator', 'TBD', NULL, 'I', 'Workforce training projects require program-specific routing. Stakeholder to be determined based on training type.', 'training', 3)
ON CONFLICT (rule_name) DO NOTHING;

-- Stage-based rules: Negotiation stage
INSERT INTO communication_rules (rule_name, trigger_type, trigger_condition, stakeholder_name, stakeholder_role, stakeholder_email, engagement_level, alert_message, category, priority)
VALUES
  ('negotiation_amy', 'stage_change', '{"to": "negotiation"}', 'Amy Bridger', 'Partnership Lead', NULL, 'C', 'Entering negotiation phase. Consult Amy on partnership terms and contract structure.', 'partnership', 1),
  ('negotiation_bill', 'stage_change', '{"to": "negotiation"}', 'Bill Johnson', 'Legal Counsel', NULL, 'I', 'Inform legal counsel about opportunities entering contract negotiation.', 'legal', 2)
ON CONFLICT (rule_name) DO NOTHING;

-- Stage-based rules: Active stage
INSERT INTO communication_rules (rule_name, trigger_type, trigger_condition, stakeholder_name, stakeholder_role, stakeholder_email, engagement_level, alert_message, category, priority)
VALUES
  ('active_team', 'stage_change', '{"to": "active"}', 'Project Team', 'Delivery Team', NULL, 'I', 'Project is now active. Ensure delivery team is informed and kickoff meeting is scheduled.', 'delivery', 2)
ON CONFLICT (rule_name) DO NOTHING;

-- Value threshold rules
INSERT INTO communication_rules (rule_name, trigger_type, trigger_condition, stakeholder_name, stakeholder_role, stakeholder_email, engagement_level, alert_message, category, priority)
VALUES
  ('high_value_ralph', 'value_threshold', '{"min_value": 50000}', 'Ralph Martin', 'Executive Sponsor', NULL, 'I', 'High-value opportunity ($50K+). Inform executive sponsor for visibility and potential support.', 'executive', 2),
  ('very_high_value_exec', 'value_threshold', '{"min_value": 100000}', 'Executive Team', 'Leadership', NULL, 'C', 'Very high-value opportunity ($100K+). Consult with executive team on resource allocation and strategic alignment.', 'executive', 1)
ON CONFLICT (rule_name) DO NOTHING;

-- Deadline proximity rules
INSERT INTO communication_rules (rule_name, trigger_type, trigger_condition, stakeholder_name, stakeholder_role, stakeholder_email, engagement_level, alert_message, category, priority)
VALUES
  ('senior_design_deadline', 'deadline_proximity', '{"deadline": "aug_15_senior_design", "days_before": 60}', 'Dean Lewis', 'Senior Design Coordinator', 'dal16@psu.edu', 'A', 'WARNING: August 15 Senior Design deadline approaching! Projects must be finalized for fall semester placement.', 'senior_design', 1)
ON CONFLICT (rule_name) DO NOTHING;
