import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PRINT_OPTIONS, PRICE_PER_PAGE } from "../constants";
import { createPrintJob } from "../services/printVendingService";
import { getPdfPageCount } from "../pdf";
import { createImagePdf } from "../imagePdf";
import {
  formatCurrency,
  formatPrintType,
  formatQueueId,
  getPaymentTone,
  getSelectedPageCount,
} from "../utils";
import { Badge } from "./Badge";
import { NumberField } from "./NumberField";
import { SegmentedControl } from "./SegmentedControl";

const PRINT_TYPE_OPTIONS = [
  { value: "bw", label: "B/W" },
  { value: "color", label: "Color" },
];

const PAPER_SIZE_OPTIONS = [
  { value: "A4", label: "A4" },
  { value: "A3", label: "A3" },
  { value: "Letter", label: "Letter" },
];

const ORIENTATION_OPTIONS = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

const DESTINATION_OPTIONS = ["Canon MG2500 series Printer"];
const PAGES_PER_SHEET_OPTIONS = [1, 2, 4, 6, 9, 16];

const ACCEPTED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPTED_FILE_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const MAX_IMAGE_FILES = 50;

const isAcceptedFile = (selectedFile) => {
  const fileName = selectedFile.name.toLowerCase();

  return (
    ACCEPTED_FILE_TYPES.includes(selectedFile.type) ||
    ACCEPTED_FILE_EXTENSIONS.some((extension) => fileName.endsWith(extension))
  );
};

const isPdfFile = (selectedFile) =>
  selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf");

const isImageFile = (selectedFile) => !isPdfFile(selectedFile) && isAcceptedFile(selectedFile);

const filePreviewUrls = new Map();

const getFilePreviewUrl = (file) => {
  if (!filePreviewUrls.has(file)) {
    filePreviewUrls.set(file, URL.createObjectURL(file));
  }
  return filePreviewUrls.get(file);
};

const revokeFilePreviewUrl = (file) => {
  const url = filePreviewUrls.get(file);
  if (!url) return;
  URL.revokeObjectURL(url);
  filePreviewUrls.delete(file);
};

