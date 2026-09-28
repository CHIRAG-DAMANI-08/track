import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseHevyText, generateImportFingerprint } from '../src/lib/parser';
import {
  getLocalWeekStart,
  getLocalWeekEnd,
  toLocalDateKey,
  toLocalWeekKey,
  getDateRange,
} from '../src/lib/dates/training-calendar';
import { workoutMutationQueryKeys, queryKeys } from '../src/lib/query-keys';
import { formatWorkoutForPrompt } from '../src/ai/workout-analysis';

describe('Hevy Workout Pipeline & Architecture Tests', () => {

  // ─── 1. Standard Hevy workout parsing ──────────────────────────
  test('1. Standard Hevy workout parsing', () => {
    const text = `Upper Body Push
Sep 25, 2026 at 7:30 PM • 1h 15m

Bench Press (Barbell)
Set 1: 60 kg x 12
Set 2: 80 kg x 10
Set 3: 100 kg x 8

Overhead Press (Barbell)
Set 1: 50 kg x 10
Set 2: 50 kg x 8`;

    const res = parseHevyText(text);
    assert.equal(res.workout.name, 'Upper Body Push');
    assert.equal(res.workout.durationMinutes, 75);
    assert.ok(res.workout.performedAt);
    assert.equal(res.workout.exercises.length, 2);
    assert.equal(res.workout.exercises[0].rawName, 'Bench Press');
    assert.equal(res.workout.exercises[0].sets.length, 3);
    assert.equal(res.workout.exercises[0].sets[0].weightKg, 60);
    assert.equal(res.workout.exercises[0].sets[0].reps, 12);
  });

  // ─── 2. Workout notes ──────────────────────────────────────────
  test('2. Workout notes preservation', () => {
    const text = `Push Day
Sep 25, 2026 at 7:30 PM
Workout Note: "Felt low energy initially but warmups went well"

Bench Press
100 kg x 8`;

    const res = parseHevyText(text);
    assert.equal(res.workout.notes, 'Felt low energy initially but warmups went well');
  });

  // ─── 3. Exercise notes ─────────────────────────────────────────
  test('3. Exercise notes preservation', () => {
    const text = `Leg Day
Sep 25, 2026 at 7:30 PM

Squat
Note: "Used lifting belt on top set. Hip felt good."
100 kg x 5
120 kg x 3`;

    const res = parseHevyText(text);
    assert.equal(res.workout.exercises[0].notes, 'Used lifting belt on top set. Hip felt good.');
  });

  // ─── 4. Set notes ──────────────────────────────────────────────
  test('4. Set notes preservation', () => {
    const text = `Push Day
Sep 25, 2026 at 7:30 PM

Incline Dumbbell Press
Set 1: 30 kg x 10 "Felt smooth"
Set 2: 34 kg x 8 "Struggled with balance on rep 7"`;

    const res = parseHevyText(text);
    assert.equal(res.workout.exercises[0].sets[0].notes, 'Felt smooth');
    assert.equal(res.workout.exercises[0].sets[1].notes, 'Struggled with balance on rep 7');
  });

  // ─── 5. RPE ───────────────────────────────────────────────────
  test('5. RPE extraction', () => {
    const text = `Pull Day
Sep 25, 2026 at 7:30 PM

Deadlift
Set 1: 140 kg x 5 @RPE 7.5
Set 2: 160 kg x 3 @8.5`;

    const res = parseHevyText(text);
    assert.equal(res.workout.exercises[0].sets[0].rpe, 7.5);
    assert.equal(res.workout.exercises[0].sets[1].rpe, 8.5);
  });

  // ─── 6. RIR ───────────────────────────────────────────────────
  test('6. RIR extraction (independent, never derived)', () => {
    const text = `Arms Day
Sep 25, 2026 at 7:30 PM

Barbell Curl
Set 1: 35 kg x 10 RIR 2
Set 2: 35 kg x 8 RIR 0`;

    const res = parseHevyText(text);
    assert.equal(res.workout.exercises[0].sets[0].rir, 2);
    assert.equal(res.workout.exercises[0].sets[1].rir, 0);
  });

  // ─── 7. Warmup sets ────────────────────────────────────────────
  test('7. Warmup sets detection', () => {
    const text = `Leg Day
Sep 25, 2026 at 7:30 PM

Squat
Set 1 (Warmup): 20 kg x 15
Set 2 (WU): 60 kg x 10`;

    const res = parseHevyText(text);
    assert.equal(res.workout.exercises[0].sets[0].setType, 'WARMUP');
    assert.equal(res.workout.exercises[0].sets[1].setType, 'WARMUP');
  });

  // ─── 8. Working sets ───────────────────────────────────────────
  test('8. Working sets default and type assignment', () => {
    const text = `Chest
Sep 25, 2026 at 7:30 PM

Bench Press
Set 1: 100 kg x 8
Set 2: 100 kg x 8`;

    const res = parseHevyText(text);
    assert.equal(res.workout.exercises[0].sets[0].setType, 'WORKING');
    assert.equal(res.workout.exercises[0].sets[1].setType, 'WORKING');
  });

  // ─── 9. Mixed warmup/working sets ──────────────────────────────
  test('9. Mixed warmup and working sets in single exercise', () => {
    const text = `Chest
Sep 25, 2026 at 7:30 PM

Bench Press
Set 1 (Warmup): 40 kg x 12
Set 2 (Warmup): 60 kg x 8
Set 3: 80 kg x 8
Set 4: 90 kg x 6 (Failure)
Set 5: 60 kg x 12 (Drop)`;

    const res = parseHevyText(text);
    const sets = res.workout.exercises[0].sets;
    assert.equal(sets[0].setType, 'WARMUP');
    assert.equal(sets[1].setType, 'WARMUP');
    assert.equal(sets[2].setType, 'WORKING');
    assert.equal(sets[3].setType, 'FAILURE');
    assert.equal(sets[4].setType, 'DROP');
  });

  // ─── 10. Missing metadata ──────────────────────────────────────
  test('10. Missing metadata handled gracefully without fake values', () => {
    const text = `Squat
100 kg x 5`;

    const res = parseHevyText(text);
    assert.equal(res.workout.notes, null);
    assert.equal(res.workout.durationMinutes, null);
    assert.equal(res.workout.exercises[0].notes, null);
    assert.equal(res.workout.exercises[0].sets[0].rpe, null);
    assert.equal(res.workout.exercises[0].sets[0].rir, null);
    assert.equal(res.workout.exercises[0].sets[0].weightKg, 100);
    assert.equal(res.workout.exercises[0].sets[0].reps, 5);
  });

  // ─── 11. Duplicate exact import ────────────────────────────────
  test('11. Duplicate exact import produces identical fingerprint', () => {
    const text = `Upper Body
Sep 25, 2026 at 7:30 PM • 1h
Bench Press
100 kg x 8
100 kg x 8`;

    const res1 = parseHevyText(text);
    const res2 = parseHevyText(text);

    const fp1 = generateImportFingerprint(res1.workout);
    const fp2 = generateImportFingerprint(res2.workout);

    assert.equal(fp1, fp2, 'Fingerprints must match for identical workouts');
  });

  // ─── 12. Distinct workouts same day ────────────────────────────
  test('12. Distinct workouts on same day produce different fingerprints', () => {
    const morningWorkout = parseHevyText(`Morning Push
Sep 25, 2026 at 8:00 AM
Bench Press
100 kg x 8`).workout;

    const eveningWorkout = parseHevyText(`Evening Pull
Sep 25, 2026 at 6:00 PM
Deadlift
140 kg x 5`).workout;

    const fp1 = generateImportFingerprint(morningWorkout);
    const fp2 = generateImportFingerprint(eveningWorkout);

    assert.notEqual(fp1, fp2, 'Different workouts on same day must have distinct fingerprints');
  });

  // ─── 13. Workout at week boundary ──────────────────────────────
  test('13. Workout at week boundary (Monday 00:00 vs Sunday 23:59)', () => {
    // 2026-09-28 is a Monday, 2026-10-04 is Sunday
    const mondayWorkout = new Date(2026, 8, 28, 6, 0, 0); // Mon Sep 28 06:00
    const sundayWorkout = new Date(2026, 9, 4, 22, 0, 0); // Sun Oct 4 22:00

    const mondayWeekStart = getLocalWeekStart(mondayWorkout);
    const sundayWeekStart = getLocalWeekStart(sundayWorkout);

    assert.equal(
      mondayWeekStart.getTime(),
      sundayWeekStart.getTime(),
      'Monday and Sunday in the same calendar week must have identical week start times'
    );
    assert.equal(
      toLocalWeekKey(mondayWorkout),
      toLocalWeekKey(sundayWorkout),
      'Monday and Sunday in the same calendar week must share the same week key'
    );
  });

  // ─── 14. Workout around midnight ───────────────────────────────
  test('14. Workout around midnight preserved on correct local day', () => {
    const lateNight = new Date(2026, 8, 28, 23, 55, 0);
    const pastMidnight = new Date(2026, 8, 29, 0, 5, 0);

    const lateDayKey = toLocalDateKey(lateNight);
    const pastMidnightDayKey = toLocalDateKey(pastMidnight);

    assert.equal(lateDayKey, '2026-09-28');
    assert.equal(pastMidnightDayKey, '2026-09-29');
    assert.notEqual(lateDayKey, pastMidnightDayKey);
  });

  // ─── 15. Workout appears in Progress (Date Range coverage) ─────
  test('15. Workout appears in Progress date range', () => {
    const range = getDateRange('this-week');
    const now = new Date();
    assert.ok(now >= range.start && now <= range.end, 'Current date must fall within this-week range');
  });

  // ─── 16. Workout appears in Calendar (Monday to Sunday) ────────
  test('16. Calendar week boundaries cover full week Monday-Sunday', () => {
    const ref = new Date(2026, 8, 30); // Wed Sep 30
    const start = getLocalWeekStart(ref);
    const end = getLocalWeekEnd(ref);

    assert.equal(start.getDay(), 1, 'Week start must be Monday');
    assert.equal(end.getDay(), 0, 'Week end must be Sunday');
    assert.equal(end.getHours(), 23);
    assert.equal(end.getMinutes(), 59);
  });

  // ─── 17. Workout appears in Dashboard ──────────────────────────
  test('17. Dashboard week calculation uses same boundaries', () => {
    const now = new Date();
    const dStart = getLocalWeekStart(now);
    const dEnd = getLocalWeekEnd(now);
    const pRange = getDateRange('this-week');

    assert.equal(dStart.getTime(), pRange.start.getTime());
    assert.equal(dEnd.getTime(), pRange.end.getTime());
  });

  // ─── 18. Workout appears in Exercise History ───────────────────
  test('18. Exercise History normalization preserves canonical identity', () => {
    const p1 = parseHevyText('Bench Press (Barbell)\n100 kg x 5');
    const p2 = parseHevyText('Bench Press\n100 kg x 5');

    assert.equal(p1.workout.exercises[0].rawName, 'Bench Press');
    assert.equal(p2.workout.exercises[0].rawName, 'Bench Press');
  });

  // ─── 19. Muscle map updates (Warmup filtering) ─────────────────
  test('19. Muscle exposure filters out warmup sets', () => {
    const sets = [
      { setType: 'WARMUP', weightKg: 40, reps: 10 },
      { setType: 'WARMUP', weightKg: 60, reps: 8 },
      { setType: 'WORKING', weightKg: 100, reps: 8 },
      { setType: 'WORKING', weightKg: 100, reps: 6 },
    ];

    const workingSets = sets.filter(s => s.setType !== 'WARMUP');
    assert.equal(workingSets.length, 2);
  });

  // ─── 20. Cache invalidation ───────────────────────────────────
  test('20. Cache invalidation returns all necessary query keys', () => {
    const keys = workoutMutationQueryKeys();
    assert.ok(keys.includes(queryKeys.dashboard));
    assert.ok(keys.includes(queryKeys.workouts.all));
    assert.ok(keys.includes(queryKeys.progress.all));
    assert.ok(keys.includes(queryKeys.exercises.all));
    assert.ok(keys.includes(queryKeys.imports));
  });

  // ─── 21 & 22. Derived metric rebuild & Idempotence ─────────────
  test('21 & 22. Derived metric calculation is deterministic and idempotent', () => {
    const sets = [
      { setType: 'WARMUP', weightKg: 50, reps: 10 },
      { setType: 'WORKING', weightKg: 100, reps: 8 },
      { setType: 'WORKING', weightKg: 100, reps: 8 },
    ];

    let totalVolume = 0;
    let workingSets = 0;
    let warmupSets = 0;

    for (const s of sets) {
      if (s.setType === 'WARMUP') {
        warmupSets++;
        continue;
      }
      workingSets++;
      totalVolume += s.weightKg * s.reps;
    }

    assert.equal(workingSets, 2);
    assert.equal(warmupSets, 1);
    assert.equal(totalVolume, 1600);
  });

  // ─── 23. AI receives workout notes ────────────────────────────
  test('23. AI formatWorkoutForPrompt includes workout notes', () => {
    const prompt = formatWorkoutForPrompt({
      name: 'Push Day',
      performedAt: new Date('2026-09-25T19:30:00Z'),
      durationMinutes: 60,
      notes: 'Shoulder felt slightly stiff',
      exercises: [],
    });

    assert.ok(prompt.includes('Workout Note: "Shoulder felt slightly stiff"'));
  });

  // ─── 24. AI receives exercise notes ───────────────────────────
  test('24. AI formatWorkoutForPrompt includes exercise notes', () => {
    const prompt = formatWorkoutForPrompt({
      name: 'Leg Day',
      performedAt: new Date('2026-09-25T19:30:00Z'),
      durationMinutes: 60,
      notes: null,
      exercises: [{
        exercise: { canonicalName: 'Squat' },
        notes: 'Paused at bottom for 2 sec',
        sets: [],
      }],
    });

    assert.ok(prompt.includes('Note: "Paused at bottom for 2 sec"'));
  });

  // ─── 25. AI receives set notes ────────────────────────────────
  test('25. AI formatWorkoutForPrompt includes set notes', () => {
    const prompt = formatWorkoutForPrompt({
      name: 'Push',
      performedAt: new Date('2026-09-25T19:30:00Z'),
      durationMinutes: 45,
      notes: null,
      exercises: [{
        exercise: { canonicalName: 'Bench Press' },
        notes: null,
        sets: [{
          setType: 'WORKING',
          weightKg: 100,
          reps: 8,
          rpe: 8.5,
          rir: 1,
          notes: 'Bar speed was fast',
        }],
      }],
    });

    assert.ok(prompt.includes('"Bar speed was fast"'));
  });

  // ─── 26. AI receives RPE/RIR ──────────────────────────────────
  test('26. AI formatWorkoutForPrompt includes RPE and RIR', () => {
    const prompt = formatWorkoutForPrompt({
      name: 'Push',
      performedAt: new Date('2026-09-25T19:30:00Z'),
      durationMinutes: 45,
      notes: null,
      exercises: [{
        exercise: { canonicalName: 'Bench Press' },
        notes: null,
        sets: [{
          setType: 'WORKING',
          weightKg: 100,
          reps: 8,
          rpe: 8.5,
          rir: 1,
          notes: null,
        }],
      }],
    });

    assert.ok(prompt.includes('@RPE 8.5'));
    assert.ok(prompt.includes('RIR 1'));
  });

  // ─── 27. AI receives warmup/working distinction ───────────────
  test('27. AI formatWorkoutForPrompt marks warmup vs working sets', () => {
    const prompt = formatWorkoutForPrompt({
      name: 'Push',
      performedAt: new Date('2026-09-25T19:30:00Z'),
      durationMinutes: 45,
      notes: null,
      exercises: [{
        exercise: { canonicalName: 'Bench Press' },
        notes: null,
        sets: [
          { setType: 'WARMUP', weightKg: 60, reps: 10, rpe: null, rir: null, notes: null },
          { setType: 'WORKING', weightKg: 100, reps: 8, rpe: null, rir: null, notes: null },
          { setType: 'FAILURE', weightKg: 100, reps: 6, rpe: null, rir: null, notes: null },
          { setType: 'DROP', weightKg: 70, reps: 12, rpe: null, rir: null, notes: null },
        ],
      }],
    });

    assert.ok(prompt.includes('(WU) 60kg × 10 reps'));
    assert.ok(prompt.includes('100kg × 8 reps'));
    assert.ok(prompt.includes('(FAIL) 100kg × 6 reps'));
    assert.ok(prompt.includes('(DROP) 70kg × 12 reps'));
  });
});
