import type { ParsedWorkout, ParsedExercise, ParsedSet } from '@/lib/schemas';

/**
 * =====================================================================
 * DETERMINISTIC HEVY WORKOUT PARSER
 * =====================================================================
 *
 * Multi-stage parser that extracts rich metadata from Hevy workout text:
 *
 * Stage 1: Structural parsing — identify header, exercises, sets, notes
 * Stage 2: Field extraction — weight, reps, RPE, RIR, set type, notes
 * Stage 3: Validation — ensure extracted data is consistent
 * Stage 4: Exercise normalization — clean exercise names
 *
 * Supported Hevy formats:
 *
 * Format A (standard share):
 *   Workout Name
 *   Sep 25, 2026 at 7:30 PM • 1h 15m
 *   Workout Note: "Low energy today"
 *
 *   Bench Press (Barbell)
 *   Note: "Shoulder warm"
 *   Set 1 (Warmup): 60 kg x 12
 *   Set 2: 100 kg x 8 @RPE 8
 *   Set 3: 100 kg x 6 @RPE 9 "Last rep slow"
 *
 * Format B (simple share):
 *   Exercise Name
 *   100 kg x 8
 *   100 kg x 6
 *
 * Format C (tabular):
 *   # Exercise Name
 *   Set | kg | Reps
 *   1 | 100 | 8
 *   2 | 100 | 8
 *
 * Values are NEVER invented. If a field cannot be parsed, it remains null.
 */

// ─── Patterns ──────────────────────────────────────────────────