function SelectedFileItem({ file, index, onPreview, onRemove }) {
  const thumbnailUrl = isImageFile(file) ? getFilePreviewUrl(file) : "";

  return (
    <li>
      <div className="selected-file-summary">
        {thumbnailUrl ? (
          <img alt="" className="selected-file-thumbnail" src={thumbnailUrl} />
        ) : (
          <span className="selected-file-thumbnail pdf-thumbnail">PDF</span>
        )}
        <span className="selected-file-name" title={file.name}>{file.name}</span>
      </div>
      <div className="selected-file-actions">
        <button className="preview-file-button" onClick={() => onPreview(file)} type="button">
          Preview
        </button>
        <button
          aria-label={`Remove ${file.name}`}
          className="remove-file-button"
          onClick={() => onRemove(index)}
          type="button"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

const GRID_COLUMNS = {
  1: 1,
  2: 2,
  4: 2,
  6: 3,
  9: 3,
  16: 4,
};

const PAPER_RATIOS = {
  A3: [297, 420],
  A4: [210, 297],
  Letter: [216, 279],
};

function PrintLayoutPreview({ files, orientation, pagesPerSheet, paperSize, scale }) {
  const imageUrls = files.map((file) => ({ file, url: getFilePreviewUrl(file) }));
  const capacity = Number(pagesPerSheet) || 1;
  const sheets = Array.from(
    { length: Math.ceil(imageUrls.length / capacity) },
    (_, index) => imageUrls.slice(index * capacity, (index + 1) * capacity),
  );
  const [paperWidth, paperHeight] = PAPER_RATIOS[paperSize] || PAPER_RATIOS.A4;
  const ratio = orientation === "landscape"
    ? `${paperHeight} / ${paperWidth}`
    : `${paperWidth} / ${paperHeight}`;

  return (
    <div className="layout-preview-sheets">
      {sheets.map((sheet, sheetIndex) => (
        <section className="layout-preview-sheet-wrap" key={`sheet-${sheetIndex}`}>
          <span>Sheet {sheetIndex + 1} of {sheets.length}</span>
          <div
            className={`layout-preview-sheet scale-${scale}`}
            style={{
              aspectRatio: ratio,
              gridTemplateColumns: `repeat(${GRID_COLUMNS[capacity] || 1}, minmax(0, 1fr))`,
            }}
          >
            {sheet.map(({ file, url }, imageIndex) => (
              <figure key={`${file.name}-${file.lastModified}-${imageIndex}`}>
                <img src={url} alt={file.name} />
                <figcaption>{file.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function UserPanel({ latestJob, onJobCreated, onOpenPayment, showStatusMessage }) {
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);
  const [copies, setCopies] = useState(DEFAULT_PRINT_OPTIONS.copies);
  const [pages, setPages] = useState(DEFAULT_PRINT_OPTIONS.pages);
  const [printType, setPrintType] = useState(DEFAULT_PRINT_OPTIONS.printType);
  const [paperSize, setPaperSize] = useState(DEFAULT_PRINT_OPTIONS.paperSize);
  const [orientation, setOrientation] = useState(DEFAULT_PRINT_OPTIONS.orientation);
  const [destination, setDestination] = useState(DEFAULT_PRINT_OPTIONS.destination);
  const [pageSelection, setPageSelection] = useState(DEFAULT_PRINT_OPTIONS.pageSelection);
  const [pageRange, setPageRange] = useState(DEFAULT_PRINT_OPTIONS.pageRange);
  const [pagesPerSheet, setPagesPerSheet] = useState(DEFAULT_PRINT_OPTIONS.pagesPerSheet);
  const [scale, setScale] = useState(DEFAULT_PRINT_OPTIONS.scale);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [analyzingFile, setAnalyzingFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [layoutPreviewOpen, setLayoutPreviewOpen] = useState(false);
  const previewUrl = previewFile ? getFilePreviewUrl(previewFile) : "";

  useEffect(() => {
    if (!previewFile && !layoutPreviewOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPreviewFile(null);
        setLayoutPreviewOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [layoutPreviewOpen, previewFile]);

  const selectedPages = useMemo(
    () => getSelectedPageCount(pageSelection, pageRange, pages),
    [pageRange, pageSelection, pages],
  );
  const sheets = useMemo(
    () => Math.ceil((selectedPages * Number(copies || 0)) / Number(pagesPerSheet || 1)),
    [copies, pagesPerSheet, selectedPages],
  );
  const amount = useMemo(() => {
    const rate = PRICE_PER_PAGE[printType];
    return sheets * rate;
  }, [printType, sheets]);

  const resetForm = () => {
    files.forEach(revokeFilePreviewUrl);
    setFiles([]);
    setPreviewFile(null);
    setLayoutPreviewOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setCopies(DEFAULT_PRINT_OPTIONS.copies);
    setPages(DEFAULT_PRINT_OPTIONS.pages);
    setPrintType(DEFAULT_PRINT_OPTIONS.printType);
    setPaperSize(DEFAULT_PRINT_OPTIONS.paperSize);
    setOrientation(DEFAULT_PRINT_OPTIONS.orientation);
    setDestination(DEFAULT_PRINT_OPTIONS.destination);
    setPageSelection(DEFAULT_PRINT_OPTIONS.pageSelection);
    setPageRange(DEFAULT_PRINT_OPTIONS.pageRange);
    setPagesPerSheet(DEFAULT_PRINT_OPTIONS.pagesPerSheet);
    setScale(DEFAULT_PRINT_OPTIONS.scale);
  };

  const selectFiles = async (selectedFiles) => {
    const nextFiles = Array.from(selectedFiles || []);
    if (!nextFiles.length) return;

    if (nextFiles.some((selectedFile) => !isAcceptedFile(selectedFile))) {
      showStatusMessage("Please upload a PDF, JPG, JPEG, or PNG file.", "danger");
      return;
    }

    const pdfFiles = nextFiles.filter(isPdfFile);
    if (pdfFiles.length && nextFiles.length > 1) {
      showStatusMessage("Upload one PDF, or select multiple JPG/PNG images without mixing file types.", "danger");
      return;
    }

    if (!pdfFiles.length && nextFiles.length > MAX_IMAGE_FILES) {
      showStatusMessage(`You can upload up to ${MAX_IMAGE_FILES} images in one print job.`, "danger");
      return;
    }

    try {
      setAnalyzingFile(true);
      const detectedPages = pdfFiles.length ? await getPdfPageCount(pdfFiles[0]) : nextFiles.length;

      files.forEach(revokeFilePreviewUrl);
      setFiles(nextFiles);
      setPages(detectedPages);
      setPageRange("");
      setPageSelection("all");
      showStatusMessage(
        pdfFiles.length
          ? `${pdfFiles[0].name} selected — ${detectedPages} ${detectedPages === 1 ? "page" : "pages"} detected.`
          : `${nextFiles.length} ${nextFiles.length === 1 ? "image" : "images"} selected — choose how many images to place on each sheet.`,
        "info",
      );
    } catch (error) {
      console.error(error);
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      showStatusMessage("This file could not be analyzed. Try another PDF or image.", "danger");
    } finally {
      setAnalyzingFile(false);
    }
  };

  const removeFile = (indexToRemove) => {
    if (files[indexToRemove] === previewFile) setPreviewFile(null);
    revokeFilePreviewUrl(files[indexToRemove]);
    const nextFiles = files.filter((_, index) => index !== indexToRemove);
    setFiles(nextFiles);
    setPages(nextFiles.length || DEFAULT_PRINT_OPTIONS.pages);
    setPageRange("");
    setPageSelection("all");
    if (!nextFiles.length && fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragEnter = (event) => {
    event.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFile(true);
  };

  const handleDragLeave = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setIsDraggingFile(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDraggingFile(false);
    selectFiles(event.dataTransfer.files);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!files.length) {
      showStatusMessage("Please upload a PDF or image file.", "danger");
      return;
    }

    if (Number(copies) <= 0 || Number(pages) <= 0) {
      showStatusMessage("Pages and copies must be greater than zero.", "danger");
      return;
    }

    if (pageSelection === "custom" && selectedPages === 0) {
      showStatusMessage("Enter a valid page range, for example 1-3, 5.", "danger");
      return;
    }

    try {
      setUploading(true);

      const uploadFile = files.every(isImageFile)
        ? await createImagePdf(files, { paperSize, orientation, scale })
        : files[0];
      const createdJob = await createPrintJob({
        file: uploadFile,
        sourceFileNames: files.map((selectedFile) => selectedFile.name),
        copies,
        pages,
        printType,
        paperSize,
        orientation,
        destination,
        pageSelection,
        pageRange,
        pagesPerSheet,
        scale,
        selectedPages,
        sheets,
        amount,
      });

      onJobCreated(createdJob);
      resetForm();
      showStatusMessage(
        `Queue ID ${formatQueueId(createdJob.queueNumber)} created. Complete payment to release the job.`,
        "success",
      );
    } catch (error) {
      console.error(error);
      showStatusMessage("Upload failed. Please check Firebase configuration and rules.", "danger");
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="workspace user-workspace">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Customer station</p>
          <h1>Print job setup</h1>
        </div>
        <div className="price-strip" aria-label="Current print rates">
          <span>B/W {formatCurrency(PRICE_PER_PAGE.bw)} / page</span>
          <span>Color {formatCurrency(PRICE_PER_PAGE.color)} / page</span>
        </div>
      </section>

      <section className="user-layout">
        <form className="panel job-form" onSubmit={handleSubmit}>
          <label
            className={`file-drop ${isDraggingFile ? "dragging" : ""}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <span className="file-icon">PDF</span>
            <span>
              <strong>
                {isDraggingFile
                  ? "Drop files here"
                  : files.length
                    ? `${files.length} ${files.length === 1 ? "file" : "files"} selected`
                    : "Select multiple images"}
              </strong>
              <small>Choose up to {MAX_IMAGE_FILES} JPG/PNG images, or one PDF</small>
            </span>
            <input
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              onChange={(event) => selectFiles(event.target.files)}
              ref={fileInputRef}
              type="file"
            />
          </label>

          {files.length > 0 && (
            <div className="selected-files" aria-label="Selected files">
              <div className="selected-files-heading">
                <strong>{files.length === 1 ? "Selected file" : "Selected images"}</strong>
                {files.every(isImageFile) && (
                  <div className="selected-files-heading-actions">
                    {files.length > 1 && <span>One image page each</span>}
                    <button onClick={() => setLayoutPreviewOpen(true)} type="button">
                      Preview print layout
                    </button>
                  </div>
                )}
              </div>
              <ol>
                {files.map((selectedFile, index) => (
                  <SelectedFileItem
                    file={selectedFile}
                    index={index}
                    key={`${selectedFile.name}-${selectedFile.lastModified}-${index}`}
                    onPreview={setPreviewFile}
                    onRemove={removeFile}
                  />
                ))}
              </ol>
            </div>
          )}

          <div className="form-grid">
            <NumberField
              hint={analyzingFile ? "Analyzing files…" : "Each selected image counts as one page."}
              label="Image/document pages"
              onChange={setPages}
              readOnly
              value={pages}
            />
            <NumberField label="Copies" onChange={setCopies} value={copies} />
          </div>

          <div className="print-options-grid">
            <label className="field">
              <span className="field-label">Destination</span>
              <select value={destination} onChange={(event) => setDestination(event.target.value)}>
                {DESTINATION_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Pages</span>
              <select value={pageSelection} onChange={(event) => setPageSelection(event.target.value)}>
                <option value="all">All</option>
                <option value="custom">Custom range</option>
              </select>
            </label>

            {pageSelection === "custom" && (
              <label className="field print-option-wide">
                <span className="field-label">Page range</span>
                <input
                  aria-describedby="page-range-hint"
                  onChange={(event) => setPageRange(event.target.value)}
                  placeholder="e.g. 1-3, 5"
                  value={pageRange}
                />
                <small className="field-hint" id="page-range-hint">Use commas for separate pages or ranges.</small>
              </label>
            )}

            <label className="field">
              <span className="field-label">Images/pages per sheet</span>
              <select value={pagesPerSheet} onChange={(event) => setPagesPerSheet(Number(event.target.value))}>
                {PAGES_PER_SHEET_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Scale</span>
              <select value={scale} onChange={(event) => setScale(event.target.value)}>
                <option value="default">Default</option>
                <option value="fit">Fit to printable area</option>
                <option value="actual">Actual size</option>
              </select>
            </label>
          </div>

          <SegmentedControl
            label="Print type"
            onChange={setPrintType}
            options={PRINT_TYPE_OPTIONS}
            value={printType}
          />

          <SegmentedControl
            label="Paper size"
            onChange={setPaperSize}
            options={PAPER_SIZE_OPTIONS}
            value={paperSize}
          />

          <SegmentedControl
            label="Orientation"
            onChange={setOrientation}
            options={ORIENTATION_OPTIONS}
            value={orientation}
          />

          <div className="quote-row">
            <span>{sheets} {sheets === 1 ? "sheet" : "sheets"} of paper · Estimated amount</span>
            <strong>{formatCurrency(amount)}</strong>
          </div>

          <button className="button button-primary full-width" disabled={uploading || analyzingFile} type="submit">
            {analyzingFile ? "Analyzing document..." : uploading ? "Uploading..." : "Upload and continue"}
          </button>
        </form>

        <aside className="panel payment-panel">
          <div>
            <p className="eyebrow">Latest job</p>
            {latestJob ? (
              <>
                <h2>
                  {latestJob.sourceFileCount > 1
                    ? `${latestJob.sourceFileCount} images`
                    : latestJob.sourceFileNames?.[0] || latestJob.fileName}
                </h2>
                <div className="details-list">
                  <span>Queue ID</span>
                  <strong className="queue-id">{formatQueueId(latestJob.queueNumber)}</strong>
                  <span>Pages</span>
                  <strong>{latestJob.pages} x {latestJob.copies}</strong>
                  <span>Total pages</span>
                  <strong>{latestJob.totalPages}</strong>
                  <span>Paper sheets</span>
                  <strong>{latestJob.sheets ?? latestJob.totalPages}</strong>
                  <span>Print</span>
                  <strong>{formatPrintType(latestJob.printType)}, {latestJob.paperSize}, {latestJob.orientation === "landscape" ? "Landscape" : "Portrait"}</strong>
                  <span>Layout</span>
                  <strong>{latestJob.pagesPerSheet || 1} per sheet, {latestJob.scale || "default"}</strong>
                  <span>Destination</span>
                  <strong>{latestJob.destination || "Canon MG2500 series Printer"}</strong>
                  <span>Payment</span>
                  <Badge tone={getPaymentTone(latestJob.paymentStatus)}>
                    {latestJob.paymentStatus}
                  </Badge>
                </div>
              </>
            ) : (
              <>
                <h2>Waiting for upload</h2>
                <p className="muted">Your current job details will appear here after upload.</p>
              </>
            )}
          </div>

          {latestJob && (
            <div className="payment-actions">
              <div className="amount-total">
                <span>Total</span>
                <strong>{formatCurrency(latestJob.amount)}</strong>
              </div>

              {latestJob.paymentStatus === "Payment Success" ? (
                <button className="button button-muted full-width" disabled type="button">
                  Payment completed
                </button>
              ) : (
                <button
                  className="button button-success full-width"
                  onClick={() => onOpenPayment(latestJob)}
                  type="button"
                >
                  Pay now
                </button>
              )}

              <a className="button button-secondary full-width" href={latestJob.fileURL} rel="noreferrer" target="_blank">
                Open file
              </a>
            </div>
          )}
        </aside>
      </section>

      {previewFile && (
        <div
          aria-label={`Preview of ${previewFile.name}`}
          aria-modal="true"
          className="modal-backdrop file-preview-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewFile(null);
          }}
          role="dialog"
        >
          <div className="file-preview-card">
            <header>
              <div>
                <p className="eyebrow">File preview</p>
                <h2>{previewFile.name}</h2>
              </div>
              <button
                aria-label="Close preview"
                className="preview-close-button"
                onClick={() => setPreviewFile(null)}
                type="button"
              >
                ×
              </button>
            </header>
            {isPdfFile(previewFile) ? (
              <iframe className="file-preview-frame" src={previewUrl} title={previewFile.name} />
            ) : (
              <img className="file-preview-image" src={previewUrl} alt={previewFile.name} />
            )}
          </div>
        </div>
      )}

      {layoutPreviewOpen && files.length > 0 && files.every(isImageFile) && (
        <div
          aria-label="Print layout preview"
          aria-modal="true"
          className="modal-backdrop file-preview-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLayoutPreviewOpen(false);
          }}
          role="dialog"
        >
          <div className="file-preview-card layout-preview-card">
            <header>
              <div>
                <p className="eyebrow">Print layout preview</p>
                <h2>{files.length} images · {pagesPerSheet} per sheet</h2>
                <small>{paperSize}, {orientation}, {scale} scale</small>
              </div>
              <button
                aria-label="Close layout preview"
                className="preview-close-button"
                onClick={() => setLayoutPreviewOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <PrintLayoutPreview
              files={files}
              orientation={orientation}
              pagesPerSheet={pagesPerSheet}
              paperSize={paperSize}
              scale={scale}
            />
          </div>
        </div>
      )}
    </main>
  );
}
