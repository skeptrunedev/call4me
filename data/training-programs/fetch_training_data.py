#!/usr/bin/env python3
"""Download the RP Hypertrophy training database for one account.

Usage:
    RP_EMAIL='you@example.com' RP_PASSWORD='...' python3 fetch_rp_data.py

Writes raw API responses plus normalized CSV/JSON views. Credentials are used
only for the login request; the returned bearer token is cached in .token so
re-runs do not need the password (delete .token to force a fresh login).
"""

import csv
import io
import json
import os
import pathlib
import sys
import urllib.request
import zipfile

BASE = "https://training.rpstrength.com"
ROOT = pathlib.Path(__file__).resolve().parent
RAW = ROOT / "raw"
NORM = ROOT / "normalized"
TOKEN_FILE = ROOT / ".token"

MUSCLE_GROUPS = {
    1: "Chest", 2: "Back", 3: "Triceps", 4: "Biceps", 5: "Shoulders",
    6: "Quads", 7: "Glutes", 8: "Hamstrings", 9: "Calves", 10: "Traps",
    11: "Forearms", 12: "Abs",
}


def request(method, path, token=None, body=None, raw_response=False):
    url = path if path.startswith("http") else BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("accept", "application/json")
    if data:
        req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = resp.read()
    return payload if raw_response else json.loads(payload)


def login():
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text().strip()
        try:
            user = request("GET", "/api/user/profile", token)
            print(f"reusing cached token for user {user.get('id')}")
            return token, user
        except Exception:
            print("cached token rejected; logging in again")
    email = os.environ.get("RP_EMAIL")
    password = os.environ.get("RP_PASSWORD")
    if not email or not password:
        sys.exit("set RP_EMAIL and RP_PASSWORD (or keep a valid .token file)")
    user = request("POST", "/api/login", body={"email": email, "password": password})
    token = user.pop("token")
    TOKEN_FILE.write_text(token + "\n")
    TOKEN_FILE.chmod(0o600)
    return token, user


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2))
    return len(path.read_bytes())


