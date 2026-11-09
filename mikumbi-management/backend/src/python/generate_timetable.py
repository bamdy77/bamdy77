#!/usr/bin/env python3
"""
Mikumbi Secondary School — Timetable Generator (constraint solver)

Why Python here and not plain Node.js:
  Node.js CAN do this, but a greedy/backtracking constraint solver with
  randomized restarts (needed for the "generate 5 different variants a day"
  requirement) is simpler to reason about and safer to get *exactly* right
  in Python. This script is invoked as a child process from
  timetableController.js — it reads one JSON payload on stdin and writes
  one JSON result to stdout. No network access, no extra pip packages
  required (standard library only), so it runs anywhere python3 runs.

Hard constraints enforced:
  1. A teacher can never be double-booked in two classes at the same
     day+period (busy[teacher][day][period]).
  2. A teacher teaching a SPECIFIC subject to a SPECIFIC class never gets
     more than 2 periods of that subject, in that class, on the same day
     (i.e. never a triple — at most one double period per day). Combined
     with the pairing rule below, this also means the same teacher never
     re-enters the same class on the same day to teach that same subject
     a second time — the day's allotment for that subject is a single
     contiguous double (or single) period, never scattered.
  3. A class can never have two different lessons in the same day+period.
  4. Scheduled special events (Debate, Subject Club, Religion, Sports and
     Games, Free Period, etc.) reserve their day+period+class slots BEFORE
     normal subject placement begins, so no subject is ever placed on top
     of an event for the classes it applies to.
  5. Only the periods explicitly marked "active" are used (core P1-P7 plus
     any optional afternoon periods the Admin/Academic switched on).
  6. Only the classes selected for this run are scheduled — everything
     else is left untouched by the caller (Node deletes/keeps rows itself).

The `seed` value makes each of the (up to 5 per day) generations produce a
different — but still constraint-valid — arrangement, by reshuffling the
random order in which slots are tried.
"""

import json
import sys
import random


