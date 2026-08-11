import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function getPdfPageCount(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = getDocument({ data });
  const pdfDocument = await loadingTask.promise;

  try {
    return pdfDocument.numPages;
  } finally {
    if (typeof pdfDocument.cleanup === "function") {
      await pdfDocument.cleanup();
    }
    if (typeof loadingTask.destroy === "function") {
      await loadingTask.destroy();
    }
  }
}
