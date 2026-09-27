/**
 * Muscle taxonomy and mapping between internal training concepts
 * and body-muscles SVG anatomical IDs.
 */

export type MuscleCategory = 'Push' | 'Pull' | 'Legs' | 'Core' | 'Other';

export interface MuscleDefinition {
  id: string; // Canonical internal ID (e.g. 'chest')
  name: string; // Human readable name (e.g. 'Chest')
  category: MuscleCategory;
  defaultView: 'FRONT' | 'BACK';
  bodyMuscleIds: string[]; // Corresponding body-muscles SVG path IDs
}

export const CANONICAL_MUSCLES: Record<string, MuscleDefinition> = {
  chest: {
    id: 'chest',
    name: 'Chest',
    category: 'Push',
    defaultView: 'FRONT',
    bodyMuscleIds: ['chest-upper-left', 'chest-upper-right', 'chest-lower-left', 'chest-lower-right'],
  },
  front_delts: {
    id: 'front_delts',
    name: 'Front Deltoids',
    category: 'Push',
    defaultView: 'FRONT',
    bodyMuscleIds: ['shoulder-front-left', 'shoulder-front-right'],
  },
  side_delts: {
    id: 'side_delts',
    name: 'Side Deltoids',
    category: 'Push',
    defaultView: 'FRONT',
    bodyMuscleIds: ['shoulder-side-left', 'shoulder-side-right'],
  },
  rear_delts: {
    id: 'rear_delts',
    name: 'Rear Deltoids',
    category: 'Pull',
    defaultView: 'BACK',
    bodyMuscleIds: ['deltoid-rear-left', 'deltoid-rear-right'],
  },
  triceps: {
    id: 'triceps',
    name: 'Triceps',
    category: 'Push',
    defaultView: 'BACK',
    bodyMuscleIds: ['triceps-long-left', 'triceps-long-right', 'triceps-lateral-left', 'triceps-lateral-right'],
  },
  biceps: {
    id: 'biceps',
    name: 'Biceps',
    category: 'Pull',
    defaultView: 'FRONT',
    bodyMuscleIds: ['biceps-left', 'biceps-right'],
  },
  forearms: {
    id: 'forearms',
    name: 'Forearms',
    category: 'Pull',
    defaultView: 'FRONT',
    bodyMuscleIds: [
      'forearm-left', 'forearm-right',
      'forearm-flexors-left', 'forearm-flexors-right',
      'forearm-extensors-left', 'forearm-extensors-right',
    ],
  },
  lats: {
    id: 'lats',
    name: 'Lats',
    category: 'Pull',
    defaultView: 'BACK',
    bodyMuscleIds: [
      'lats-upper-left', 'lats-upper-right',
      'lats-mid-left', 'lats-mid-right',
      'lats-lower-left', 'lats-lower-right',
    ],
  },
  upper_back: {
    id: 'upper_back',
    name: 'Upper Back / Traps',
    category: 'Pull',
    defaultView: 'BACK',
    bodyMuscleIds: [
      'traps-upper-left', 'traps-upper-right',
      'traps-mid-left', 'traps-mid-right',
      'traps-lower-left', 'traps-lower-right',
    ],
  },
  lower_back: {
    id: 'lower_back',
    name: 'Lower Back',
    category: 'Pull',
    defaultView: 'BACK',
    bodyMuscleIds: [
      'lower-back-erectors-left', 'lower-back-erectors-right',
      'lower-back-ql-left', 'lower-back-ql-right',
      'spine',
    ],
  },
  abs: {
    id: 'abs',
    name: 'Abdominals',
    category: 'Core',
    defaultView: 'FRONT',
    bodyMuscleIds: [
      'abs-upper-left', 'abs-upper-right',
      'abs-lower-left', 'abs-lower-right',
      'serratus-anterior-left', 'serratus-anterior-right',
    ],
  },
  obliques: {
    id: 'obliques',
    name: 'Obliques',
    category: 'Core',
    defaultView: 'FRONT',
    bodyMuscleIds: ['obliques-left', 'obliques-right'],
  },
  quads: {
    id: 'quads',
    name: 'Quadriceps',
    category: 'Legs',
    defaultView: 'FRONT',
    bodyMuscleIds: ['quads-left', 'quads-right'],
  },
  hamstrings: {
    id: 'hamstrings',
    name: 'Hamstrings',
    category: 'Legs',
    defaultView: 'BACK',
    bodyMuscleIds: [
      'hamstrings-medial-left', 'hamstrings-medial-right',
      'hamstrings-lateral-left', 'hamstrings-lateral-right',
    ],
  },
  glutes: {
    id: 'glutes',
    name: 'Glutes',
    category: 'Legs',
    defaultView: 'BACK',
    bodyMuscleIds: [
      'gluteus-maximus-left', 'gluteus-maximus-right',
      'gluteus-medius-left', 'gluteus-medius-right',
    ],
  },
  calves: {
    id: 'calves',
    name: 'Calves',
    category: 'Legs',
    defaultView: 'BACK',
    bodyMuscleIds: [
      'calves-gastroc-medial-left', 'calves-gastroc-medial-right',
      'calves-gastroc-lateral-left', 'calves-gastroc-lateral-right',
      'calves-soleus-left', 'calves-soleus-right',
      'tibialis-anterior-left', 'tibialis-anterior-right',
    ],
  },
  adductors: {
    id: 'adductors',
    name: 'Adductors',
    category: 'Legs',
    defaultView: 'FRONT',
    bodyMuscleIds: ['adductors-left', 'adductors-right'],
  },
  neck: {
    id: 'neck',
    name: 'Neck',
    category: 'Other',
    defaultView: 'FRONT',
    bodyMuscleIds: ['neck-left', 'neck-right', 'nape'],
  },
};

