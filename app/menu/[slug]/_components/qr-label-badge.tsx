"use client";

import { formatLabel } from "@/lib/qr/label";
import { useQrLabel } from "@/lib/qr/use-qr-label";

type Props = {
  language: string;
  className?: string;
  style?: React.CSSProperties;
  /** true: rozeti ortalanmış bir satır içinde çizer; etiket yoksa DOM'a hiçbir şey eklenmez. */
  centered?: boolean;
};

/** "Masa 5" / "Oda 101": QR kartından gelen bilgi. Etiket yoksa hiçbir şey çizmez. */
export function QrLabelBadge({ language, className, style, centered }: Props) {
  const label = useQrLabel();
  if (!label) return null;
  const badge = (
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
  return centered ? <div className="mb-3 flex justify-center">{badge}</div> : badge;
}