def main():
    payload = json.load(sys.stdin)

    days = payload["days"]                      # ["Monday", ... "Friday"]
    periods = payload["periods"]                 # [{"label":"P1","is_break":false}, ...] active only, in time order
    classes = payload["classes"]                 # ["Form I A", "Form I B", ...] selected classes only
    assignments = payload["assignments"]         # [{"teacher_name","subject","cls","periods_per_week"}]
    events = payload.get("events", [])           # [{"day","period_label","classes":[...],"event_name"}]
    seed = int(payload.get("seed", 0))

    rnd = random.Random(seed)

    lesson_periods = [p["label"] for p in periods if not p["is_break"]]

    # Truly-adjacent lesson period pairs — i.e. back-to-back in the REAL daily
    # timeline, with nothing (no break) sitting between them. Built from the
    # full `periods` list (which still contains the breaks) so that e.g. P4
    # followed by BREAK followed by P6 does NOT count as an adjacent pair —
    # only P4/P5 (or whatever the actual next lesson period is) does. This is
    # what a "double period" must physically be: two consecutive periods on
    # the timetable, never split across a break.
    all_labels = [p["label"] for p in periods]
    adjacent_pairs = set()
    for i in range(len(periods) - 1):
        if not periods[i]["is_break"] and not periods[i + 1]["is_break"]:
            adjacent_pairs.add((all_labels[i], all_labels[i + 1]))

    # ── grids ────────────────────────────────────────────────────────────
    # occupied[cls][day][period] = {"subject":..,"teacher_name":..} | {"is_event":True,"event_name":..}
    occupied = {c: {d: {} for d in days} for c in classes}
    # busy[teacher][day][period] = True
    busy = {}
    # teacher_class_day_count[teacher][cls][day] = int  (cap at 4)
    tcd_count = {}

    MAX_PER_TEACHER_CLASS_DAY = 2

    def ensure_teacher(t):
        if t not in busy:
            busy[t] = {d: {} for d in days}
            tcd_count[t] = {}

    # ── 1) reserve special events first (highest priority) ────────────────
    placed_events = []
    for ev in events:
        d = ev["day"]
        p = ev["period_label"]
        for cls in ev["classes"]:
            if cls not in occupied or d not in occupied[cls]:
                continue
            if p in occupied[cls][d]:
                continue  # slot already taken by another event — skip silently
            occupied[cls][d][p] = {"is_event": True, "event_name": ev["event_name"]}
            placed_events.append({"cls": cls, "day": d, "period": p, "event_name": ev["event_name"]})

    # ── 2) place normal subject/teacher assignments ────────────────────────
    # Bigger weekly-period-count subjects are placed first (harder to fit later).
    sorted_assignments = sorted(assignments, key=lambda a: -int(a.get("periods_per_week", 4)))

    unplaced = []  # anything that could not be fully scheduled (report back, don't silently lose data)

    for a in sorted_assignments:
        teacher = a["teacher_name"]
        subject = a["subject"]
        cls = a["cls"]
        need = int(a.get("periods_per_week", 4))
        if cls not in occupied:
            continue  # class wasn't selected for this generation run

        ensure_teacher(teacher)
        if cls not in tcd_count[teacher]:
            tcd_count[teacher][cls] = {d: 0 for d in days}

        placed = 0
        day_order = list(days)
        rnd.shuffle(day_order)

        subject_upper = subject.strip().upper()

        # ── Position restriction (which periods this subject may use) ──────
        # Mathematics: strictly before P7 (P1..P6), never P7 itself or after.
        # Physics, Biology, Chemistry: anywhere from P1 up to and including P7
        # (never in the optional afternoon periods P8+).
        if "P7" in lesson_periods:
            p7_idx = lesson_periods.index("P7")
            at_or_before_p7 = lesson_periods[:p7_idx + 1]
            strictly_before_p7 = lesson_periods[:p7_idx]
        else:
            at_or_before_p7 = lesson_periods
            strictly_before_p7 = lesson_periods

        if subject_upper == "MATHEMATICS":
            candidate_periods = strictly_before_p7
        elif subject_upper in ("PHYSICS", "BIOLOGY", "CHEMISTRY"):
            candidate_periods = at_or_before_p7
        else:
            candidate_periods = lesson_periods

        def is_free(day, period):
            return period not in occupied[cls][day] and not busy[teacher][day].get(period)

        def can_use_day(day):
            return tcd_count[teacher][cls][day] < MAX_PER_TEACHER_CLASS_DAY

        def place_one(day, period):
            nonlocal placed
            occupied[cls][day][period] = {"subject": subject, "teacher_name": teacher}
            busy[teacher][day][period] = True
            tcd_count[teacher][cls][day] += 1
            placed += 1

        # ── NEVER a lone single period in a day ─────────────────────────────
        # Applies to EVERY subject now (school policy), based purely on the
        # weekly period count:
        #   - EVEN count (e.g. 4, 6) → 100% double periods, zero singles.
        #   - ODD count (e.g. 3, 5)  → double periods + exactly ONE single.
        #     With the 2-per-day cap above, that single can never share a day
        #     with one of the doubles (2+1 would exceed the cap), so it is
        #     always placed on its own separate day instead.
        use_paired = True

        if use_paired:
            pairs_needed = need // 2
            remainder = need % 2
            days_used_for_pairs = []

            # Only pairs that are both genuinely back-to-back (no break between
            # them) AND both within this subject's allowed periods qualify as
            # a valid "double period" placement.
            candidate_set = set(candidate_periods)
            valid_pairs = [pr for pr in adjacent_pairs if pr[0] in candidate_set and pr[1] in candidate_set]

            for day in day_order:
                if pairs_needed <= 0:
                    break
                if not can_use_day(day):
                    continue
                pair_order = list(valid_pairs)
                rnd.shuffle(pair_order)
                for p1, p2 in pair_order:
                    if is_free(day, p1) and is_free(day, p2) and tcd_count[teacher][cls][day] + 2 <= MAX_PER_TEACHER_CLASS_DAY:
                        place_one(day, p1); place_one(day, p2)
                        pairs_needed -= 1
                        days_used_for_pairs.append(day)
                        break

            if remainder == 1:
                placed_single = False
                for day in days_used_for_pairs:
                    if not can_use_day(day):
                        continue
                    for period in candidate_periods:
                        if is_free(day, period):
                            place_one(day, period)
                            placed_single = True
                            break
                    if placed_single:
                        break
                # Fallback: a subject with NO pair-day yet (e.g. weekly count
                # is exactly 1, so pairs_needed was 0 from the start) used to
                # be silently dropped here — there was no "already-used pair
                # day" to attach to. Now it falls back to any day with room,
                # so a 1-period/week subject still gets scheduled instead of
                # vanishing from the timetable.
                if not placed_single:
                    for day in day_order:
                        if not can_use_day(day):
                            continue
                        attached = False
                        for period in candidate_periods:
                            if is_free(day, period):
                                place_one(day, period)
                                attached = True
                                break
                        if attached:
                            break

        # ── Every other subject: at most 1 period/day, spread across fresh ──
        # days first. Only repeats on an already-used day as a last resort,
        # if there genuinely aren't enough days left to keep it to one/day.
        else:
            days_with_this_subject = set()
            exhausted = False
            while placed < need and not exhausted:
                exhausted = True
                for day in day_order:
                    if placed >= need:
                        break
                    if day in days_with_this_subject or not can_use_day(day):
                        continue
                    period_order = list(candidate_periods)
                    rnd.shuffle(period_order)
                    for period in period_order:
                        if is_free(day, period):
                            place_one(day, period)
                            days_with_this_subject.add(day)
                            exhausted = False
                            break

            exhausted = False
            while placed < need and not exhausted:
                exhausted = True
                for day in day_order:
                    if placed >= need:
                        break
                    if not can_use_day(day):
                        continue
                    period_order = list(candidate_periods)
                    rnd.shuffle(period_order)
                    for period in period_order:
                        if is_free(day, period):
                            place_one(day, period)
                            exhausted = False
                            break

        if placed < need:
            unplaced.append({
                "teacher_name": teacher, "subject": subject, "cls": cls,
                "needed": need, "placed": placed,
            })

    # ── build flat output ───────────────────────────────────────────────────
    cells = []
    for cls in classes:
        for day in days:
            for period, info in occupied[cls][day].items():
                if info.get("is_event"):
                    cells.append({
                        "cls": cls, "day": day, "period": period,
                        "subject": None, "teacher_name": None,
                        "is_event": True, "event_name": info["event_name"],
                    })
                else:
                    cells.append({
                        "cls": cls, "day": day, "period": period,
                        "subject": info["subject"], "teacher_name": info["teacher_name"],
                        "is_event": False, "event_name": None,
                    })

    json.dump({
        "success": True,
        "cells": cells,
        "events_placed": placed_events,
        "unplaced": unplaced,
        "seed": seed,
    }, sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # surface any error as JSON so Node can show a clean message
        json.dump({"success": False, "error": str(e)}, sys.stdout)
        sys.exit(1)
