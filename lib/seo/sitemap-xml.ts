/** sitemap.xml gövdesi (https://www.sitemaps.org/protocol.html). URL'ler XML'e uygun kaçırılır. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderSitemapXml(urls: readonly string[]): string {
  const body = urls.map((url) => `<url>\n<loc>${escapeXml(url)}</loc>\n</url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}${body ? "\n" : ""}</urlset>\n`;
}
