import { useCallback, useEffect, useRef, useState } from "react";

const MAX_HISTORY = 50;

export type HistoryState<T> = {
  past: T[];
  present: T;
  future: T[];
};

export type UseHistoryOptions<T> = {
  seed?: HistoryState<T>;
  onChange?: (state: HistoryState<T>) => void;
};

export function useHistory<T>(initial: T, options?: UseHistoryOptions<T>) {
  const [state, setState] = useState<HistoryState<T>>(
    options?.seed ?? {
      past: [],
      present: initial,
      future: [],
    },
  );

  const set = useCallback((next: T) => {
    setState((prev) => ({
      past: [...prev.past, prev.present].slice(-MAX_HISTORY),
      present: next,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: prev.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((value: T) => {
    setState((prev) => ({
      past: [...prev.past, prev.present].slice(-MAX_HISTORY),
      present: value,
      future: [],
    }));
  }, []);

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  const onChangeRef = useRef(options?.onChange);
  useEffect(() => {
    onChangeRef.current = options?.onChange;
  }, [options?.onChange]);
  const initialStateRef = useRef(state);
  useEffect(() => {
    if (state === initialStateRef.current) return;
    onChangeRef.current?.(state);
  }, [state]);

  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  }, [undo, redo]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      } else if (
        (isMod && e.key === "y") ||
        (isMod && e.key === "z" && e.shiftKey)
      ) {
        e.preventDefault();
        redoRef.current();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    current: state.present,
    state,
    set,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
  };
}
