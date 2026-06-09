import logoAsset from "@/assets/cdb-logo.png.asset.json";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  alt?: string;
}

export function BrandLogo({ className, alt = "CDB Bricks Logo" }: Props) {
  return (
    <img
      src={logoAsset.url}
      alt={alt}
      className={cn("object-contain", className)}
      loading="eager"
      decoding="async"
    />
  );
}
