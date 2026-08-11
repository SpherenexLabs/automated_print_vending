import { useMemo, useRef, useState } from "react";
import { DEFAULT_PRINT_OPTIONS, PRICE_PER_PAGE } from "../constants";
import { createPrintJob } from "../services/printVendingService";
import { getPdfPageCount } from "../pdf";
import {
  formatCurrency,
  formatPrintType,
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

const DESTINATION_OPTIONS = ["Canon MG2500 series Printer"];
const PAGES_PER_SHEET_OPTIONS = [1, 2, 4, 6, 9, 16];

const ACCEPTED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPTED_FILE_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

const isAcceptedFile = (selectedFile) => {
  const fileName = selectedFile.name.toLowerCase();

  return (
    ACCEPTED_FILE_TYPES.includes(selectedFile.type) ||
    ACCEPTED_FILE_EXTENSIONS.some((extension) => fileName.endsWith(extension))
  );
};

export function UserPanel({ latestJob, onJobCreated, onOpenPayment, showStatusMessage }) {
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const [copies, setCopies] = useState(DEFAULT_PRINT_OPTIONS.copies);
  const [pages, setPages] = useState(DEFAULT_PRINT_OPTIONS.pages);
  const [printType, setPrintType] = useState(DEFAULT_PRINT_OPTIONS.printType);
  const [paperSize, setPaperSize] = useState(DEFAULT_PRINT_OPTIONS.paperSize);
  const [destination, setDestination] = useState(DEFAULT_PRINT_OPTIONS.destination);
  const [pageSelection, setPageSelection] = useState(DEFAULT_PRINT_OPTIONS.pageSelection);
  const [pageRange, setPageRange] = useState(DEFAULT_PRINT_OPTIONS.pageRange);
  const [pagesPerSheet, setPagesPerSheet] = useState(DEFAULT_PRINT_OPTIONS.pagesPerSheet);
  const [scale, setScale] = useState(DEFAULT_PRINT_OPTIONS.scale);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [analyzingFile, setAnalyzingFile] = useState(false);
  const [uploading, setUploading] = useState(false);

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
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setCopies(DEFAULT_PRINT_OPTIONS.copies);
    setPages(DEFAULT_PRINT_OPTIONS.pages);
    setPrintType(DEFAULT_PRINT_OPTIONS.printType);
    setPaperSize(DEFAULT_PRINT_OPTIONS.paperSize);
    setDestination(DEFAULT_PRINT_OPTIONS.destination);
    setPageSelection(DEFAULT_PRINT_OPTIONS.pageSelection);
    setPageRange(DEFAULT_PRINT_OPTIONS.pageRange);
    setPagesPerSheet(DEFAULT_PRINT_OPTIONS.pagesPerSheet);
    setScale(DEFAULT_PRINT_OPTIONS.scale);
  };

  const selectFile = async (selectedFile) => {
    if (!selectedFile) return;

    if (!isAcceptedFile(selectedFile)) {
      showStatusMessage("Please upload a PDF, JPG, JPEG, or PNG file.", "danger");
      return;
    }

    try {
      setAnalyzingFile(true);
      const isPdf = selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf");
      const detectedPages = isPdf ? await getPdfPageCount(selectedFile) : 1;

      setFile(selectedFile);
      setPages(detectedPages);
      setPageRange("");
      setPageSelection("all");
      showStatusMessage(
        `${selectedFile.name} selected — ${detectedPages} ${detectedPages === 1 ? "page" : "pages"} detected.`,
        "info",
      );
    } catch (error) {
      console.error(error);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      showStatusMessage("This file could not be analyzed. Try another PDF or image.", "danger");
    } finally {
      setAnalyzingFile(false);
    }
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
    selectFile(event.dataTransfer.files[0]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!file) {
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

      const createdJob = await createPrintJob({
        file,
        copies,
        pages,
        printType,
        paperSize,
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
      showStatusMessage("File uploaded. Complete payment to release the job.", "success");
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
                {isDraggingFile ? "Drop file here" : file ? file.name : "Choose or drag file"}
              </strong>
              <small>PDF, JPG, JPEG, or PNG</small>
            </span>
            <input
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(event) => selectFile(event.target.files[0] || null)}
              ref={fileInputRef}
              type="file"
            />
          </label>

          <div className="form-grid">
            <NumberField
              hint={analyzingFile ? "Analyzing file…" : "Detected automatically from the uploaded file."}
              label="Document pages"
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
              <span className="field-label">Pages per sheet</span>
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
                <h2>{latestJob.fileName}</h2>
                <div className="details-list">
                  <span>Job ID</span>
                  <strong>{latestJob.id}</strong>
                  <span>Pages</span>
                  <strong>{latestJob.pages} x {latestJob.copies}</strong>
                  <span>Total pages</span>
                  <strong>{latestJob.totalPages}</strong>
                  <span>Paper sheets</span>
                  <strong>{latestJob.sheets ?? latestJob.totalPages}</strong>
                  <span>Print</span>
                  <strong>{formatPrintType(latestJob.printType)}, {latestJob.paperSize}</strong>
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
    </main>
  );
}
