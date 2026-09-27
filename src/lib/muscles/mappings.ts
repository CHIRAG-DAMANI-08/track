/**
 * Conservative, rule-based muscle mappings for standard strength training exercises.
 * 
 * Rules:
 * - Only assign PRIMARY, SECONDARY, and TERTIARY emphasis.
 * - No fake activation percentages.
 * - Conservative mappings grounded in biomechanics.
 * - Unknown exercises must return null (unmapped).
 */

export interface ExerciseMuscleMapping {
  primary: string; // Canonical muscle ID (e.g. 'chest')
  secondary: string[];
  tertiary: string[];
}

interface ExerciseRule {
  pattern: RegExp;
  mapping: ExerciseMuscleMapping;
}

const EXERCISE_RULES: ExerciseRule[] = [
  // ─── CHEST / PRESSING ──────────────────────────────────────────
  {
    pattern: /incline.*bench|incline.*press|incline.*dumbbell/i,
    mapping: {
      primary: 'chest',
      secondary: ['front_delts', 'triceps'],
      tertiary: [],
    },
  },
  {
    pattern: /decline.*bench|decline.*press/i,
    mapping: {
      primary: 'chest',
      secondary: ['triceps'],
      tertiary: ['front_delts'],
    },
  },
  {
    pattern: /bench\s*press|chest\s*press|dumbbell\s*press|floor\s*press|push[\s-]?up/i,
    mapping: {
      primary: 'chest',
      secondary: ['triceps', 'front_delts'],
      tertiary: [],
    },
  },
  {
    pattern: /chest\s*fly|cable\s*fly|pec\s*deck|machine\s*fly|dumbbell\s*fly/i,
    mapping: {
      primary: 'chest',
      secondary: ['front_delts'],
      tertiary: [],
    },
  },
  {
    pattern: /dip/i,
    mapping: {
      primary: 'triceps',
      secondary: ['chest', 'front_delts'],
      tertiary: [],
    },
  },

  // ─── SHOULDERS ─────────────────────────────────────────────────
  {
    pattern: /overhead\s*press|military\s*press|shoulder\s*press|arnold\s*press|push\s*press/i,
    mapping: {
      primary: 'front_delts',
      secondary: ['triceps', 'side_delts'],
      tertiary: ['upper_back'],
    },
  },
  {
    pattern: /lateral\s*raise|side\s*raise|side\s*delt/i,
    mapping: {
      primary: 'side_delts',
      secondary: ['upper_back'],
      tertiary: ['front_delts'],
    },
  },
  {
    pattern: /front\s*raise/i,
    mapping: {
      primary: 'front_delts',
      secondary: ['side_delts'],
      tertiary: [],
    },
  },
  {
    pattern: /rear\s*delt|face\s*pull|reverse\s*fly|reverse\s*pec\s*deck/i,
    mapping: {
      primary: 'rear_delts',
      secondary: ['upper_back'],
      tertiary: ['side_delts'],
    },
  },
  {
    pattern: /upright\s*row/i,
    mapping: {
      primary: 'side_delts',
      secondary: ['upper_back', 'biceps'],
      tertiary: [],
    },
  },
  {
    pattern: /shrug/i,
    mapping: {
      primary: 'upper_back',
      secondary: ['forearms'],
      tertiary: [],
    },
  },

  // ─── BACK / PULLING ────────────────────────────────────────────
  {
    pattern: /lat\s*pull\s*down|pulldown|pull[\s-]?up|chin[\s-]?up|v[\s-]?bar\s*pull\s*down/i,
    mapping: {
      primary: 'lats',
      secondary: ['biceps', 'upper_back'],
      tertiary: ['forearms'],
    },
  },
  {
    pattern: /iso[\s-]?lateral\s*row|barbell\s*row|bent[\s-]?over\s*row|pendlay\s*row|t[\s-]?bar\s*row|chest[\s-]?supported\s*row/i,
    mapping: {
      primary: 'upper_back',
      secondary: ['lats', 'biceps'],
      tertiary: ['lower_back', 'forearms'],
    },
  },
  {
    pattern: /cable\s*row|seated\s*row|machine\s*row|dumbbell\s*row|one[\s-]?arm\s*row/i,
    mapping: {
      primary: 'lats',
      secondary: ['upper_back', 'biceps'],
      tertiary: ['forearms'],
    },
  },
  {
    pattern: /straight[\s-]?arm\s*pull\s*down|pullover/i,
    mapping: {
      primary: 'lats',
      secondary: ['triceps', 'chest'],
      tertiary: [],
    },
  },
  {
    pattern: /back\s*extension|hyperextension/i,
    mapping: {
      primary: 'lower_back',
      secondary: ['glutes', 'hamstrings'],
      tertiary: [],
    },
  },

  // ─── ARMS: BICEPS & TRICEPS & FOREARMS ─────────────────────────
  {
    pattern: /bicep\s*curl|hammer\s*curl|preacher\s*curl|concentration\s*curl|incline\s*curl|spider\s*curl/i,
    mapping: {
      primary: 'biceps',
      secondary: ['forearms'],
      tertiary: [],
    },
  },
  {
    pattern: /tricep|rope\s*pushdown|skull\s*crusher|overhead\s*tricep|kickback/i,
    mapping: {
      primary: 'triceps',
      secondary: [],
      tertiary: [],
    },
  },
  {
    pattern: /wrist\s*curl|reverse\s*curl|forearm/i,
    mapping: {
      primary: 'forearms',
      secondary: ['biceps'],
      tertiary: [],
    },
  },

  // ─── LEGS: QUADS, HAMSTRINGS, GLUTES, CALVES ────────────────────
  {
    pattern: /squat|leg\s*press|hack\s*squat|goblet\s*squat/i,
    mapping: {
      primary: 'quads',
      secondary: ['glutes', 'adductors'],
      tertiary: ['lower_back', 'calves'],
    },
  },
  {
    pattern: /lunge|split\s*squat|bulgarian|step[\s-]?up/i,
    mapping: {
      primary: 'quads',
      secondary: ['glutes', 'hamstrings'],
      tertiary: ['adductors'],
    },
  },
  {
    pattern: /leg\s*extension/i,
    mapping: {
      primary: 'quads',
      secondary: [],
      tertiary: [],
    },
  },
  {
    pattern: /romanian\s*deadlift|rdl|stiff[\s-]?leg.*deadlift|good\s*morning/i,
    mapping: {
      primary: 'hamstrings',
      secondary: ['glutes', 'lower_back'],
      tertiary: ['forearms'],
    },
  },
  {
    pattern: /deadlift/i,
    mapping: {
      primary: 'glutes',
      secondary: ['hamstrings', 'lower_back', 'upper_back'],
      tertiary: ['quads', 'forearms'],
    },
  },
  {
    pattern: /leg\s*curl|hamstring\s*curl|nordic/i,
    mapping: {
      primary: 'hamstrings',
      secondary: ['calves'],
      tertiary: [],
    },
  },
  {
    pattern: /hip\s*thrust|glute\s*bridge/i,
    mapping: {
      primary: 'glutes',
      secondary: ['hamstrings'],
      tertiary: ['quads'],
    },
  },
  {
    pattern: /calf\s*raise|calves|seated\s*calf|donkey\s*calf/i,
    mapping: {
      primary: 'calves',
      secondary: [],
      tertiary: [],
    },
  },
  {
    pattern: /abductor|hip\s*abduction/i,
    mapping: {
      primary: 'glutes',
      secondary: [],
      tertiary: [],
    },
  },
  {
    pattern: /adductor|hip\s*adduction/i,
    mapping: {
      primary: 'adductors',
      secondary: [],
      tertiary: [],
    },
  },

  // ─── CORE / ABS ────────────────────────────────────────────────
  {
    pattern: /crunch|sit[\s-]?up|hanging\s*leg\s*raise|leg\s*raise|ab\s*wheel|cable\s*crunch|plank/i,
    mapping: {
      primary: 'abs',
      secondary: ['obliques'],
      tertiary: [],
    },
  },
  {
    pattern: /russian\s*twist|wood\s*chop|side\s*plank/i,
    mapping: {
      primary: 'obliques',
      secondary: ['abs'],
      tertiary: [],
    },
  },
];

/**
 * Finds a conservative muscle mapping for an exercise name.
 * Returns null if the exercise is unknown/unrecognized.
 */
export function findConservativeMuscleMapping(exerciseName: string): ExerciseMuscleMapping | null {
  if (!exerciseName) return null;
  const clean = exerciseName.trim();

  for (const rule of EXERCISE_RULES) {
    if (rule.pattern.test(clean)) {
      return rule.mapping;
    }
  }

  return null;
}
