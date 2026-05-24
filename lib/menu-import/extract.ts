import { PDFParse } from "pdf-parse";

const MAX_PDF_CHARS = 14_000;

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = (result.text || "").replace(/\u0000/g, "").trim();
    if (!text) return "";
    if (text.length <= MAX_PDF_CHARS) return text;
    return `${text.slice(0, MAX_PDF_CHARS)}\n\n[… metin kısaltıldı]`;
  } finally {
    await parser.destroy();
  }
}