const WEIGHT_PATTERN = /(\d+(?:\.\d+)?)\s*(kg|lbs?|lb)/i;
const REPS_PATTERN = /[x×]\s*(\d+)/i;
const SET_LINE_PATTERN = /^(?:set\s*)?(\d+)[\s:.|]+(.+)/i;
const RPE_PATTERN = /(?:@\s*|RPE\s*)(\d+(?:\.\d+)?)/i;
const RIR_PATTERN = /(?:RIR\s*)(\d+(?:\.\d+)?)/i;
const PR_PATTERN = /(?:🏆|PR|PB|personal\s*(?:record|best))/i;
const WARMUP_PATTERN = /(?:warm\s*-?\s*up|wu|\(warmup\)|\(wu\)|\bwarmup\b)/i;
const DROP_PATTERN = /(?:drop\s*set|ds|\(drop\))/i;
const FAILURE_PATTERN = /(?:failure|\(f\)|to\s*failure)/i;
const NOTE_PREFIX_PATTERN = /^(?:note|notes)\s*[:：]\s*/i;
const EXERCISE_NOTE_PATTERN = /^(?:note|notes)\s*[:：]\s*(.+)/i;
const INLINE_NOTE_PATTERN = /["""]([^"""]+)["""]|"([^"]+)"/;
const REST_PATTERN = /(?:rest|rest\s*time)\s*[:：]?\s*(\d+)\s*(?:s|sec|seconds?|m|min|minutes?)/i;
const DURATION_COMBO_PATTERN = /(?:(\d+)\s*(?:h|hrs?|hours?))\s*(?:(\d+)\s*(?:m|mins?|minutes?))?/i;
const DURATION_MINS_PATTERN = /(\d+)\s*(?:m|mins?|minutes?)\b/i;

const DATE_PATTERNS = [
  // Sep 25, 2026 or September 25, 2026
  /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})\b/,
  // 25 Sep 2026 or 25 September 2026
  /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/,
  // 2026-09-25
  /\b(\d{4})-(\d{2})-(\d{2})\b/,
  // 09/25/2026
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
];

const TIME_PATTERN = /at\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i;

export interface ParseResult {
  workout: ParsedWorkout;
  warnings: string[];
  unresolvedLines: string[];
}

// ─── Main Parser ──────────────────────────────────────────────

export function parseHevyText(rawText: string): ParseResult {
  const warnings: string[] = [];
  const unresolvedLines: string[] = [];
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length === 0) {
    return {
      workout: { name: null, performedAt: null, durationMinutes: null, notes: null, exercises: [] },
      warnings: ['Empty input text'],
      unresolvedLines: [],
    };
  }

  let workoutName: string | null = null;
  let performedAt: string | null = null;
  let durationMinutes: number | null = null;
  let workoutNotes: string | null = null;
  const exercises: ParsedExercise[] = [];

  let currentExercise: ParsedExercise | null = null;
  let setCounter = 0;
  let headerConsumed = false;
  let pendingExerciseNote: string | null = null;

  // Header pre-check: if line 0 is not a date but line 1 is a date, line 0 is the workout name
  let startIndex = 0;
  if (lines.length > 1 && !tryParseDate(lines[0]) && tryParseDate(lines[1])) {
    workoutName = lines[0];
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    // Skip separator lines
    if (/^[-─═=•]+$/.test(line)) continue;

    // ─── Check for workout-level note ──────────────────────
    const explicitWorkoutNoteMatch = line.match(/^workout\s*(?:note|notes)\s*[:：]\s*(.+)/i);
    if (explicitWorkoutNoteMatch) {
      workoutNotes = cleanNote(explicitWorkoutNoteMatch[1]);
      continue;
    }

    if ((!headerConsumed || exercises.length === 0) && !currentExercise) {
      const genericNoteMatch = line.match(/^(?:note|notes)\s*[:：]\s*(.+)/i);
      if (genericNoteMatch) {
        workoutNotes = cleanNote(genericNoteMatch[1]);
        continue;
      }
    }

    // ─── Try to parse date from line ───────────────────────
    if (!headerConsumed && !performedAt) {
      const dateResult = tryParseDate(line);
      if (dateResult) {
        performedAt = dateResult;

        // Check if this line also has duration
        const parsedDur = tryParseDuration(line);
        if (parsedDur !== null) {
          durationMinutes = parsedDur;
        }

        // If this is line 1 and no workout name yet, line 0 was workout name
        if (i === 1 && !workoutName) {
          workoutName = lines[0];
        }

        headerConsumed = true;
        continue;
      }
    }

    // ─── Check for exercise-level note (before sets) ───────
    if (currentExercise && currentExercise.sets.length === 0) {
      const exerciseNoteMatch = line.match(EXERCISE_NOTE_PATTERN);
      if (exerciseNoteMatch) {
        currentExercise.notes = cleanNote(exerciseNoteMatch[1]);
        continue;
      }
    }

    // ─── Check for standalone note line (after exercise header) ─────
    if (currentExercise && NOTE_PREFIX_PATTERN.test(line)) {
      const noteContent = line.replace(NOTE_PREFIX_PATTERN, '').trim();
      if (noteContent) {
        if (currentExercise.sets.length === 0) {
          // Note before any sets = exercise note
          currentExercise.notes = cleanNote(noteContent);
        } else {
          // Note after sets = set note for the last set
          const lastSet = currentExercise.sets[currentExercise.sets.length - 1];
          lastSet.notes = cleanNote(noteContent);
        }
        continue;
      }
    }

    // ─── Try to parse as a set line (weight x reps or tabular) ─────
    const setResult = tryParseSetLine(line, setCounter);
    if (setResult) {
      // Check RPE
      const rpeMatch = line.match(RPE_PATTERN);
      if (rpeMatch) setResult.rpe = parseFloat(rpeMatch[1]);

      // Check RIR (separate from RPE — never derived)
      const rirMatch = line.match(RIR_PATTERN);
      if (rirMatch) setResult.rir = parseFloat(rirMatch[1]);

      // Check PR
      if (PR_PATTERN.test(line)) setResult.isPersonalRecord = true;

      // Check set type
      if (WARMUP_PATTERN.test(line)) setResult.setType = 'WARMUP';
      else if (DROP_PATTERN.test(line)) setResult.setType = 'DROP';
      else if (FAILURE_PATTERN.test(line)) setResult.setType = 'FAILURE';

      // Check inline note (quoted text)
      const inlineNoteMatch = line.match(INLINE_NOTE_PATTERN);
      if (inlineNoteMatch) {
        setResult.notes = cleanNote(inlineNoteMatch[1] || inlineNoteMatch[2]);
      }

      // Apply any pending exercise note as the first exercise note
      if (pendingExerciseNote && currentExercise && !currentExercise.notes) {
        currentExercise.notes = pendingExerciseNote;
        pendingExerciseNote = null;
      }

      if (currentExercise) {
        currentExercise.sets.push(setResult);
        setCounter++;
      } else {
        // Set data without an exercise header — create unnamed exercise
        currentExercise = {
          rawName: 'Unknown Exercise',
          canonicalName: null,
          notes: null,
          sets: [setResult],
        };
        setCounter++;
        warnings.push(`Line ${i + 1}: Set data found before any exercise name`);
      }
      continue;
    }

    // ─── Try tabular format: "1 | 100 | 8" ─────────────────
    const tabularSet = tryParseTabularSet(line);
    if (tabularSet) {
      if (currentExercise) {
        currentExercise.sets.push(tabularSet);
        setCounter++;
      }
      continue;
    }

    // ─── Skip table headers ────────────────────────────────
    if (/^(?:set|#)\s*[\|│]/i.test(line)) continue;

    // ─── If line looks like an exercise name ───────────────
    if (isExerciseName(line)) {
      // Save previous exercise
      if (currentExercise && currentExercise.sets.length > 0) {
        exercises.push(currentExercise);
      } else if (currentExercise && currentExercise.sets.length === 0) {
        // Previous "exercise" had no sets — might be a workout name
        if (!workoutName && i <= 3) {
          workoutName = currentExercise.rawName;
        } else {
          warnings.push(`Exercise "${currentExercise.rawName}" had no sets`);
        }
      }

      // Clean exercise name
      const cleanName = cleanExerciseName(line);
      currentExercise = {
        rawName: cleanName,
        canonicalName: null,
        notes: null,
        sets: [],
      };
      setCounter = 0;
      pendingExerciseNote = null;
      continue;
    }

    // ─── If nothing matches, track it ──────────────────────
    if (headerConsumed || i > 2) {
      // Could be a note that doesn't match patterns
      const stripped = line.replace(/^[""\u201c\u201d"]+|[""\u201c\u201d"]+$/g, '').trim();
      if (stripped && currentExercise && currentExercise.sets.length > 0) {
        // Attach as note to last set if it looks like a short note
        if (stripped.length < 200 && !stripped.match(/\d+\s*(kg|lbs?)\s*[x×]\s*\d+/)) {
          const lastSet = currentExercise.sets[currentExercise.sets.length - 1];
          if (!lastSet.notes) {
            lastSet.notes = stripped;
            continue;
          }
        }
      }
      unresolvedLines.push(`Line ${i + 1}: ${line}`);
    } else if (!workoutName && i === 0) {
      // First line is likely the workout name
      workoutName = line;
      headerConsumed = true;
    }
  }

  // Don't forget the last exercise
  if (currentExercise && currentExercise.sets.length > 0) {
    exercises.push(currentExercise);
  }

  // If no exercises were found, flag it
  if (exercises.length === 0) {
    warnings.push('No exercises could be parsed from the input');
  }

  return {
    workout: {
      name: workoutName,
      performedAt,
      durationMinutes,
      notes: workoutNotes,
      exercises,
    },
    warnings,
    unresolvedLines,
  };
}

// ─── Date Parsing ──────────────────────────────────────────────

function tryParseDate(line: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      try {
        const d = new Date(match[0]);
        if (!isNaN(d.getTime())) {
          // Check if there's a time component
          const timeMatch = line.match(TIME_PATTERN);
          if (timeMatch) {
            const timeStr = timeMatch[1].trim();
            const parsedTime = parseTimeString(timeStr);
            if (parsedTime) {
              d.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
            }
          }
          return d.toISOString();
        }
      } catch {
        // Ignore parse failures
      }
    }
  }
  return null;
}

function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
  // "7:30 PM", "19:30", "7 PM"
  const match = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridian = match[3]?.toUpperCase();

  if (meridian === 'PM' && hours < 12) hours += 12;
  if (meridian === 'AM' && hours === 12) hours = 0;

  return { hours, minutes };
}

// ─── Duration Parsing ─────────────────────────────────────────

function tryParseDuration(text: string): number | null {
  const comboMatch = text.match(DURATION_COMBO_PATTERN);
  if (comboMatch) {
    const hours = parseInt(comboMatch[1], 10) || 0;
    const mins = comboMatch[2] ? parseInt(comboMatch[2], 10) : 0;
    return hours * 60 + mins;
  }

  const minsMatch = text.match(DURATION_MINS_PATTERN);
  if (minsMatch) {
    return parseInt(minsMatch[1], 10);
  }

  return null;
}

// ─── Set Line Parsing ─────────────────────────────────────────

function tryParseSetLine(line: string, setIndex: number): ParsedSet | null {
  const weightMatch = line.match(WEIGHT_PATTERN);
  const repsMatch = line.match(REPS_PATTERN);

  if (!weightMatch && !repsMatch) return null;

  let weightKg: number | null = null;
  let weightUnit: string = 'kg';
  if (weightMatch) {
    const val = parseFloat(weightMatch[1]);
    const rawUnit = weightMatch[2].toLowerCase();
    if (rawUnit.startsWith('lb')) {
      weightUnit = 'lbs';
      weightKg = Math.round((val / 2.20462) * 100) / 100;
    } else {
      weightUnit = 'kg';
      weightKg = val;
    }
  }

  let reps: number | null = null;
  if (repsMatch) {
    reps = parseInt(repsMatch[1], 10);
  }

  // Check if there's a set number prefix
  const setNumMatch = line.match(SET_LINE_PATTERN);
  const actualIndex = setNumMatch ? parseInt(setNumMatch[1], 10) - 1 : setIndex;

  return {
    setIndex: actualIndex,
    setType: 'WORKING',
    weightKg,
    weightUnit,
    reps,
    durationSeconds: null,
    distanceMeters: null,
    rpe: null,
    rir: null,
    isPersonalRecord: false,
    notes: null,
  };
}

// ─── Tabular Set Parsing ──────────────────────────────────────

function tryParseTabularSet(line: string): ParsedSet | null {
  // Format: "1 | 100 | 8" or "1 │ 100 │ 8"
  const parts = line.split(/[|│]/).map(p => p.trim());
  if (parts.length < 3) return null;

  const setNum = parseInt(parts[0], 10);
  if (isNaN(setNum)) return null;

  const weight = parseFloat(parts[1]);
  const reps = parseInt(parts[2], 10);

  if (isNaN(weight) && isNaN(reps)) return null;

  return {
    setIndex: setNum - 1,
    setType: 'WORKING',
    weightKg: isNaN(weight) ? null : weight,
    weightUnit: 'kg',
    reps: isNaN(reps) ? null : reps,
    durationSeconds: null,
    distanceMeters: null,
    rpe: null,
    rir: null,
    isPersonalRecord: false,
    notes: null,
  };
}

// ─── Exercise Name Detection ──────────────────────────────────

function isExerciseName(line: string): boolean {
  // An exercise name should:
  // - Not start with a digit (unless it's like "21s" or similar exercise name)
  // - Not contain "x" between two numbers (that's a set)
  // - Not be purely numeric
  // - Have mostly alphabetic characters
  // - Not be a note prefix

  if (/^\d+\s*[\|│:.]/.test(line)) return false; // Set number prefix
  if (/\d+\s*(kg|lbs?)\s*[x×]\s*\d+/i.test(line)) return false; // Weight x reps
  if (/^\d+$/.test(line)) return false;
  if (NOTE_PREFIX_PATTERN.test(line)) return false;
  if (REST_PATTERN.test(line)) return false;

  const alphaCount = (line.match(/[a-zA-Z]/g) || []).length;
  return alphaCount > line.length * 0.3;
}

function cleanExerciseName(line: string): string {
  return line
    .replace(/^#+\s*/, '') // Remove markdown headers
    .replace(/\((?:Barbell|Dumbbell|Machine|Cable|Band|Smith Machine|Bodyweight)\)/gi, '')
    .replace(/^\d+\.\s*/, '') // Remove numbered prefix
    .trim();
}

// ─── Note Cleaning ────────────────────────────────────────────

function cleanNote(note: string): string {
  return note
    .replace(/^[""\u201c\u201d"]+|[""\u201c\u201d"]+$/g, '') // Remove surrounding quotes
    .trim();
}

// ─── Canonical Name Normalization ─────────────────────────────

/**
 * Attempt to canonicalize an exercise name by normalizing casing,
 * removing parentheticals, and basic cleanup.
 */
export function normalizeExerciseName(rawName: string): string {
  return rawName
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ─── Import Fingerprint ───────────────────────────────────────

/**
 * Generate a deterministic fingerprint for a parsed workout.
 * Used for duplicate detection during import.
 *
 * The fingerprint is based on:
 * - workout name (normalized)
 * - workout date (if available)
 * - exercise names (normalized, sorted)
 * - set structure (count and basic shape)
 *
 * Two genuinely different workouts on the same day WILL have different fingerprints
 * because their exercises/sets will differ.
 */
export function generateImportFingerprint(workout: ParsedWorkout): string {
  const parts: string[] = [];

  // Workout name (normalized)
  if (workout.name) {
    parts.push(`name:${workout.name.trim().toLowerCase()}`);
  }

  // Date (date-only, no time — so minor time differences don't split fingerprints)
  if (workout.performedAt) {
    try {
      const d = new Date(workout.performedAt);
      if (!isNaN(d.getTime())) {
        parts.push(`date:${d.toISOString().slice(0, 10)}`);
      }
    } catch {
      // Ignore invalid date
    }
  }

  // Exercise + set structure
  const exerciseParts = workout.exercises
    .map(ex => {
      const name = ex.rawName.trim().toLowerCase();
      const setsSignature = ex.sets
        .map(s => `${s.weightKg ?? '-'}x${s.reps ?? '-'}`)
        .join(',');
      return `${name}:[${setsSignature}]`;
    })
    .sort();
  parts.push(`ex:${exerciseParts.join('|')}`);

  // Simple hash
  const str = parts.join(';;');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

// ─── Muscle Guess ─────────────────────────────────────────────

/**
 * Extract basic muscle group guess from exercise name.
 * Conservative — returns null if unsure rather than fabricating.
 */
export function guessMusclePrimary(name: string): { primary: string | null; secondary: string[] } {
  const n = name.toLowerCase();

  const muscleMap: Array<{ pattern: RegExp; primary: string; secondary: string[] }> = [
    { pattern: /bench\s*press|chest\s*press/i, primary: 'Chest', secondary: ['Triceps', 'Shoulders'] },
    { pattern: /squat/i, primary: 'Quadriceps', secondary: ['Glutes', 'Hamstrings'] },
    { pattern: /deadlift/i, primary: 'Back', secondary: ['Hamstrings', 'Glutes'] },
    { pattern: /overhead\s*press|shoulder\s*press|military\s*press|ohp/i, primary: 'Shoulders', secondary: ['Triceps'] },
    { pattern: /pull[\s-]*up|chin[\s-]*up|lat\s*pull/i, primary: 'Back', secondary: ['Biceps'] },
    { pattern: /row|barbell\s*row|dumbbell\s*row/i, primary: 'Back', secondary: ['Biceps'] },
    { pattern: /curl/i, primary: 'Biceps', secondary: [] },
    { pattern: /tricep|pushdown|skull\s*crush|overhead\s*extension/i, primary: 'Triceps', secondary: [] },
    { pattern: /lateral\s*raise|side\s*raise|front\s*raise|rear\s*delt/i, primary: 'Shoulders', secondary: [] },
    { pattern: /leg\s*press/i, primary: 'Quadriceps', secondary: ['Glutes'] },
    { pattern: /leg\s*curl|hamstring/i, primary: 'Hamstrings', secondary: [] },
    { pattern: /leg\s*extension/i, primary: 'Quadriceps', secondary: [] },
    { pattern: /calf/i, primary: 'Calves', secondary: [] },
    { pattern: /lunge/i, primary: 'Quadriceps', secondary: ['Glutes', 'Hamstrings'] },
    { pattern: /fly|pec\s*deck|crossover/i, primary: 'Chest', secondary: [] },
    { pattern: /shrug/i, primary: 'Traps', secondary: [] },
    { pattern: /crunch|sit[\s-]*up|ab\s/i, primary: 'Abs', secondary: [] },
    { pattern: /plank/i, primary: 'Core', secondary: [] },
    { pattern: /hip\s*thrust|glute\s*bridge/i, primary: 'Glutes', secondary: ['Hamstrings'] },
    { pattern: /face\s*pull/i, primary: 'Rear Delts', secondary: ['Traps'] },
    { pattern: /dip/i, primary: 'Chest', secondary: ['Triceps', 'Shoulders'] },
  ];

  for (const entry of muscleMap) {
    if (entry.pattern.test(n)) {
      return { primary: entry.primary, secondary: entry.secondary };
    }
  }

  return { primary: null, secondary: [] };
}
