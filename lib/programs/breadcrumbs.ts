import * as Sentry from '@sentry/nextjs';

type ProgramEventType =
  | 'program.created'
  | 'program.assigned'
  | 'program.edited'
  | 'program.archived'
  | 'program.restored'
  | 'program.version_conflict';

export function programBreadcrumb(type: ProgramEventType, data: Record<string, unknown>) {
  Sentry.addBreadcrumb({
    category: 'programs',
    type,
    level: 'info',
    data: { event: type, ...data },
    timestamp: Date.now() / 1000,
  });
}

/**
 * Version-conflict events get captured as a Sentry message (not just a
 * breadcrumb) so we can monitor frequency. Frequent conflicts = UX problem.
 */
export function captureVersionConflict(data: {
  program_id: string;
  expected_version: number;
  actual_version: number;
}) {
  Sentry.captureMessage('program.version_conflict', {
    level: 'warning',
    extra: data,
  });
}
