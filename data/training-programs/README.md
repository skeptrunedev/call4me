# Training program data

Snapshot of the RP Hypertrophy account **me@skeptrune.com** (user id `1947339`),
pulled from the live backend on **2026-10-24** through the same private API the
iOS/Android app uses.

Everything here is read-only output: nothing was modified on the account.

## What is in here

| Path | Contents |
| --- | --- |
| `raw/exercises.json` | Complete exercise catalog (313 entries) with muscle group, subtype, equipment type, YouTube demo id and notes |
| `raw/template-list.json` | 164 program templates (summary metadata) |
| `raw/templates/<key>.json` | Full detail for each template: day slots, muscle-group targets, priorities |
| `raw/mesocycle-list.json` | 5 mesocycle summaries for the account |
| `raw/mesocycles/<key>.json` | Full mesocycle trees: every week, day, exercise, set with weight/reps/status/timestamps |
| `raw/bootstrap.json` | App bootstrap payload (catalog + mesocycles + current mesocycle) |
| `raw/training-export.zip` | The app's own "Export your training data" download |
| `raw/export/rp-training-data.json` | Unzipped copy of the above (5 mesocycles, 928 KB) |
| `raw/user.json` | Profile/attributes snapshot (no token, no password) |
| `normalized/exercises.csv` | Flat catalog: name, muscle group, equipment, YouTube URL |
| `normalized/mesocycles.csv` | Per-mesocycle summary: weeks, days/week, priorities, dates |
| `normalized/days.csv` | Every training day with session status and logged bodyweight |
| `normalized/sets.csv` | **1,634 logged sets**: exercise, week, day, weight, reps, status, completion time |
| `normalized/templates.csv` | Program templates with slot/priority summaries |
| `normalized/template_slots.csv` | 4,147 template day slots (muscle-group slots, optional fixed exercise) |
| `normalized/mesocycles.json`, `normalized/exercises.json` | Same data as JSON for programmatic use |

## Numbers

- 313 exercises across 12 muscle groups (Chest 47, Back 53, Shoulders 51, Biceps 32,
  Quads 27, Glutes 27, Triceps 26, Hamstrings 15, Traps 12, Abs 9, Calves 8, Forearms 6).
  2 catalog rows are soft-deleted (`deleted_at` set).
- 164 templates, 4,147 slots.
- 5 mesocycles: *First meso* (5 wk), *Meso 2* (4 wk), *MESO 3* (6 wk),
  *8-week upper* (8 wk), *3x per week upper* (8 wk, in progress).
- 105 training days, 1,634 sets logged between 2026-02-13 and 2026-10-20.
  Set statuses: 1,482 complete, 111 skipped, 38 ready, 3 pending reps/weight.

## Schema notes

- Weights are in the mesocycle's own `unit` (all current mesocycles: `lb`).
- `sets.csv.weight` / `reps` are what was actually logged. Target columns exist in
  the API (`weightTarget`, `weightTargetMin/Max`, `repsTarget`) but were null in
  this snapshot.
- `status` values observed: `complete`, `skipped`, `ready`, `pendingReps`,
  `pendingWeight`. Days use `complete`, `partial`, `ready`.
- `set_type` was `regular` for all 1,634 sets; intensity techniques would appear
  here if used.
- Timestamps are UTC ISO-8601.
- Template slots only declare a muscle group (and sometimes a fixed exercise) —
  template sets/targets are generated server-side when a mesocycle is created.

## API routes used

All under `https://training.rpstrength.com` (Fastify backend, bearer auth):

```
POST /api/login
GET  /api/user/profile
GET  /api/training/exercises
GET  /api/training/templates
GET  /api/training/templates/{key}
GET  /api/training/{userId}/mesocycles
GET  /api/training/{userId}/mesocycles/{key}
GET  /api/training/{userId}/meta/second-meso
GET  /api/training/bootstrap
POST /api/training/export          -> signed S3 URL to the export zip
```

## Refreshing this snapshot

```bash
cd data/training-programs
RP_EMAIL='me@skeptrune.com' RP_PASSWORD='...' python3 fetch_training_data.py
```

The script reuses the cached bearer token in `.token` (mode 0600) and only asks
for a password if that token is missing or rejected. Delete `.token` to force a
fresh login. Re-running overwrites `raw/` and `normalized/`.

## Not included

- Exercise videos/images themselves — the catalog stores YouTube ids and media is
  served from `images.rpstrength.com`.
- Coaching threads, push tokens, subscription/billing details (available from
  `/api/coaching/*`, `/api/threads/unread`, `/api/user/subscriptions` if wanted).
- RP Diet app data.
