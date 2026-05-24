export function isPdfMime(mime: string) {
  return mime === "application/pdf" || mime === "application/x-pdf";
}

export function isImageMime(mime: string) {
  return (
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/gif"
  );
}
