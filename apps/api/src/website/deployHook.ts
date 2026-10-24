import type { FastifyBaseLogger } from 'fastify';
import type { SiteUpdateStatus } from '@onyxhawk/types';

import { env } from '../env.js';

const TIMEOUT_MS = 5_000;

/**
 * Ask Render to rebuild the public website, which fetches published website
 * jobs at build time. Never throws: the change that prompted the rebuild has
 * already been saved, so a failure is logged and reported back for admin to
 * tell staff the site did not start updating.
 */
export async function requestSiteRebuild(log: FastifyBaseLogger): Promise<SiteUpdateStatus> {
  if (!env.WEB_DEPLOY_HOOK_URL) return 'disabled';
  try {
    const res = await fetch(env.WEB_DEPLOY_HOOK_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      log.error({ status: res.status }, 'website deploy hook refused the rebuild');
      return 'failed';
    }
    return 'queued';
  } catch (err) {
    log.error({ err }, 'website deploy hook could not be reached');
    return 'failed';
  }
}