def main():
    token, user = login()
    uid = user["id"]
    print(f"account: {user.get('email')} (id {uid})")

    RAW.mkdir(exist_ok=True)
    NORM.mkdir(exist_ok=True)
    dump(RAW / "user.json", user)

    bootstrap = request("GET", "/api/training/bootstrap", token)
    print("bootstrap:", dump(RAW / "bootstrap.json", bootstrap), "bytes")
    dump(RAW / "meta-second-meso.json", request("GET", f"/api/training/{uid}/meta/second-meso", token))

    exercises = request("GET", "/api/training/exercises", token)
    dump(RAW / "exercises.json", exercises)
    print(f"exercises: {len(exercises)}")

    summaries = request("GET", f"/api/training/{uid}/mesocycles", token)
    dump(RAW / "mesocycle-list.json", summaries)
    print(f"mesocycle summaries: {len(summaries)}")

    templates = request("GET", "/api/training/templates", token)
    dump(RAW / "template-list.json", templates)
    print(f"template summaries: {len(templates)}")
    template_details = []
    for summary in templates:
        key = summary["key"]
        detail = request("GET", f"/api/training/templates/{key}", token)
        dump(RAW / "templates" / f"{key}.json", detail)
        template_details.append(detail)
    print(f"template details: {len(template_details)}")

    mesos = []
    for summary in summaries:
        key = summary["key"]
        detail = request("GET", f"/api/training/{uid}/mesocycles/{key}", token)
        dump(RAW / "mesocycles" / f"{key}.json", detail)
        mesos.append(detail)
        print(f"  mesocycle {key} {detail.get('name')!r}: {len(detail.get('weeks') or [])} weeks")

    # The app's own "Export your training data" download.
    export = request("POST", "/api/training/export", token, body={})
    zip_bytes = request("GET", export["url"], raw_response=True)
    (RAW / "training-export.zip").write_bytes(zip_bytes)
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for name in zf.namelist():
            target = RAW / "export" / pathlib.Path(name).name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(name))
            print("export member:", name, target.stat().st_size, "bytes")

    by_exercise = {e["id"]: e for e in exercises}
    exercise_rows = []
    for e in exercises:
        exercise_rows.append({
            "id": e["id"],
            "name": e["name"],
            "muscle_group": MUSCLE_GROUPS.get(e.get("muscleGroupId"), ""),
            "muscle_group_id": e.get("muscleGroupId"),
            "mg_sub_type": e.get("mgSubType") or "",
            "exercise_type": e.get("exerciseType") or "",
            "youtube_id": e.get("youtubeId") or "",
            "youtube_url": f"https://www.youtube.com/watch?v={e['youtubeId']}" if e.get("youtubeId") else "",
            "notes": "; ".join(map(str, e.get("notes") or [])),
            "user_id": e.get("userId") or "",
            "created_at": e.get("createdAt") or "",
            "updated_at": e.get("updatedAt") or "",
            "deleted_at": e.get("deletedAt") or "",
        })
    write_csv(NORM / "exercises.csv", exercise_rows)

    meso_rows, day_rows, set_rows = [], [], []
    for meso in mesos:
        weeks = meso.get("weeks") or []
        meso_rows.append({
            "id": meso.get("id"),
            "key": meso.get("key"),
            "name": meso.get("name"),
            "days_per_week": meso.get("days"),
            "weeks": len(weeks),
            "unit": meso.get("unit"),
            "status": meso.get("status"),
            "created_at": meso.get("createdAt"),
            "finished_at": meso.get("finishedAt") or "",
            "last_workout_finished_at": meso.get("lastWorkoutFinishedAt") or "",
            "micro_rirs": meso.get("microRirs"),
            "priorities": "; ".join(
                f"{MUSCLE_GROUPS.get(int(k), k)}:{v.get('mgPriorityType')}"
                for k, v in sorted((meso.get("priorities") or {}).items(), key=lambda kv: int(kv[0]))
            ),
        })
        for wi, week in enumerate(weeks):
            for day in week.get("days") or []:
                day_rows.append({
                    "meso_key": meso.get("key"),
                    "meso_name": meso.get("name"),
                    "week_index": wi,
                    "day_position": day.get("position"),
                    "day_label": day.get("label"),
                    "bodyweight": day.get("bodyweight"),
                    "unit": day.get("unit"),
                    "status": day.get("status") or "",
                    "finished_at": day.get("finishedAt") or "",
                })
                for ex in day.get("exercises") or []:
                    name = (by_exercise.get(ex.get("exerciseId")) or {}).get("name", "")
                    for s in ex.get("sets") or []:
                        set_rows.append({
                            "meso_key": meso.get("key"),
                            "meso_name": meso.get("name"),
                            "week_index": wi,
                            "day_position": day.get("position"),
                            "day_label": day.get("label"),
                            "day_finished_at": day.get("finishedAt") or "",
                            "exercise_position": ex.get("position"),
                            "exercise_id": ex.get("exerciseId"),
                            "exercise_name": name,
                            "muscle_group": MUSCLE_GROUPS.get(ex.get("muscleGroupId"), ""),
                            "set_position": s.get("position"),
                            "set_type": s.get("setType"),
                            "weight": s.get("weight"),
                            "unit": s.get("unit"),
                            "reps": s.get("reps"),
                            "weight_target": s.get("weightTarget"),
                            "weight_target_min": s.get("weightTargetMin"),
                            "weight_target_max": s.get("weightTargetMax"),
                            "reps_target": s.get("repsTarget"),
                            "status": s.get("status") or "",
                            "finished_at": s.get("finishedAt") or "",
                        })
    write_csv(NORM / "mesocycles.csv", meso_rows)
    write_csv(NORM / "days.csv", day_rows)
    write_csv(NORM / "sets.csv", set_rows)

    template_rows, slot_rows = [], []
    for template in template_details:
        slots = [s for day in template.get("days") or [] for s in day.get("slots") or []]
        template_rows.append({
            "id": template.get("id"),
            "key": template.get("key"),
            "name": template.get("name"),
            "emphasis": template.get("emphasis") or "",
            "sex": template.get("sex") or "",
            "frequency": template.get("frequency"),
            "days": len(template.get("days") or []),
            "slot_count": len(slots),
            "slots": "; ".join(
                f"{MUSCLE_GROUPS.get(s.get('muscleGroupId'), s.get('muscleGroupId'))}"
                + (f"={by_exercise.get(s['exerciseId'], {}).get('name', s['exerciseId'])}" if s.get("exerciseId") else "")
                for s in sorted(slots, key=lambda s: (s.get("templateDayId") or 0, s.get("position") or 0))
            ),
            "priorities": "; ".join(
                f"{MUSCLE_GROUPS.get(int(k), k)}:{v.get('mgPriorityType')}"
                for k, v in sorted((template.get("priorities") or {}).items(), key=lambda kv: int(kv[0]))
            ),
            "user_id": template.get("userId") or "",
            "created_at": template.get("createdAt") or "",
            "deleted_at": template.get("deletedAt") or "",
        })
        for day in template.get("days") or []:
            for slot in day.get("slots") or []:
                ex_id = slot.get("exerciseId")
                slot_rows.append({
                    "template_key": template.get("key"),
                    "template_name": template.get("name"),
                    "day_position": day.get("position"),
                    "slot_position": slot.get("position"),
                    "muscle_group": MUSCLE_GROUPS.get(slot.get("muscleGroupId"), slot.get("muscleGroupId")),
                    "exercise_id": ex_id or "",
                    "exercise_name": (by_exercise.get(ex_id) or {}).get("name", "") if ex_id else "",
                })
    write_csv(NORM / "templates.csv", template_rows)
    write_csv(NORM / "template_slots.csv", slot_rows)
    print(f"normalized: {len(exercise_rows)} exercises, {len(meso_rows)} mesocycles, "
          f"{len(day_rows)} days, {len(set_rows)} sets, "
          f"{len(template_rows)} templates, {len(slot_rows)} template slots")

    dump(NORM / "mesocycles.json", mesos)
    dump(NORM / "exercises.json", exercises)


def write_csv(path, rows):
    if not rows:
        path.write_text("")
        return
    with path.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
