/**
 * Faz 2.6: QR'ın gösterdiği adres. Basılı kodların içeriği olduğu için tek yerde ve testli tutulur.
 * Biçim: {menü adresi}[?masa=5 | ?oda=101] — eski basılı QR'larla birebir uyumlu.
 */
import { findHostSet, PRODUCTION_HOST_SET, publicMenuUrl } from "@/lib/domains/hosts";
import { withLabelParam, type QrLabelKind } from "./label";

/** Yalnızca canlı panel alan adı (app.tapmenu.com.tr / tapmenu.com.tr). Test takma adları ve preview canlı DEĞİLDİR. */
export function isProductionHost(host: string | null | undefined): boolean {
  return findHostSet(host) === PRODUCTION_HOST_SET;
}

export function buildQrTargetUrl(params: {
  slug: string;
  host: string | null | undefined;
  origin?: string | null;
  label?: { kind: QrLabelKind; value: string } | null;
}): string {
  const base = publicMenuUrl(params.slug, params.host, params.origin);
  return params.label ? withLabelParam(base, params.label.kind, params.label.value) : base;
}
