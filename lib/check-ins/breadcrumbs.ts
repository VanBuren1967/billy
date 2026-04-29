import * as Sentry from '@sentry/nextjs';

type CheckInEventType = 'checkin.submitted' | 'checkin.updated';

export function checkInBreadcrumb(type: CheckInEventType, data: Record<string, unknown>) {
  Sentry.addBreadcrumb({
    category: 'check-ins',
    type,
    level: 'info',
    data: { event: type, ...data },
    timestamp: Date.now() / 1000,
  });
}
