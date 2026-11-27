-- The feedback credit drops from $25 to $10 (Nick, Nov 27): the welcome email offers what the
-- grant now gives. Only the offer's wording changes, so the rest of a hand-edited template stays.
UPDATE email_templates
SET body = replace(body, 'happy to give you $25 in credits', 'happy to give you $10 in credits'),
    updated_at = CAST(unixepoch('subsec') * 1000 AS INTEGER)
WHERE key = 'welcome' AND instr(body, 'happy to give you $25 in credits') > 0;
