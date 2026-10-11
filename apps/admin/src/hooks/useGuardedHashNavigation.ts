import { useCallback, useEffect, useRef, useState } from "react";

const HISTORY_INDEX = "pagevaultNavigationIndex";
type PendingAction = { proceed: () => void };

function historyIndex(): number | undefined {
  const state: unknown = window.history.state;
  if (!state || typeof state !== "object") return undefined;
  const value = (state as Record<string, unknown>)[HISTORY_INDEX];
  return typeof value === "number" ? value : undefined;
}

// Restore the current history entry before asking, so cancelling Back keeps
// both the draft and the browser's Back/Forward history intact.
export function useGuardedHashNavigation(onChange: (hash: string) => void) {
  const dirty = useRef(false);
  const hash = useRef(window.location.hash);
  const index = useRef(0);
  const restoring = useRef<{ delta: number } | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const commit = useCallback(
    (path: string) => {
      const nextHash = path.startsWith("#") ? path : `#${path}`;
      if (nextHash === hash.current) return;
      index.current += 1;
      window.history.pushState(
        { ...window.history.state, [HISTORY_INDEX]: index.current },
        "",
        nextHash,
      );
      hash.current = nextHash;
      onChange(nextHash);
    },
    [onChange],
  );

  useEffect(() => {
    index.current = historyIndex() ?? 0;
    window.history.replaceState(
      { ...window.history.state, [HISTORY_INDEX]: index.current },
      "",
    );
    function change() {
      const nextHash = window.location.hash;
      if (restoring.current) {
        if (nextHash === hash.current) {
          const { delta } = restoring.current;
          restoring.current = null;
          setPending({ proceed: () => window.history.go(delta) });
        }
        return;
      }
      if (nextHash === hash.current) return;
      const storedIndex = historyIndex();
      const nextIndex = storedIndex ?? index.current + 1;
      if (storedIndex === undefined) {
        window.history.replaceState(
          { ...window.history.state, [HISTORY_INDEX]: nextIndex },
          "",
        );
      }
      if (dirty.current) {
        const delta = nextIndex - index.current;
        if (delta !== 0) {
          restoring.current = { delta };
          window.history.go(-delta);
        } else {
          window.history.replaceState(window.history.state, "", hash.current);
          setPending({ proceed: () => commit(nextHash) });
        }
        return;
      }
      index.current = nextIndex;
      hash.current = nextHash;
      onChange(nextHash);
    }
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("popstate", change);
    window.addEventListener("hashchange", change);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("popstate", change);
      window.removeEventListener("hashchange", change);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [commit, onChange]);

  const request = useCallback((proceed: () => void) => {
    if (dirty.current) setPending({ proceed });
    else proceed();
  }, []);
  const navigate = useCallback(
    (path: string) => request(() => commit(path)),
    [commit, request],
  );
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  function confirm() {
    dirty.current = false;
    setPending(null);
    pending?.proceed();
  }
  return {
    navigate,
    request,
    setDirty,
    pending: pending !== null,
    confirm,
    cancel: () => setPending(null),
  };
}
