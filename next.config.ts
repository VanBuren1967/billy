import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // hideSourceMaps was removed in @sentry/nextjs v10; source map deletion
  // after upload is now the default behaviour (sourcemaps.deleteSourcemapsAfterUpload).
  disableLogger: true,
  telemetry: false,
});
