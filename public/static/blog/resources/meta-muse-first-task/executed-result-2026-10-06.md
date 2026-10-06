# Consumer Muse library call, October 6, 2026

This is an actual execution report, separate from the blank preparation templates.
The client was consumer Meta Muse with the previously saved Call4me custom
connector. This did not test Muse Code or native Muse calling.

## Connection and approved call

The saved connector appeared in Muse Settings and Connectors with a Disconnect
action. A fresh conversation then returned a successful balance result. Muse
reported reading its existing skill and connector, discovering current tools,
running the balance request once and inspecting general requirements and the
caller profile without changing it. No credentials were entered again.

After approval, Muse placed exactly one informational call to San Francisco
Public Library Main Library at its published number, (415) 557 4400. The source
https://sfpl.org/locations/main-library was rechecked October 6 and listed Tuesday
hours of 9 am to 8 pm Pacific. The call began at 4:22 pm Pacific.

Call ID: call_pk4x8psku92xtb48. Independently checked final state: completed.
The saved call request retained max_minutes 4. The business ended the call after
goodbyes. No reservation, purchase, hold, voicemail or callback was requested.

Muse followed the same ID and retrieved its transcript with call4me_get_call,
then retrieved recording metadata with call4me_get_recordings. Its task activity also reported
saving the findings in memory; persistent storage and future recall were not
independently audited.

## Answers from the human staff member

| Question | Answer supported by the recording |
| :--- | :--- |
| Adult quiet laptop use in general seating | Yes |
| Outlet seating | Floors three, four and five |
| WiFi password | No password |
| Library card for WiFi | Not required; anyone can use the WiFi |
| Other restrictions or time limits | The staff member answered no and advised keeping volume low |

The automated menu supplied routing instructions before a transfer to staff.
The recording does not establish which keypad digit was sent.

The caller's card question ended with an unfinished “or for just” before the
answer. A separate card rule for seating is not established, despite the automated
recap extending the answer to seating. A seat, available outlet, WiFi speed and
future conditions were not checked. The network name was spoken as SFPL Library
WiFi, with a letter differing between source transcriptions; no device network
label was verified. The brief restrictions answer is not a complete policy audit.

## Recording review

Public recording: https://call4.me/static/blog/muse-main-library-laptop-seating.mp3

Player and reviewed transcript:
https://call4.me/blog/meta-muse-first-task#hear-the-actual-muse-library-call

The exact provider leg was matched to the saved call. Source and exported audio
both decode to 108.72 seconds. The complete menu, transfer, conversation and
goodbyes remain at their original timing and in their original voices. Export
applies loudness normalization and removes file metadata. No private identifying
speech was found in the saved text and two independent source transcriptions, so
no mute spans were applied. Two independent export transcriptions and decoded
duration were checked. No human listening verification is claimed.

This result demonstrates one successful consumer Muse calling workflow through
Call4me. It is not a promise of future seat availability, a comparison of calling
services or a guarantee that every later Muse conversation will work.
