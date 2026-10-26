import { PDFDocument } from "pdf-lib";

const PAPER_DIMENSIONS = {
  A3: [841.89, 1190.55],
  A4: [595.28, 841.89],
  Letter: [612, 792],
};

const getPageDimensions = (paperSize, orientation) => {
  const [width, height] = PAPER_DIMENSIONS[paperSize] || PAPER_DIMENSIONS.A4;
  return orientation === "landscape" ? [height, width] : [width, height];
};

const getImagePlacement = (image, pageWidth, pageHeight, scale) => {
  const margin = scale === "default" ? 36 : 0;
  const availableWidth = pageWidth - (margin * 2);
  const availableHeight = pageHeight - (margin * 2);
  const fitRatio = Math.min(availableWidth / image.width, availableHeight / image.height);
  const ratio = scale === "actual" ? 1 : fitRatio;
  const width = image.width * ratio;
  const height = image.height * ratio;

  return {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
};

export async function createImagePdf(files, { paperSize, orientation, scale }) {
  const document = await PDFDocument.create();
  const [pageWidth, pageHeight] = getPageDimensions(paperSize, orientation);

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    const image = isPng ? await document.embedPng(bytes) : await document.embedJpg(bytes);
    const page = document.addPage([pageWidth, pageHeight]);
    page.drawImage(image, getImagePlacement(image, pageWidth, pageHeight, scale));
  }

  const pdfBytes = await document.save();
  const fileName = files.length === 1
    ? `${files[0].name.replace(/\.[^.]+$/, "")}.pdf`
    : `${files.length}-images.pdf`;

  return new File([pdfBytes], fileName, { type: "application/pdf" });
}
