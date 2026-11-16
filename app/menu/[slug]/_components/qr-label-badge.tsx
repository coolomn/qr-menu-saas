"use client";

import { formatLabel } from "@/lib/qr/label";
import { useQrLabel } from "@/lib/qr/use-qr-label";

type Props = {
  language: string;
  className?: string;
  style?: React.CSSProperties;
};

/** "Masa 5" / "Oda 101": QR kartından gelen bilgi. Etiket yoksa hiçbir şey çizmez. */
export function QrLabelBadge({ language, className, style }: Props) {
  const label = useQrLabel();
  if (!label) return null;
  return (
    <span
      data-testid="qr-label-badge"
      className={
        className ??
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide"
      }
      style={style}
    >
      {formatLabel(label, language)}
    </span>
  );
}
