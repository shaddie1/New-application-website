import { ApiError } from '../../lib/api';

/**
 * The rules behind `useBlock`, kept free of React so they can be tested
 * without a DOM. `useBlock.ts` wires them to a component's state and to the
 * request itself.
 */

/**
 * One block of a page and the request behind it. Each block loads, fails and
 * retries by itself, so one refused or slow request never blanks the rest of
 * the page.
 */
export type Block<T> =
  | { status: 'loading' }
  /** `refreshing`: a retry is on its way, and `data` is the last answer, still shown until it lands. */
  | { status: 'loaded'; data: T; refreshing: boolean }
  /** Loaded, and `isEmpty` says there is nothing in it to show. */
  | { status: 'empty'; data: T; refreshing: boolean }
  /**
   * `httpStatus` is the server's answer when it gave one (403 for a refusal,
   * 404 for an address it does not know, 5xx for a fault). It is absent when
   * the request never got an answer.
   */
  | { status: 'failed'; httpStatus?: number };

/** A block as `useBlock` hands it to a component: its state, and a way to ask again. */
export type BlockResult<T> = Block<T> & { retry: () => void };

/** A block, and the number of the request whose answer it is waiting for or showing. */
export type BlockState<T> = { request: number; block: Block<T> };

export type BlockEvent<T> =
  /** A fresh load: the block has just appeared, or what it asks for (the month, say) has changed. */
  | { type: 'load'; request: number }
  /** The same question asked again. */
  | { type: 'retry'; request: number }
  | { type: 'answered'; request: number; data: T; empty: boolean }
  /** `error` is whatever the request threw. */
  | { type: 'failed'; request: number; error: unknown };

export function initialBlockState<T>(): BlockState<T> {
  return { request: 0, block: { status: 'loading' } };
}

/**
 * Only the latest request's answer is kept: an earlier month's figures
 * arriving late never replace the month on screen.
 */
export function blockReducer<T>(state: BlockState<T>, event: BlockEvent<T>): BlockState<T> {
  switch (event.type) {
    case 'load':
      // The earlier answer is dropped at once, so one month's figures never
      // sit under another month's heading.
      return { request: event.request, block: { status: 'loading' } };

    case 'retry': {
      // What is on screen is still the answer to this question, so it stays
      // until the new one lands: saving targets retries the overview, and that
      // must not blank the sections drawn from it.
      const { block } = state;
      if (block.status === 'loaded' || block.status === 'empty') {
        return { request: event.request, block: { ...block, refreshing: true } };
      }
      return { request: event.request, block: { status: 'loading' } };
    }

    case 'answered':
      if (event.request !== state.request) return state;
      return {
        request: state.request,
        block: { status: event.empty ? 'empty' : 'loaded', data: event.data, refreshing: false },
      };

    case 'failed': {
      if (event.request !== state.request) return state;
      // Only an answer from the server has a status; a request that never
      // reached it is thrown by `fetch` and carries none.
      const { error } = event;
      return {
        request: state.request,
        block: error instanceof ApiError ? { status: 'failed', httpStatus: error.status } : { status: 'failed' },
      };
    }
  }
}

/**
 * The same block seen through `map`: the status, the refreshing mark and
 * `retry` are the source's, so two sections drawn from one request load, fail
 * and retry together.
 */
export function mapBlock<T, U>(block: BlockResult<T>, map: (data: T) => U): BlockResult<U> {
  if (block.status === 'loaded' || block.status === 'empty') return { ...block, data: map(block.data) };
  return block;
}
