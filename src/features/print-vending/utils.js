import { PAYMENT_STATUS } from "./constants";

export const createTransactionId = (prefix) => `${prefix}_${Date.now()}`;

export const getCurrentTimestamp = () => new Date().toLocaleString();

export const getCurrentTimeMs = () => Date.now();

export const formatCurrency = (amount) => `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;

export const formatPrintType = (printType) =>
  printType === "color" ? "Color" : "Black and white";

export const formatShortPrintType = (printType) =>
  printType === "color" ? "Color" : "B/W";

export const sanitizeFileName = (fileName) =>
  fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

export const getSelectedPageCount = (pageSelection, pageRange, totalPages) => {
  const pageCount = Math.max(1, Number(totalPages) || 1);
  if (pageSelection !== "custom") return pageCount;

  const selectedPages = new Set();
  String(pageRange)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) return;
      const start = Number(match[1]);
      const end = Number(match[2] || match[1]);
      if (start < 1 || end < start || start > pageCount) return;
      for (let page = start; page <= Math.min(end, pageCount); page += 1) {
        selectedPages.add(page);
      }
    });

  return selectedPages.size;
};

export const getPaymentTone = (status) => {
  if (status === PAYMENT_STATUS.success) return "success";
  if (status === PAYMENT_STATUS.failed) return "danger";
  return "warning";
};

export const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
