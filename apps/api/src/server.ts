import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';

import { env } from './env.js';
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
import { notificationRoutes } from './routes/notifications.js';

export async function buildServer(): Promise<FastifyInstance> {
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
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);

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
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.register(mpesaRoutes, { prefix: '/webhooks/mpesa' });

  return app;
}
