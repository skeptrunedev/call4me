-- What a person says they asked their AI, or searched for, when they found call4me. Optional and
-- free text: referrers show which AI sent someone, never what they asked it.
ALTER TABLE accounts ADD COLUMN found_via TEXT;
