# Restaurant phone availability inquiry

Attach this calling method to Grok Bot and ask it to create a skill. This Markdown file does not install Call4Me or authorize a call. The new skill save and reuse flow has not yet been tested for this guide.

Name: Restaurant availability inquiry

When to use
Use when someone wants to check restaurant availability or walk in
conditions for a particular party and date. This is an inquiry skill,
not permission to reserve a table.

Inputs
Restaurant, date, party size, preferred time, time zone, flexibility,
relevant seating needs, approved call duration and permission for this call.
Never infer a dietary or accessibility need.

Access
Public restaurant website and booking page. A working Call4Me connector
is required for the phone inquiry. Check access with call4me_get_balance
and confirm that the account belongs to the intended user.

Method
1. Gather missing inputs in one message.
2. Find the restaurant's own contact and booking pages. Record sources.
3. Check public availability. Keep general policy separate from slots.
4. Check call4me_get_requirements and collect any missing required facts.
5. Produce a call brief with the business, published number, questions,
   facts it may share and proposed duration. Wait for permission to call.
6. Place only the authorized call, setting call4me_place_call.max_minutes
   to the approved duration. Do not reserve, pay, request a callback
   or leave a message unless separately authorized.
7. Make only one call. Follow that returned id with call4me_get_call.
   If the call is still active, report that state rather than pretending
   to have a final answer.
8. Review the outcome and transcript. Retrieve recording metadata for
   the same id with call4me_get_recordings. If unavailable, say so.
   Inspect the recording when a summary's claim is ambiguous.
9. Report confirmed facts, source type, unresolved questions and next step.

Failure handling
Missing connector: give setup steps and stop before the call.
Missing facts: ask, do not fill them from an old task.
Menu or voicemail: report recorded policy and unanswered questions.
Tool error: report the actual error without exposing secrets. Do not
launch another call automatically; check the current call state first.
Business asks to book or pay: stop at the approval boundary.

Output
Restaurant and requested party/date/time.
Confirmed facts with source and date checked.
Whether a person answered or only a recording supplied information.
Unanswered questions.
Actual call id if one exists, and final or currently observed call state.
Transcript and recording references when available, without exposed keys.
Next action and any approval needed.