// Map each individual body-muscles SVG ID to its parent canonical muscle ID
export const SVG_ID_TO_CANONICAL: Record<string, string> = {};
for (const [canonicalId, def] of Object.entries(CANONICAL_MUSCLES)) {
  for (const svgId of def.bodyMuscleIds) {
    SVG_ID_TO_CANONICAL[svgId] = canonicalId;
  }
}

// Map common text names / synonyms to canonical muscle ID
export function normalizeMuscleGroup(name: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim().replace(/[-_]+/g, ' ');

  // Direct canonical key match
  const directKey = lower.replace(/\s+/g, '_');
  if (CANONICAL_MUSCLES[directKey]) return directKey;

  // Synonyms
  if (lower.includes('chest') || lower.includes('pec')) return 'chest';
  if (lower.includes('front delt') || lower.includes('anterior delt')) return 'front_delts';
  if (lower.includes('side delt') || lower.includes('lateral delt') || lower.includes('lateral raise')) return 'side_delts';
  if (lower.includes('rear delt') || lower.includes('posterior delt')) return 'rear_delts';
  if (lower === 'shoulder' || lower === 'shoulders' || lower === 'deltoids' || lower === 'delts') return 'front_delts'; // generic shoulder defaults to front/side

  if (lower.includes('tricep')) return 'triceps';
  if (lower.includes('bicep')) return 'biceps';
  if (lower.includes('forearm') || lower.includes('grip') || lower.includes('wrist')) return 'forearms';

  if (lower.includes('lat') || lower.includes('pulldown') || lower.includes('pull down')) return 'lats';
  if (lower.includes('trap') || lower.includes('upper back') || lower.includes('rhomboid')) return 'upper_back';
  if (lower.includes('lower back') || lower.includes('erector') || lower.includes('lumbar')) return 'lower_back';
  if (lower === 'back') return 'lats'; // generic back defaults to lats

  if (lower.includes('quad') || lower.includes('thigh') || lower.includes('leg ext')) return 'quads';
  if (lower.includes('hamstring') || lower.includes('leg curl')) return 'hamstrings';
  if (lower.includes('glute') || lower.includes('butt') || lower.includes('hip thrust')) return 'glutes';
  if (lower.includes('cal') || lower.includes('soleus') || lower.includes('gastroc')) return 'calves';
  if (lower.includes('adductor') || lower.includes('inner thigh')) return 'adductors';

  if (lower.includes('ab') || lower.includes('core') || lower.includes('rectus')) return 'abs';
  if (lower.includes('oblique')) return 'obliques';
  if (lower.includes('neck')) return 'neck';

  return null;
}

export function getMuscleDisplayName(canonicalOrSvgId: string): string {
  // If it's a direct canonical ID
  if (CANONICAL_MUSCLES[canonicalOrSvgId]) {
    return CANONICAL_MUSCLES[canonicalOrSvgId].name;
  }
  // If it's an SVG ID
  const canonicalId = SVG_ID_TO_CANONICAL[canonicalOrSvgId];
  if (canonicalId && CANONICAL_MUSCLES[canonicalId]) {
    return CANONICAL_MUSCLES[canonicalId].name;
  }
  // Fallback to title-cased ID
  return canonicalOrSvgId
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
