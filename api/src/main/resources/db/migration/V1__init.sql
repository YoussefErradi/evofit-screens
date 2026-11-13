CREATE TABLE rounds (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE exercises (
  id UUID PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES rounds(id),
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 16),
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  video_filename TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (round_id, position)
);

CREATE TABLE screens (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  round_id INTEGER NOT NULL UNIQUE REFERENCES rounds(id),
  token_hash TEXT,
  pairing_code_hash TEXT,
  pairing_expires_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE rotation_cycles (
  id UUID PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES rounds(id),
  cycle_number INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, cycle_number),
  UNIQUE (round_id, start_date)
);

CREATE TABLE rotation_days (
  cycle_id UUID NOT NULL REFERENCES rotation_cycles(id) ON DELETE CASCADE,
  operating_date DATE NOT NULL,
  day_number INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 8),
  upper_exercise_id UUID NOT NULL REFERENCES exercises(id),
  lower_exercise_id UUID NOT NULL REFERENCES exercises(id),
  PRIMARY KEY (cycle_id, day_number),
  UNIQUE (cycle_id, operating_date),
  CHECK (upper_exercise_id <> lower_exercise_id)
);
CREATE INDEX rotation_days_date_idx ON rotation_days(operating_date);

CREATE TABLE members (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  starts_on DATE NOT NULL,
  expires_on DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_on >= starts_on)
);

INSERT INTO rounds(id, name) VALUES (1, 'Power Start'), (2, 'Strength & Core'), (3, 'Fighter Finish');

INSERT INTO exercises(id, round_id, position, title)
SELECT gen_random_uuid(), r.id, p.position, 'Exercise ' || p.position
FROM rounds r CROSS JOIN generate_series(1, 16) AS p(position);

INSERT INTO screens(id, name, round_id)
SELECT gen_random_uuid(), 'Display ' || id, id FROM rounds;
