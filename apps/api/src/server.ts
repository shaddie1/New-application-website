import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';

import { env } from './env.js';
import { adminAccess, shareholderRedaction } from './auth/adminAccess.js';
import { healthRoutes } from './routes/health.js';
import { mpesaRoutes } from './routes/mpesa.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { bookingRoutes } from './routes/booking.js';
import { addressRoutes } from './routes/addresses.js';
import { paymentRoutes } from './routes/payments.js';
import { crewRoutes } from './routes/crew.js';
import { loyaltyRoutes } from './routes/loyalty.js';
import { profileRoutes } from './routes/profile.js';
import { quoteRoutes } from './routes/quotes.js';
import { adminRoutes } from './routes/admin.js';
import { financialsRoutes } from './routes/financials.js';
import { financeRoutes } from './routes/finance.js';
import { documentRoutes } from './routes/documents.js';
import { projectRoutes } from './routes/projects.js';
import { jobReportsRoutes } from './routes/jobReports.js';
import { notificationRoutes } from './routes/notifications.js';
import { websiteJobRoutes, publicWebsiteJobRoutes } from './routes/websiteJobs.js';

/** `onRoute` sees every route as it registers, so tests can check rules that must hold for all of them. */
export async function buildServer(opts: { onRoute?: (route: RouteOptions) => void } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? {
            level: env.LOG_LEVEL,
            transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
          }
        : { level: env.LOG_LEVEL },
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  // Lock CORS to the configured origins in production; reflect any origin in dev.
  const corsOrigin = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : true;
  await app.register(cors, { origin: corsOrigin, credentials: true });
  await app.register(sensible);

  // Before every /admin route's own guards: staff only, shareholders read-only
  // and without customer contact details (see auth/adminAccess.ts).
  app.addHook('preHandler', adminAccess);
  app.addHook('preSerialization', shareholderRedaction);
  if (opts.onRoute) app.addHook('onRoute', opts.onRoute);

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(catalogRoutes, { prefix: '/catalog' });
  await app.register(addressRoutes, { prefix: '/addresses' });
  await app.register(bookingRoutes, { prefix: '/bookings' });
  await app.register(paymentRoutes, { prefix: '/payments' });
  await app.register(crewRoutes, { prefix: '/crew' });
  await app.register(loyaltyRoutes, { prefix: '/loyalty' });
  await app.register(profileRoutes, { prefix: '/profile' });
  await app.register(quoteRoutes, { prefix: '/quote-requests' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(financialsRoutes, { prefix: '/admin/financials' });
  await app.register(financeRoutes, { prefix: '/admin/finance' });
  await app.register(documentRoutes, { prefix: '/admin/documents' });
  await app.register(projectRoutes, { prefix: '/admin/projects' });
  await app.register(jobReportsRoutes, { prefix: '/admin/job-reports' });
  await app.register(websiteJobRoutes, { prefix: '/admin/website-jobs' });
  await app.register(publicWebsiteJobRoutes, { prefix: '/website-jobs' });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.register(mpesaRoutes, { prefix: '/webhooks/mpesa' });

  return app;
}
