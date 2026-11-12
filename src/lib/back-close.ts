import { useEffect, useRef } from "react";

/**
 * The phone's back button closes what is open on the page (a dialog, a sheet, a person's
 * details, the AI chat, the + sheet's second step) instead of leaving the page.
 *
 * Opening a layer adds one history entry with the same address; the back button removes it,
 * and the layer closes. Closing a layer on screen removes its entry again, unless a page
 * change came first: then the entry is marked dead and skipped when back reaches it.
 * Layers stack: one back press closes only the top one.
 */
const KEY = "__cdbLayer";
const stack: string[] = [];
const dead = new Set<string>();
let seq = 0;
let installed = false;

const layerOf = (state: unknown): string | undefined =>
  state && typeof state === "object" ? ((state as Record<string, unknown>)[KEY] as string | undefined) : undefined;

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("popstate", (e) => {
    const id = layerOf(e.state);
    // landed on the entry of a layer that is gone: step over it
    if (id && dead.has(id) && !stack.includes(id)) window.history.back();
  });
}

export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    install();
    const id = `${Date.now().toString(36)}-${(++seq).toString(36)}`;
    stack.push(id);
    window.history.pushState({ ...((window.history.state as object | null) ?? {}), [KEY]: id }, "");
    let closedByBack = false;

    const onPop = (e: PopStateEvent) => {
      const pos = stack.indexOf(id);
      if (pos < 0) return;
      const top = layerOf(e.state);
      const topPos = top ? stack.indexOf(top) : -1;
      if (topPos < pos) {
        stack.splice(pos, 1);
        closedByBack = true;
        closeRef.current();
      }
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      if (closedByBack) return;
      const pos = stack.indexOf(id);
      if (pos >= 0) stack.splice(pos, 1);
      // closed on screen: take the entry off if it is still on top (a link inside the
      // layer may have moved to another page in the meantime; then just skip it later)
      window.setTimeout(() => {
        if (layerOf(window.history.state) === id) window.history.back();
        else dead.add(id);
      }, 80);
    };
  }, [open]);
}
