import * as Sentry from '@sentry/nextjs';

type WorkoutEventType =
  | 'workout.started'
  | 'workout.set_saved'
  | 'workout.notes_saved'
  | 'workout.completed'
  | 'workout.reopened';

export function workoutBreadcrumb(type: WorkoutEventType, data: Record<string, unknown>) {
  Sentry.addBreadcrumb({
    category: 'workouts',
    type,
    level: 'info',
    data: { event: type, ...data },
    timestamp: Date.now() / 1000,
  });
}
