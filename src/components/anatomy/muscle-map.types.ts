/**
 * Types for the Muscle Map and Weekly Muscle Heatmap system.
 * Keeps UI components isolated from the underlying body-muscles library.
 */

export type ExposureLevel = 'High' | 'Moderate' | 'Low';
export type TrendDirection = 'increasing' | 'decreasing' | 'consistent' | null;

export interface MuscleContributor {
  exerciseId: string;
  exerciseName: string;
  workingSets: number;
  emphasis: 'PRIMARY' | 'SECONDARY' | 'TERTIARY';
  workoutCount?: number;
  workoutNames?: string[];
}

export interface MuscleExposureDetail {
  muscleId: string; // Canonical ID (e.g. 'chest')
  displayName: string; // Human friendly name (e.g. 'Chest')
  category: 'Push' | 'Pull' | 'Legs' | 'Core' | 'Other';
  defaultView: 'FRONT' | 'BACK';
  exposureScore: number; // Raw weighted exposure score
  normalizedIntensity: number; // 0 to 10 scale for visualization
  exposureLevel: ExposureLevel; // 'High' | 'Moderate' | 'Low'
  workingSets: number; // Total working sets targeting this muscle
  workoutCount: number; // Number of workouts containing this muscle
  contributors: MuscleContributor[];
  trend: TrendDirection;
  trendText?: string;
}

export interface MuscleMapState {
  hasData: boolean;
  totalWorkouts: number;
  totalWorkingSets: number;
  // bodyState passed directly to BodyChart: SVG ID -> { intensity, selected }
  bodyState: Record<string, { intensity: number; selected: boolean }>;
  // Detailed map by canonical muscle ID
  muscles: Record<string, MuscleExposureDetail>;
  // Summary tiers
  mostExposure: MuscleExposureDetail[];
  moderateExposure: MuscleExposureDetail[];
  lowerExposure: MuscleExposureDetail[];
  // Exercises in the period that lack muscle mappings
  unmappedExercises: Array<{ id: string; name: string; sets: number }>;
}
