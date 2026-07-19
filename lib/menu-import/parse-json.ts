const RAW_LOG_PREVIEW_CHARS = 1000;

/** Markdown code fence ve ön/son açıklamayı kaldırır. */
export function stripModelJsonWrappers(raw: string): string {
  let s = raw.trim();
  if (!s) return s;

  const fenceInner = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  const fencedBlocks = [...s.matchAll(fenceInner)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);

  if (fencedBlocks.length > 0) {
    return fencedBlocks.sort((a, b) => b.length - a.length)[0];
  }

  s = s.replace(/^```(?:json)?\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  s = s.replace(/```(?:json)?/gi, "");
  s = s.replace(/```/g, "");
  return s.trim();
}

/** İlk `{` ile eşleşen `}` arasındaki JSON nesnesini çıkarır. */
export function extractJsonObjectSubstring(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error("JSON nesnesi başlangıcı ({) bulunamadı.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new Error("JSON nesnesi kapanmadı (muhtemelen kesik yanıt).");
}

/** Model çıktısını parse öncesi güvenli biçime getirir. */
export function sanitizeModelJsonContent(raw: string): string {
  const stripped = stripModelJsonWrappers(raw);
  if (!stripped) {
    throw new Error("Model yanıtı boş.");
  }

  if (stripped.startsWith("{")) {
    try {
      return extractJsonObjectSubstring(stripped);
    } catch {
      return stripped;
    }
  }

  return extractJsonObjectSubstring(stripped);
}

export function previewRawModelContent(raw: string, maxChars = RAW_LOG_PREVIEW_CHARS): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}… [truncated, total=${raw.length}]`;
}

/** Model bazen markdown / açıklama ile döner; güvenli temizleme sonrası parse eder. */
export function parseJsonFromModelContent(raw: string): unknown {
  const sanitized = sanitizeModelJsonContent(raw);
  return JSON.parse(sanitized) as unknown;
}
