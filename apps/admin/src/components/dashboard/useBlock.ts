'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One block of the Dashboard and the request behind it. Each block loads,
 * fails and retries by itself, so one refused or slow request never blanks
 * the rest of the page.
 */
export type Block<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  /** Loaded, and `isEmpty` says there is nothing in it to show. */
  | { status: 'empty'; data: T }
  | { status: 'failed' };

/**
 * Runs `load` when the block appears and again whenever `deps` change. Only
 * the latest request's answer is kept: an earlier month's figures arriving
 * late never replace the month on screen.
 */
export function useBlock<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  isEmpty?: (data: T) => boolean,
): Block<T> & { retry: () => void } {
  const [block, setBlock] = useState<Block<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  // The newest `load` and `isEmpty`, without making every render a new request.
  const loadRef = useRef(load);
  loadRef.current = load;
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;

  useEffect(() => {
    const request = ++latest.current;
    setBlock({ status: 'loading' });
    loadRef.current().then(
      (data) => {
        if (request !== latest.current) return;
        setBlock({ status: isEmptyRef.current?.(data) ? 'empty' : 'loaded', data });
      },
      () => {
        if (request === latest.current) setBlock({ status: 'failed' });
      },
    );
    return () => {
      // Leaving the page, or moving on to the next request: this answer is no longer wanted.
      latest.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...block, retry };
}
