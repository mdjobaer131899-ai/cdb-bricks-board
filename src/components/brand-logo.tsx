interface BrandLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
}

export function BrandLogo({ className = "", size = "md", showText = false }: BrandLogoProps) {
  const sizeMap = {
    sm: "h-10 w-10",
    md: "h-12 w-12",
    lg: "h-16 w-16",
    xl: "h-20 w-20",
  };

  const dimension = sizeMap[size] || sizeMap.md;

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <img
        src="/cdb-logo.svg"
        alt="CDB Bricks"
        className={`${dimension} object-contain bg-transparent drop-shadow-md`}
      />

      {showText && (
        <div className="flex flex-col">
          <span className="font-extrabold tracking-tight text-slate-900 dark:text-white text-base leading-none">
            সি ডি বি ব্রিকস
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-orange-700 dark:text-orange-400 mt-0.5">
            Industrial ERP
          </span>
        </div>
      )}
    </div>
  );
}

export default BrandLogo;
