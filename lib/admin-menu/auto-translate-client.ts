"use client";

import type { SourceLanguage, TargetLanguage } from "@/lib/admin-menu/auto-translate";
import type { MenuCategoryFallbackRequest } from "@/lib/admin-menu/menu-category-translations";

export async function translateText(
  text: string,
  sourceLanguage: SourceLanguage,
  targetLanguage: TargetLanguage
): Promise<string | null> {
  const q = text.trim();
  if (!q || sourceLanguage === targetLanguage) return null;
  const res = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${sourceLanguage}|${targetLanguage}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
  };
  const translated = data.responseData?.translatedText?.trim();
  return translated || null;
}

function lastMeaningfulLine(value: string): string {
  const lines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] || value.trim();
}

export async function translateMenuCategoryFallback(
  request: MenuCategoryFallbackRequest
): Promise<string | null> {
  const wrapped = `${request.context}\n\n${request.text}`;
  const raw = await translateText(wrapped, request.sourceLanguage, request.targetLanguage);
  if (!raw) return null;
  return lastMeaningfulLine(raw);
}
