# Restaurant availability inquiry

Attach this method to Grok Bot and ask it to create a skill. This Markdown file does not install a plugin or authorize a call. The new skill save and reuse flow has not yet been tested for this guide.

Name: Restaurant availability inquiry

When to use
Use when someone wants to check restaurant availability or walk in
conditions for a particular party and date. This is an inquiry skill,
not permission to reserve a table.

Inputs
Restaurant, date, party size, preferred time, time zone, flexibility,
relevant seating needs and permission for any external contact.
Never infer a dietary or accessibility need.

Access
Public restaurant website and booking page. A working Call4Me connector
is required only if an authorized phone inquiry is needed.

Method
1. Gather missing inputs in one message.
2. Find the restaurant's own contact and booking pages. Record sources.
3. Check public availability. Keep general policy separate from slots.
4. If a call is needed, show the business, published number, questions
   and proposed call duration. Wait for explicit permission to call.
5. Check call4me_get_requirements and collect any missing required facts.
6. Place only the authorized call, setting call4me_place_call.max_minutes
   to the approved duration. Do not reserve, pay, request a callback
   or leave a message unless separately authorized.
7. Follow the returned call id with call4me_get_call. If the call is still
   active, report that state rather than pretending to have a final answer.
8. Review the outcome and transcript. Retrieve recording metadata with
   call4me_get_recordings when available and needed to check a claim.
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
Next action and any approval needed.
