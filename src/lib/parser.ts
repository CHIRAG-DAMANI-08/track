import type { ParsedWorkout, ParsedExercise, ParsedSet } from '@/lib/schemas';

/**
 * Deterministic parser for Hevy workout text exports/copies.
 * Handles the common plain-text formats Hevy produces when you copy workout details.
 * 
 * Expected formats:
 * 
 * Format A (with header):
 * Workout Name
 * Date • Duration
 * 
 * Exercise Name (Equipment)
 * Set 1: 100 kg x 8
 * Set 2: 100 kg x 8
 * ...
 * 
 * Format B (Hevy share/copy):
 * Exercise Name
 * 100 kg x 8
 * 100 kg x 6
 * 
 * Format C (Hevy detailed copy):
 * # Exercise Name
 * Set | kg | Reps
 * 1 | 100 | 8
 * 2 | 100 | 8
 */

const WEIGHT_PATTERN = /(\d+(?:\.\d+)?)\s*(kg|lbs?|lb)/i;
const REPS_PATTERN = /[x×]\s*(\d+)/i;
const SET_LINE_PATTERN = /^(?:set\s*)?(\d+)[\s:.|]+(.+)/i;
function tryParseDuration(text: string): number | null {
  // Check for combined hours and minutes, e.g. "1h 15m", "1 hr 15 min", "1 hour 20 mins"
  const comboMatch = text.match(/(?:(\d+)\s*(?:h|hrs?|hours?))\s*(?:(\d+)\s*(?:m|mins?|minutes?))?/i);
  if (comboMatch) {
    const hours = parseInt(comboMatch[1], 10) || 0;
    const mins = comboMatch[2] ? parseInt(comboMatch[2], 10) : 0;
    return hours * 60 + mins;
  }

  // Check for minutes only: "45m", "45 min", "45 minutes"
  const minsMatch = text.match(/(\d+)\s*(?:m|mins?|minutes?)\b/i);
  if (minsMatch) {
    return parseInt(minsMatch[1], 10);
  }

  return null;
}
const DATE_PATTERNS = [
  // Sep 25, 2026
  /([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/,
  // 25 Sep 2026
  /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/,
  // 2026-09-25
  /(\d{4})-(\d{2})-(\d{2})/,
  // 09/25/2026
  /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
];

const RPE_PATTERN = /(?:@|RPE\s*)(\d+(?:\.\d+)?)/i;
const PR_PATTERN = /(?:🏆|PR|PB|personal\s*(?:record|best))/i;
const WARMUP_PATTERN = /(?:warm\s*up|wu)/i;
const DROP_PATTERN = /(?:drop\s*set|ds)/i;

export interface ParseResult {
  workout: ParsedWorkout;
  warnings: string[];
  unresolvedLines: string[];
}

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
  const exercises: ParsedExercise[] = [];

  let currentExercise: ParsedExercise | null = null;
  let setCounter = 0;
  let headerConsumed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip separator lines
    if (/^[-─═=•]+$/.test(line)) continue;

    // Try to parse date from line
    if (!headerConsumed && !performedAt) {
      const dateResult = tryParseDate(line);
      if (dateResult) {
        performedAt = dateResult;

        // Check if this line also has duration
        const parsedDur = tryParseDuration(line);
        if (parsedDur !== null) {
          durationMinutes = parsedDur;
        }

        // If this is line 1 or 2, the previous line was likely the workout name
        if (i === 1 && !workoutName) {
          workoutName = lines[0];
        }

        headerConsumed = true;
        continue;
      }
    }

    // Try to parse as a set line (weight x reps or tabular)
    const setResult = tryParseSetLine(line, setCounter);
    if (setResult) {
      // Check RPE
      const rpeMatch = line.match(RPE_PATTERN);
      if (rpeMatch) setResult.rpe = parseFloat(rpeMatch[1]);

      // Check PR
      if (PR_PATTERN.test(line)) setResult.isPersonalRecord = true;

      // Check set type
      if (WARMUP_PATTERN.test(line)) setResult.setType = 'WARMUP';
      else if (DROP_PATTERN.test(line)) setResult.setType = 'DROP';

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

    // Try tabular format: "1 | 100 | 8"
    const tabularSet = tryParseTabularSet(line, setCounter);
    if (tabularSet) {
      if (currentExercise) {
        currentExercise.sets.push(tabularSet);
        setCounter++;
      }
      continue;
    }

    // Skip table headers
    if (/^(?:set|#)\s*[\|│]/i.test(line)) continue;

    // If line looks like an exercise name (not a number-heavy set line)
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
      continue;
    }

    // If nothing matches, track it
    if (headerConsumed || i > 2) {
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
      notes: null,
      exercises,
    },
    warnings,
    unresolvedLines,
  };
}

function tryParseDate(line: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      try {
        // Try native Date parsing on the matched portion
        const dateStr = match[0];
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          return d.toISOString();
        }
      } catch {
        // Ignore parse failures
      }
    }
  }
  return null;
}

function tryParseSetLine(line: string, setIndex: number): ParsedSet | null {
  const weightMatch = line.match(WEIGHT_PATTERN);
  const repsMatch = line.match(REPS_PATTERN);

  if (!weightMatch && !repsMatch) return null;

  let weightKg: number | null = null;
  if (weightMatch) {
    const val = parseFloat(weightMatch[1]);
    const unit = weightMatch[2].toLowerCase();
    weightKg = unit.startsWith('lb') ? val / 2.20462 : val;
    weightKg = Math.round(weightKg * 100) / 100;
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
    reps,
    durationSeconds: null,
    distanceMeters: null,
    rpe: null,
    isPersonalRecord: false,
    notes: null,
  };
}

function tryParseTabularSet(line: string, setIndex: number): ParsedSet | null {
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
    reps: isNaN(reps) ? null : reps,
    durationSeconds: null,
    distanceMeters: null,
    rpe: null,
    isPersonalRecord: false,
    notes: null,
  };
}

function isExerciseName(line: string): boolean {
  // An exercise name should:
  // - Not start with a digit (unless it's like "21s" or similar exercise name)
  // - Not contain "x" between two numbers (that's a set)
  // - Not be purely numeric
  // - Have mostly alphabetic characters

  if (/^\d+\s*[\|│:.]/.test(line)) return false; // Set number prefix
  if (/\d+\s*(kg|lbs?)\s*[x×]\s*\d+/i.test(line)) return false; // Weight x reps
  if (/^\d+$/.test(line)) return false;

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
