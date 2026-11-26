import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const MAX_RESUME_CHARS = 30_000;

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfTextProgress {
  stage: "loading" | "extracting";
  pagesCompleted: number;
  totalPages?: number;
}

export async function extractPdfText(
  file: File,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: PdfTextProgress) => void;
  } = {},
): Promise<string> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("PDF must be 10 MB or smaller.");
  }
  if (options.signal?.aborted) {
    throw new DOMException("PDF processing was cancelled.", "AbortError");
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const pages: string[] = [];
  let destroyPromise: Promise<void> | null = null;
  const destroyOnAbort = () => {
    destroyPromise ??= loadingTask.destroy();
  };
  options.signal?.addEventListener("abort", destroyOnAbort, { once: true });

  try {
    if (options.signal?.aborted) {
      throw new DOMException("PDF processing was cancelled.", "AbortError");
    }
    options.onProgress?.({ stage: "loading", pagesCompleted: 0 });
    const document = await loadingTask.promise;
    if (options.signal?.aborted) {
      throw new DOMException("PDF processing was cancelled.", "AbortError");
    }
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error("PDF must have 100 pages or fewer.");
    }
    options.onProgress?.({
      stage: "extracting",
      pagesCompleted: 0,
      totalPages: document.numPages,
    });

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (options.signal?.aborted) {
        throw new DOMException("PDF processing was cancelled.", "AbortError");
      }
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      if (options.signal?.aborted) {
        throw new DOMException("PDF processing was cancelled.", "AbortError");
      }
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .filter(Boolean)
          .join(" "),
      );
      options.onProgress?.({
        stage: "extracting",
        pagesCompleted: pageNumber,
        totalPages: document.numPages,
      });
    }
  } finally {
    options.signal?.removeEventListener("abort", destroyOnAbort);
    await (destroyPromise ?? loadingTask.destroy());
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
