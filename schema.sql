-- Cloudflare D1 Schema for Cloud & K8s Study Command Center
-- Execute locally: npx wrangler d1 execute study_command_center_db --local --file=./schema.sql
-- Execute in prod: npx wrangler d1 execute study_command_center_db --remote --file=./schema.sql

DROP TABLE IF EXISTS courses;
CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  color TEXT NOT NULL,
  target_date TEXT NOT NULL,
  target_hours REAL DEFAULT 40,
  passing_score TEXT DEFAULT '700 / 1000',
  status TEXT DEFAULT 'active',
  domains_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS decisions;
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  course_id TEXT,
  target_date TEXT,
  pinned INTEGER DEFAULT 1,
  completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS study_logs;
CREATE TABLE study_logs (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  domain_name TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  hours REAL NOT NULL,
  session_date TEXT NOT NULL,
  reflection TEXT,
  ai_takeaway TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS notes;
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags_json TEXT DEFAULT '[]',
  ai_summary TEXT,
  ai_flashcards_json TEXT DEFAULT '[]',
  r2_asset_key TEXT,
  r2_asset_name TEXT,
  embedding_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS challenges;
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  est_minutes INTEGER DEFAULT 35,
  title TEXT NOT NULL,
  scenario TEXT NOT NULL,
  environment_note TEXT NOT NULL,
  tasks_json TEXT NOT NULL,
  cli_verification TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  completed_at TEXT
);

DROP TABLE IF EXISTS mock_exams;
CREATE TABLE mock_exams (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  score_pct REAL NOT NULL,
  raw_score TEXT NOT NULL,
  weak_domain TEXT,
  exam_date TEXT NOT NULL
);

CREATE INDEX idx_logs_course ON study_logs(course_id, session_date);
CREATE INDEX idx_notes_course ON notes(course_id);
CREATE INDEX idx_challenges_course ON challenges(course_id, completed);
