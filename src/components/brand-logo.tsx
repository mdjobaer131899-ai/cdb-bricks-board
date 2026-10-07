import logoAsset from "@/assets/cdb-logo.png.asset.json";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface Props {
  className?: string;
  alt?: string;
}

/**
 * CDB brand logo with graceful fallback.
 * The Lovable-hosted asset URL may not be available locally or after
 * certain deployments — when that happens we show a branded SVG instead.
 */
export function BrandLogo({ className, alt = "CDB Bricks Logo" }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <svg
        viewBox="0 0 48 48"
        className={cn("object-contain", className)}
        aria-label={alt}
      >
        <rect width="48" height="48" rx="10" fill="url(#cdb-grad)" />
        <text
          x="50%"
          y="54%"
          dominantBaseline="central"
          textAnchor="middle"
          fontSize="16"
          fontWeight="800"
          fill="white"
          fontFamily="system-ui, sans-serif"
        >
          CDB
        </text>
        <defs>
          <linearGradient id="cdb-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#e85d3a" />
            <stop offset="1" stopColor="#c2410c" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  return (
    <img
      src={logoAsset.url}
      alt={alt}
      className={cn("object-contain", className)}
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
