import { join } from "path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

const PDF_RENDER_SCALE = 2;
const PDF_MAX_RENDER_SIDE = 2400;

let workerConfigured = false;

function ensurePdfWorker(): void {
  if (workerConfigured) return;
  GlobalWorkerOptions.workerSrc = join(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
  );
  workerConfigured = true;
}

export async function loadPdfDocument(buffer: Buffer): Promise<PDFDocumentProxy> {
  ensurePdfWorker();
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  });
  return task.promise;
}

/** PDF ilk sayfasını PNG buffer olarak rasterize eder (vision öncesi). */
export async function renderFirstPdfPageToPngBuffer(buffer: Buffer): Promise<Buffer> {
  const doc = await loadPdfDocument(buffer);
  const page = await doc.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const longest = Math.max(baseViewport.width, baseViewport.height);
  const scale =
    longest > PDF_MAX_RENDER_SIDE
      ? (PDF_MAX_RENDER_SIDE / longest) * PDF_RENDER_SCALE
      : PDF_RENDER_SCALE;
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const canvasContext = canvas.getContext("2d");

  await page.render({
    canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
    viewport,
    canvas: canvas as unknown as HTMLCanvasElement,
  }).promise;

  return canvas.toBuffer("image/png");
}
