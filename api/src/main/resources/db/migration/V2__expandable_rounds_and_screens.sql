CREATE SEQUENCE rounds_id_seq OWNED BY rounds.id;
SELECT setval('rounds_id_seq', (SELECT COALESCE(MAX(id), 1) FROM rounds));
ALTER TABLE rounds ALTER COLUMN id SET DEFAULT nextval('rounds_id_seq');

ALTER TABLE screens DROP CONSTRAINT IF EXISTS screens_round_id_key;
CREATE INDEX screens_round_id_idx ON screens(round_id);
