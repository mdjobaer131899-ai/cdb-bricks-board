import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

/**
 * Remembers the open tab of a page for this visit (sessionStorage, per address), so coming
 * back to the page with the back button shows the same tab, not the first one again.
 * A tab chosen by the page itself (value) is left alone.
 */
const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ value, defaultValue, onValueChange, ...props }, ref) => {
  const key = React.useMemo(
    () => (typeof window !== "undefined" && value === undefined && defaultValue !== undefined ? `cdb-tab:${window.location.pathname}${window.location.search}:${defaultValue}` : null),
    // the key belongs to the page the tabs were first shown on
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [inner, setInner] = React.useState<string | undefined>(() => {
    if (!key) return defaultValue;
    try {
      return sessionStorage.getItem(key) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  });
  const root = React.useRef<HTMLDivElement | null>(null);
  // a remembered tab that is not there any more (e.g. shown to another role): back to the first
  React.useEffect(() => {
    if (!key || inner === defaultValue) return;
    const el = root.current;
    if (el && !el.querySelector('[role="tab"][data-state="active"]')) setInner(defaultValue);
  }, [key, inner, defaultValue]);
  const setRefs = (el: HTMLDivElement | null) => {
    root.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };
  if (value !== undefined) return <TabsPrimitive.Root ref={setRefs} value={value} onValueChange={onValueChange} {...props} />;
  return (
    <TabsPrimitive.Root
      ref={setRefs}
      value={inner}
      onValueChange={(v) => {
        setInner(v);
        if (key) {
          try {
            sessionStorage.setItem(key, v);
          } catch {
            /* storage off: the first tab shows next time */
          }
        }
        onValueChange?.(v);
      }}
      {...props}
    />
  );
});
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
