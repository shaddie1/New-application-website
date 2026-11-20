import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import type { PublicWebsiteJobDto, PublicWebsiteJobsResult } from '@onyxhawk/types';

import { API_URL } from './api';

/**
 * Published jobs, newest first, for "Our work" and the portfolio.
 *
 * Called at build time only: the site is a static export, so the jobs are baked
 * into the HTML and publishing in admin rebuilds the site. Production builds
 * set REQUIRE_WEBSITE_JOBS=1, and then a failed fetch fails the build, so the
 * host keeps the previous site live instead of shipping it without its jobs.
 * Without the flag (local dev) the build carries on with no jobs.
 */
export async function getPublishedJobs(): Promise<PublicWebsiteJobDto[]> {
  const url = `${API_URL}/website-jobs`;
  try {
    const body = await getJson<PublicWebsiteJobsResult>(url);
    return body.jobs;
  } catch (err) {
    // A refused connection arrives as an AggregateError with an empty message but a `code`.
    const reason = (err as NodeJS.ErrnoException).code ?? (err instanceof Error ? err.message : String(err));
    if (process.env.REQUIRE_WEBSITE_JOBS === '1') {
      throw new Error(`Could not fetch published jobs from ${url} (${reason}), and REQUIRE_WEBSITE_JOBS=1.`);
    }
    console.warn(`[website-jobs] Could not fetch published jobs from ${url} (${reason}); building with none.`);
    return [];
  }
}

/**
 * GET a JSON body with Node's own client rather than `fetch`. During a build,
 * Next stores fetch responses in .next/cache/fetch-cache and replays them on
 * the next build without calling the API, so a rebuild after a publish would
 * show the old jobs, and opting out with `cache: 'no-store'` breaks the export.
 */
function getJson<T>(url: string): Promise<T> {
  const get = url.startsWith('https:') ? httpsGet : httpGet;
  return new Promise((resolve, reject) => {
    get(url, { headers: { Accept: 'application/json' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`API ${res.statusCode}`));
        return;
      }
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw) as T);
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}
