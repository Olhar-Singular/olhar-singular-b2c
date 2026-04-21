import { useCallback, useMemo } from "react";
import { useHistory } from "@/hooks/useHistory";
import {
  toCanonicalDsl,
  toRawDsl,
  type CanonicalDsl,
} from "@/lib/dsl/types";
import type { ImageRegistry } from "@/components/editor/imageManagerUtils";

type ContentState = {
  dsl: CanonicalDsl;
  registry: ImageRegistry;
};

export type UseActivityContentOptions = {
  initialDsl: string;
  initialRegistry: ImageRegistry;
  onChange?: (state: ContentState) => void;
};

export type UseActivityContentReturn = {
  dsl: string;
  dslExpanded: string;
  registry: ImageRegistry;
  setDsl: (next: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (next: { dsl: string; registry: ImageRegistry }) => void;
};

export function useActivityContent(
  options: UseActivityContentOptions,
): UseActivityContentReturn {
  const seeded = useMemo<ContentState>(() => {
    const { dsl, registry } = toCanonicalDsl(
      options.initialDsl,
      options.initialRegistry,
    );
    return { dsl, registry };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const history = useHistory<ContentState>(seeded, {
    onChange: options.onChange
      ? (s) => options.onChange!(s.present)
      : undefined,
  });

  const current = history.current;

  const setDsl = useCallback(
    (next: string) => {
      const { dsl, registry } = toCanonicalDsl(next, current.registry);
      if (dsl === current.dsl && registry === current.registry) return;
      history.set({ dsl, registry });
    },
    [current.dsl, current.registry, history],
  );

  const reset = useCallback(
    (next: { dsl: string; registry: ImageRegistry }) => {
      const { dsl, registry } = toCanonicalDsl(next.dsl, next.registry);
      history.reset({ dsl, registry });
    },
    [history],
  );

  const dslExpanded = useMemo(
    () => toRawDsl(current.dsl, current.registry),
    [current.dsl, current.registry],
  );

  return {
    dsl: current.dsl,
    dslExpanded,
    registry: current.registry,
    setDsl,
    undo: history.undo,
    redo: history.redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    reset,
  };
}
