'use client';

import { useCallback, useEffect, useReducer, useRef, type Reducer } from 'react';

import { blockReducer, initialBlockState, type BlockEvent, type BlockResult, type BlockState } from './block-state';

/**
 * Runs `load` when the block appears and again whenever `deps` change. A
 * change of `deps` is a fresh load: the block goes back to loading and the
 * earlier answer is dropped. `retry` asks the same question again, and a block
 * that has already loaded keeps showing its data, marked `refreshing`, until
 * the new answer arrives. The rules are `blockReducer`'s; this hook sends the
 * request and numbers it, so only the latest request's answer is kept.
 */
export function useBlock<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  isEmpty?: (data: T) => boolean,
): BlockResult<T> {
  const [state, dispatch] = useReducer<Reducer<BlockState<T>, BlockEvent<T>>>(blockReducer, initialBlockState<T>());
  const latest = useRef(0);
  // The newest `load` and `isEmpty`, without making every render a new request.
  const loadRef = useRef(load);
  loadRef.current = load;
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;

  const send = useCallback((type: 'load' | 'retry') => {
    const request = ++latest.current;
    dispatch({ type, request });
    loadRef.current().then(
      (data) => dispatch({ type: 'answered', request, data, empty: isEmptyRef.current?.(data) ?? false }),
      (error: unknown) => dispatch({ type: 'failed', request, error }),
    );
  }, []);

  useEffect(() => {
    send('load');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const retry = useCallback(() => send('retry'), [send]);
  return { ...state.block, retry };
}
