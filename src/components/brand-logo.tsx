import React, { useState } from "react";

interface BrandLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
}

export function BrandLogo({ className = "", size = "md", showText = false }: BrandLogoProps) {
  const [imgError, setImgError] = useState(false);

  const sizeMap = {
    sm: "h-10 w-10",
    md: "h-12 w-12",
    lg: "h-16 w-16",
    xl: "h-20 w-20",
  };

  const dimension = sizeMap[size] || sizeMap.md;

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {!imgError ? (
        <img
          src="/cdb-logo.png"
          alt="CDB Bricks"
          onError={() => setImgError(true)}
          className={`${dimension} object-contain bg-transparent drop-shadow-md`}
        />
      ) : (
        /* কোনো ব্যাকগ্রাউন্ড বা বর্ডার ছাড়া ১০০% ট্রান্সপারেন্ট লোগো */
        <div
          className={`${dimension} relative flex items-center justify-center bg-transparent overflow-visible flex-shrink-0 drop-shadow-md`}
          title="CDB Bricks"
        >
          <svg viewBox="0 0 200 200" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="fireGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#dc2626" />
                <stop offset="55%" stopColor="#ea580c" />
                <stop offset="100%" stopColor="#facc15" />
              </linearGradient>
              <path id="textArc" d="M 28,144 A 74,74 0 0,0 172,144" fill="none" />
            </defs>

            {/* বাম পাশের আগুনের ডানা */}
            <path
              d="M96 90 C72 80, 46 62, 42 28 C54 40, 68 46, 58 20 C72 36, 84 48, 80 28 C89 45, 95 64, 98 86 Z"
              fill="url(#fireGrad)"
            />
            {/* ডান পাশের আগুনের ডানা */}
            <path
              d="M104 90 C128 80, 154 62, 158 28 C146 40, 132 46, 142 20 C128 36, 116 48, 120 28 C111 45, 105 64, 102 86 Z"
              fill="url(#fireGrad)"
            />
            {/* মাঝখানের মূল আগুনের শিখা */}
            <path
              d="M100 16 C114 34, 120 50, 109 68 C104 75, 96 75, 91 68 C80 50, 86 34, 100 16 Z"
              fill="#ea580c"
            />
            <path
              d="M100 32 C107 43, 109 53, 103 63 C100 67, 97 63, 94 56 C92 48, 95 39, 100 32 Z"
              fill="#facc15"
            />

            {/* গোলাকার ইটের গাঁথুনি (কোনো কালো বর্ডার ছাড়া, ট্রান্সপারেন্ট গ্যাপসহ) */}
            <g fill="#ea580c">
              <rect x="64" y="88" width="22" height="10" rx="1.5" />
              <rect x="89" y="88" width="22" height="10" rx="1.5" />
              <rect x="114" y="88" width="22" height="10" rx="1.5" />

              <rect x="54" y="101" width="18" height="10" rx="1.5" />
              <rect x="128" y="101" width="18" height="10" rx="1.5" />

              <rect x="56" y="114" width="16" height="10" rx="1.5" />
              <rect x="128" y="114" width="16" height="10" rx="1.5" />

              <rect x="64" y="127" width="21" height="10" rx="1.5" />
              <rect x="88" y="127" width="24" height="10" rx="1.5" />
              <rect x="115" y="127" width="21" height="10" rx="1.5" />

              <rect x="76" y="140" width="22" height="9" rx="1.5" />
              <rect x="101" y="140" width="23" height="9" rx="1.5" />
            </g>

            {/* মাঝখানের বড় "CDB" লেখা */}
            <text
              x="100"
              y="122"
              textAnchor="middle"
              fill="#ea580c"
              fontSize="29"
              fontWeight="900"
              fontFamily="sans-serif"
              letterSpacing="1"
            >
              CDB
            </text>

            {/* নিচের বাঁকানো "CDB BRICKS" লেখা */}
            <text
              fill="#ea580c"
              fontSize="16"
              fontWeight="900"
              fontFamily="sans-serif"
              letterSpacing="2.5"
            >
              <textPath href="#textArc" startOffset="50%" textAnchor="middle">
                CDB BRICKS
              </textPath>
            </text>
          </svg>
        </div>
      )}

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