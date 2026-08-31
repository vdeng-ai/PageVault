import { useLayoutEffect, useState } from "react";

export type PresenceState = "open" | "closing" | "closed";

export function useExitPresence(open: boolean, exitDuration: number) {
  const [present, setPresent] = useState(open);
  const [state, setState] = useState<PresenceState>(
    open ? "open" : "closed",
  );

  useLayoutEffect(() => {
    if (open) {
      setPresent(true);
      setState("open");
      return;
    }
    if (!present) {
      setState("closed");
      return;
    }

    setState("closing");
    const timer = window.setTimeout(() => {
      setPresent(false);
      setState("closed");
    }, exitDuration);
    return () => window.clearTimeout(timer);
  }, [exitDuration, open, present]);

  return { present, state } as const;
}
