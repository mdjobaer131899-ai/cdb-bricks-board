import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A name box with the app's own drop-down list under it (instead of a <datalist>, which
 * phones show as a strip above the keyboard). Typing narrows the list (names that start with
 * the typed text first), a tap picks a name and closes the keyboard, and any other text can
 * still be typed. On a phone the box scrolls to the top when it opens, so the list is not
 * hidden behind the keyboard.
 */
export type ComboOption = string | { value: string; label?: string; sub?: string | null };

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

export function NameCombo({
  value, onChange, options, placeholder, className, inputClassName, emptyText, max = 80, id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** shown when nothing matches what was typed */
  emptyText?: string;
  max?: number;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ value: string; label?: string; sub?: string | null }> = [];
    for (const o of options) {
      const it = typeof o === "string" ? { value: o } : o;
      const key = norm(it.value);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
    return out;
  }, [options]);

  const q = norm(value);
  const exact = items.some((i) => norm(i.value) === q);
  const shown = useMemo(() => {
    // nothing typed, or a name already picked: the whole list, so another can be chosen
    if (!q || exact) return items.slice(0, max);
    const starts: typeof items = [];
    const has: typeof items = [];
    for (const i of items) {
      const n = norm(i.value);
      if (n.startsWith(q) || n.split(" ").some((w) => w.startsWith(q))) starts.push(i);
      else if (n.includes(q) || (i.sub && norm(i.sub).includes(q))) has.push(i);
    }
    return [...starts, ...has].slice(0, max);
  }, [items, q, exact, max]);

  // a tap anywhere else closes the list
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const openList = () => {
    setOpen(true);
    setActive(-1);
    // the phone keyboard covers the lower half: bring the box up so the list shows under it
    try {
      if (window.matchMedia("(pointer: coarse)").matches) {
        window.setTimeout(() => wrapRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 300);
      }
    } catch { /* old browser */ }
  };
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={wrapRef} className={cn("relative scroll-mt-4", className)}>
      <Input
        ref={inputRef}
        id={id}
        className={cn("h-11 pr-[4.5rem]", inputClassName)}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={openList}
        onClick={() => { if (!open) openList(); }}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && active >= 0 && shown[active]) { e.preventDefault(); pick(shown[active].value); }
          else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
        }}
      />
      <div className="absolute inset-y-0 right-1 flex items-center">
        {value && (
          <button type="button" aria-label="নাম মুছুন" className="grid h-9 w-8 place-items-center text-muted-foreground"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => { onChange(""); setOpen(true); inputRef.current?.focus(); }}>
            <X className="h-4 w-4" />
          </button>
        )}
        <button type="button" tabIndex={-1} aria-label={open ? "তালিকা বন্ধ করুন" : "তালিকা খুলুন"} className="grid h-9 w-8 place-items-center text-muted-foreground"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => { if (open) setOpen(false); else { inputRef.current?.focus(); openList(); } }}>
          <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
        </button>
      </div>

      {open && (shown.length > 0 || (q && emptyText)) && (
        <ul id={listId} role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-[min(16rem,45vh)] overflow-y-auto overscroll-contain rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
          {shown.map((o, i) => {
            const on = norm(o.value) === q;
            return (
              <li key={o.value} role="option" aria-selected={on}>
                <button type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(o.value)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm",
                    i === active ? "bg-muted" : "active:bg-muted",
                    on && "font-bold text-primary",
                  )}>
                  <span className="min-w-0 truncate">{o.label ?? o.value}</span>
                  {o.sub && <span className="num shrink-0 text-xs text-muted-foreground">{o.sub}</span>}
                </button>
              </li>
            );
          })}
          {shown.length === 0 && q && emptyText && <li className="px-3 py-2.5 text-xs text-muted-foreground">{emptyText}</li>}
        </ul>
      )}
    </div>
  );
}
