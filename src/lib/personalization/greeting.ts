/**
 * Time-aware greetings and dynamic home context for Chirag.
 * Uses the user's local device time and real application state.
 */

export interface HomeContextParams {
  userName?: string;
  totalWorkouts?: number;
  latestWorkout?: {
    id: string;
    name?: string | null;
    performedAt: Date | string;
    exercises?: Array<{
      exercise: { canonicalName: string };
      sets: unknown[];
    }>;
  } | null;
  activeExperiment?: {
    id: string;
    title: string;
    startDate: Date | string;
  } | null;
  latestObservation?: {
    content: string;
    type: string;
  } | null;
}

/**
 * Returns a time-aware natural greeting for Chirag.
 *
 * Rules:
 * 05:00–11:59: "Good morning, Chirag."
 * 12:00–16:59: "Good afternoon, Chirag."
 * 17:00–04:59: "Good evening, Chirag."
 */
export function getTimeAwareGreeting(name = 'Chirag', date: Date = new Date()): string {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) {
    return `Good morning, ${name}.`;
  }
  if (hour >= 12 && hour < 17) {
    return `Good afternoon, ${name}.`;
  }
  return `Good evening, ${name}.`;
}

/**
 * Generates an optional contextual follow-up sentence based strictly on actual data.
 * Returns null if there is no meaningful context to avoid generic filler.
 */
export function getPersonalizedHomeSubtext(params: HomeContextParams): string | null {
  const { totalWorkouts = 0, latestWorkout, activeExperiment, latestObservation } = params;

  // Case 1: First-time user / no workouts recorded yet
  if (totalWorkouts === 0 || !latestWorkout) {
    return "Your training history starts here. Import your first Hevy workout and I'll start learning your patterns.";
  }

  // Case 2: Active experiment in progress
  if (activeExperiment) {
    const start = new Date(activeExperiment.startDate);
    const now = new Date();
    const diffDays = Math.max(1, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const weekNum = Math.ceil(diffDays / 7);
    return `You're in week ${weekNum} of your current experiment (${activeExperiment.title}). Here's what I'm seeing so far.`;
  }

  // Case 3: Recent workout with positive observation
  const workoutDate = new Date(latestWorkout.performedAt);
  const now = new Date();
  const diffHours = (now.getTime() - workoutDate.getTime()) / (1000 * 60 * 60);

  if (diffHours <= 48) {
    const workoutName = latestWorkout.name ? latestWorkout.name.toLowerCase() : 'recent';
    if (latestObservation?.content && (latestObservation.type === 'TREND' || latestObservation.type === 'PRAISE' || latestObservation.type === 'FACTUAL')) {
      return `Good work on that ${workoutName} session. ${latestObservation.content}`;
    }
    return `Good work on that ${workoutName} session. Let's look at your progress.`;
  }

  // Case 4: High confidence recent observation exists
  if (latestObservation?.content) {
    return latestObservation.content;
  }

  return null;
}
