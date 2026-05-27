import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

const MAX_PDF_CHARS = 14_000;

type PdfParser = {
  getText(): Promise<{ text?: string }>;
  destroy(): Promise<void>;
};

function createPdfParser(buffer: Buffer): PdfParser {
  const { PDFParse } = nodeRequire("pdf-parse") as {
    PDFParse: new (options: { data: Buffer }) => PdfParser;
  };
  return new PDFParse({ data: buffer });
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = createPdfParser(buffer);
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
