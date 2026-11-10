import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const MAX_RESUME_CHARS = 30_000;

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function extractPdfText(file: File): Promise<string> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("PDF must be 10 MB or smaller.");
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const pages: string[] = [];

  try {
    const document = await loadingTask.promise;
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error("PDF must have 100 pages or fewer.");
    }
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .filter(Boolean)
          .join(" "),
      );
    }
  } finally {
    await loadingTask.destroy();
  }

  const text = pages.join("\n").replace(/\s+/g, " ").trim();
  if (!text) {
    throw new Error(
      "This PDF has no selectable text. Scanned/image-only PDFs are not supported yet.",
    );
  }
  if (text.length > MAX_RESUME_CHARS) {
    throw new Error(
      "Extracted resume text is over 30,000 characters. Please use a shorter resume.",
    );
  }
  return text;
}
