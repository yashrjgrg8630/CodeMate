/**
 * Global background-task store.
 *
 * Problem: when a user starts a long-running AI call (analyze, generate
 * roadmap, job-match, etc.) and then navigates to another page, the React
 * component that owns the mutation/state unmounts and the in-flight request's
 * result is silently lost.
 *
 * Solution: every long-running call is registered in a **module-level Map**
 * (lives for the lifetime of the SPA — survives any route change). The hook
 * `useBackgroundTask<T>(key)` gives the current page access to start a task,
 * read its result, and clear it.  Because the promise is tracked outside the
 * React tree, navigation never cancels the work.
 */

import { useCallback, useSyncExternalStore } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TaskState<T> =
  | { status: "idle" }
  | { status: "pending"; startedAt: number }
  | { status: "success"; data: T; finishedAt: number }
  | { status: "error"; error: Error; finishedAt: number };

/* ------------------------------------------------------------------ */
/*  Module-level store (outlives every component)                      */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tasks = new Map<string, TaskState<any>>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

const IDLE_STATE: TaskState<never> = { status: "idle" };

function getSnapshot<T>(key: string): TaskState<T> {
  return (tasks.get(key) as TaskState<T>) ?? IDLE_STATE;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface BackgroundTask<T> {
  /** Current state — always referentially stable per status transition. */
  state: TaskState<T>;

  /** Convenience booleans */
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  isIdle: boolean;

  /** The resolved data (or `undefined` while not yet succeeded). */
  data: T | undefined;

  /** The error (or `undefined`). */
  error: Error | undefined;

  /**
   * Kick off a new task.  If a task with the same key is already pending the
   * previous promise is **not** cancelled (we cannot cancel `fetch` without an
   * `AbortController` the caller owns) but its result will be silently
   * discarded — only the latest `run` wins.
   */
  run: (fn: () => Promise<T>) => void;

  /** Reset to idle — clears data **and** error. */
  reset: () => void;
}

/** Monotonically increasing id so stale promises don't overwrite newer runs. */
const runIds = new Map<string, number>();

export function useBackgroundTask<T>(key: string): BackgroundTask<T> {
  // `useSyncExternalStore` re-renders only when the snapshot reference changes.
  const state = useSyncExternalStore(
    subscribe,
    () => getSnapshot<T>(key),
    () => getSnapshot<T>(key),
  );

  const run = useCallback(
    (fn: () => Promise<T>) => {
      const id = (runIds.get(key) ?? 0) + 1;
      runIds.set(key, id);

      tasks.set(key, { status: "pending", startedAt: Date.now() });
      emit();

      fn().then(
        (data) => {
          // Only commit if no newer run was started.
          if (runIds.get(key) === id) {
            tasks.set(key, { status: "success", data, finishedAt: Date.now() });
            emit();
          }
        },
        (err) => {
          if (runIds.get(key) === id) {
            tasks.set(key, {
              status: "error",
              error: err instanceof Error ? err : new Error(String(err)),
              finishedAt: Date.now(),
            });
            emit();
          }
        },
      );
    },
    [key],
  );

  const reset = useCallback(() => {
    tasks.delete(key);
    runIds.delete(key);
    emit();
  }, [key]);

  return {
    state,
    isPending: state.status === "pending",
    isSuccess: state.status === "success",
    isError: state.status === "error",
    isIdle: state.status === "idle",
    data: state.status === "success" ? state.data : undefined,
    error: state.status === "error" ? state.error : undefined,
    run,
    reset,
  };
}
