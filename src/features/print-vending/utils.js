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
