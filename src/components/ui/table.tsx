import * as React from "react";

import { cn } from "@/lib/utils";

const useIsoLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/**
 * Copies each column's heading onto its cells (data-label), so on a phone the stylesheet
 * (.table-stack in styles.css) can show every row as a card: heading on the left, value on
 * the right, no sideways scrolling. Rows added later are labelled too.
 */
function labelCells(table: HTMLTableElement) {
  const heads = Array.from(table.querySelectorAll(":scope > thead > tr:last-child > th")).map((th) => th.textContent?.trim() ?? "");
  for (const tr of Array.from(table.querySelectorAll(":scope > tbody > tr, :scope > tfoot > tr"))) {
    let i = 0;
    for (const cell of Array.from(tr.children)) {
      const span = Number(cell.getAttribute("colspan") || 1);
      const label = span > 1 ? "" : heads[i] ?? "";
      if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
      i += span;
    }
  }
}

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  /** false keeps the plain table on phones too (a small table that already fits) */
  stack?: boolean;
};

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, stack = true, ...props }, ref) => {
    const inner = React.useRef<HTMLTableElement | null>(null);
    const setRef = (el: HTMLTableElement | null) => {
      inner.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLTableElement | null>).current = el;
    };
    useIsoLayoutEffect(() => {
      const t = inner.current;
      if (!stack || !t) return;
      labelCells(t);
      // attribute changes are not watched, so labelling never triggers itself
      const mo = new MutationObserver(() => labelCells(t));
      mo.observe(t, { childList: true, subtree: true, characterData: true });
      return () => mo.disconnect();
    }, [stack]);
    return (
      <div className={cn("relative w-full overflow-auto", stack && "table-stack")}>
        <table ref={setRef} className={cn("w-full caption-bottom text-sm", className)} {...props} />
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
