CREATE INDEX members_expires_on_idx ON members(expires_on);
CREATE INDEX screens_token_hash_idx ON screens(token_hash) WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX screens_pairing_code_hash_idx ON screens(pairing_code_hash) WHERE pairing_code_hash IS NOT NULL;
