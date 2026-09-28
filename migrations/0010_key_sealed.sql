-- The account's API key, encrypted (AES-GCM, lib/keys.ts sealKey) so the site can put it
-- into the copy prompts on every page for the signed-in owner. key_hash stays the lookup.
ALTER TABLE accounts ADD COLUMN key_sealed TEXT;
