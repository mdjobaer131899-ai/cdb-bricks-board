import { useEffect } from "react";

/**
 * Keeps the focused input/textarea visible above the on-screen keyboard.
 * Uses visualViewport (iOS/iPadOS/Android) and exposes --kb-inset for layout.
 */
export function KeyboardAware() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    let raf = 0;

    const isField = (el: Element | null): el is HTMLElement =>
      !!el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        (el as HTMLElement).isContentEditable === true);

    function keyboardHeight() {
      if (!vv) return 0;
      const h = window.innerHeight - (vv.height + vv.offsetTop);
      return h > 80 ? h : 0;
    }

    function syncInset() {
      const kb = keyboardHeight();
      document.documentElement.style.setProperty("--kb-inset", `${kb}px`);
      document.documentElement.classList.toggle("keyboard-open", kb > 0);
      return kb;
    }

    function bringIntoView() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const kb = syncInset();
        const el = document.activeElement;
        if (!isField(el)) return;
        const rect = el.getBoundingClientRect();
        const visibleBottom = (vv ? vv.height : window.innerHeight) - (kb ? 12 : 0);
        const margin = 24;
        if (rect.bottom > visibleBottom - margin) {
          window.scrollBy({ top: rect.bottom - visibleBottom + margin + 40, behavior: "smooth" });
        } else if (rect.top < margin) {
          window.scrollBy({ top: rect.top - margin, behavior: "smooth" });
        }
      });
    }

    function onFocusIn(e: FocusEvent) {
      if (!isField(e.target as Element)) return;
      // wait for the keyboard animation before measuring
      setTimeout(bringIntoView, 120);
      setTimeout(bringIntoView, 350);
    }

    function onFocusOut() {
      setTimeout(syncInset, 200);
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", bringIntoView);
    vv?.addEventListener("scroll", syncInset);
    syncInset();

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", bringIntoView);
      vv?.removeEventListener("scroll", syncInset);
    };
  }, []);

  return null;
}
