import { describe, expect, it } from 'vitest';

import { ApiError } from '../../lib/api';
import { blockReducer, initialBlockState, mapBlock, type BlockEvent, type BlockState } from './block-state';

type Figures = { revenue: number };

/** The state after `events`, starting from a block that has just appeared. */
function after(...events: BlockEvent<Figures>[]): BlockState<Figures> {
  return events.reduce(blockReducer<Figures>, initialBlockState<Figures>());
}

const october: Figures = { revenue: 10 };
const november: Figures = { revenue: 11 };

describe('a first load', () => {
  it('starts at loading, before any request and once the first is sent', () => {
    expect(initialBlockState<Figures>().block).toEqual({ status: 'loading' });
    expect(after({ type: 'load', request: 1 }).block).toEqual({ status: 'loading' });
  });

  it('is loaded with the answer, and not refreshing', () => {
    const state = after(
      { type: 'load', request: 1 },
      { type: 'answered', request: 1, data: november, empty: false },
    );
    expect(state.block).toEqual({ status: 'loaded', data: november, refreshing: false });
  });

  it('is empty when the answer has nothing in it to show', () => {
    const state = after(
      { type: 'load', request: 1 },
      { type: 'answered', request: 1, data: november, empty: true },
    );
    expect(state.block).toEqual({ status: 'empty', data: november, refreshing: false });
  });
});

describe('a failure', () => {
  it('keeps the HTTP status of a refusal', () => {
    const state = after(
      { type: 'load', request: 1 },
      { type: 'failed', request: 1, error: new ApiError(403, { error: 'dashboard section access required' }) },
    );
    expect(state.block).toEqual({ status: 'failed', httpStatus: 403 });
  });

  it('has no HTTP status when the request never got an answer', () => {
    const state = after(
      { type: 'load', request: 1 },
      { type: 'failed', request: 1, error: new TypeError('Failed to fetch') },
    );
    expect(state.block).toEqual({ status: 'failed' });
  });
});

describe('a retry', () => {
  const loaded = [
    { type: 'load', request: 1 },
    { type: 'answered', request: 1, data: october, empty: false },
  ] satisfies BlockEvent<Figures>[];

  it('of a loaded block keeps its data, marked as refreshing, until the new answer arrives', () => {
    const retrying = after(...loaded, { type: 'retry', request: 2 });
    expect(retrying.block).toEqual({ status: 'loaded', data: october, refreshing: true });

    const answered = blockReducer(retrying, { type: 'answered', request: 2, data: november, empty: false });
    expect(answered.block).toEqual({ status: 'loaded', data: november, refreshing: false });
  });

  it('of a loaded block falls to failed only when the new answer fails', () => {
    const retrying = after(...loaded, { type: 'retry', request: 2 });
    expect(retrying.block.status).toBe('loaded');

    const failed = blockReducer(retrying, { type: 'failed', request: 2, error: new ApiError(500, null) });
    expect(failed.block).toEqual({ status: 'failed', httpStatus: 500 });
  });

  it('of an empty block keeps it empty, marked as refreshing', () => {
    const retrying = after(
      { type: 'load', request: 1 },
      { type: 'answered', request: 1, data: october, empty: true },
      { type: 'retry', request: 2 },
    );
    expect(retrying.block).toEqual({ status: 'empty', data: october, refreshing: true });
  });

  it('of a failed block has nothing to keep, so it loads again', () => {
    const retrying = after(
      { type: 'load', request: 1 },
      { type: 'failed', request: 1, error: new ApiError(403, null) },
      { type: 'retry', request: 2 },
    );
    expect(retrying.block).toEqual({ status: 'loading' });
  });
});

describe('a change of month', () => {
  it('is a fresh load: loading, with no data, until the new month answers', () => {
    const changed = after(
      { type: 'load', request: 1 },
      { type: 'answered', request: 1, data: october, empty: false },
      { type: 'load', request: 2 },
    );
    expect(changed.block).toEqual({ status: 'loading' });

    const answered = blockReducer(changed, { type: 'answered', request: 2, data: november, empty: false });
    expect(answered.block).toMatchObject({ status: 'loaded', data: november });
  });

  it('never lets a late answer for the earlier month replace the month on screen', () => {
    // October is asked for, then November before October has answered.
    const waiting = after({ type: 'load', request: 1 }, { type: 'load', request: 2 });

    const lateOctober = blockReducer(waiting, { type: 'answered', request: 1, data: october, empty: false });
    expect(lateOctober.block).toEqual({ status: 'loading' });

    const shown = blockReducer(lateOctober, { type: 'answered', request: 2, data: november, empty: false });
    expect(shown.block).toMatchObject({ status: 'loaded', data: november });

    // October arriving, or failing, after November is on screen changes nothing either.
    expect(blockReducer(shown, { type: 'answered', request: 1, data: october, empty: false })).toBe(shown);
    expect(blockReducer(shown, { type: 'failed', request: 1, error: new ApiError(500, null) })).toBe(shown);
  });
});

describe('mapBlock', () => {
  const retry = () => {};

  it('gives a block of the same status, with the data it is asked for', () => {
    const block = { status: 'loaded' as const, data: november, refreshing: true, retry };
    expect(mapBlock(block, (figures) => figures.revenue)).toEqual({
      status: 'loaded',
      data: 11,
      refreshing: true,
      retry,
    });
  });

  it('passes a block with no data through as it is', () => {
    const loading = { status: 'loading' as const, retry };
    const refused = { status: 'failed' as const, httpStatus: 403, retry };
    const revenue = (figures: Figures) => figures.revenue;
    expect(mapBlock(loading, revenue)).toEqual(loading);
    expect(mapBlock(refused, revenue)).toEqual(refused);
  });
});
