-- Where a browser first came from (lib/first-touch.ts), recorded by us since gtag is often
-- blocked. A checkout keeps its browser's; an account keeps the first one it is seen with, and
-- its GA events carry it as user properties.
ALTER TABLE accounts ADD COLUMN first_touch TEXT;
ALTER TABLE topups ADD COLUMN first_touch TEXT;
