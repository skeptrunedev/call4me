-- The welcome email links the ChatGPT plugin: ChatGPT users can only call through it, and the old
-- copy only said to paste a prompt. Changes the stored copy only where it is still the seeded text,
-- so a hand-edited template is left alone.
UPDATE email_templates SET body = 'hey, I''m Nick, the creator of call4me. thank you so much for signing up! to make your first call: in chatgpt, add the call4me plugin at https://chatgpt.com/plugins/plugin_asdk_app_6abdec89d46c81919cda058ca9f62cb8 and sign in with this email. in claude, codex or another agent, paste the prompt from {host}/#install-prompt. you can add credits anytime at {addCredits}.

If you reply with feedback, I''m happy to give you $25 in credits. Anything helps, including how you found it and why you signed up.

Here''s my cell # for imessage or whatsapp - 7379832612 .

- Nick', updated_at = CAST(unixepoch('subsec') * 1000 AS INTEGER)
WHERE key = 'welcome' AND body = 'hey, I''m Nick, the creator of call4me. thank you so much for signing up! to get started, add credits at {addCredits} and paste the prompt from {host} into your agent.

If you reply with feedback, I''m happy to give you $25 in credits. Anything helps, including how you found it and why you signed up.

Here''s my cell # for imessage or whatsapp - 7379832612 .

- Nick';
