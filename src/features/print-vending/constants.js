export const JOBS_PATH = "Print_Vending/jobs";
export const TOTAL_PRINTED_PAGES_PATH = "Print_Vending/totalPrintedPages";
export const FILES_PATH = "print-vending-files";

export const PRICE_PER_PAGE = {
  bw: 2,
  color: 5,
};

export const DEFAULT_PRINT_OPTIONS = {
  copies: 1,
  pages: 1,
  printType: "bw",
  paperSize: "A4",
  destination: "Canon MG2500 series Printer",
  pageSelection: "all",
  pageRange: "",
  pagesPerSheet: 1,
  scale: "default",
};

export const PAGE_TABS = {
  user: "user",
  admin: "admin",
};

export const PAYMENT_STATUS = {
  pending: "Payment Pending",
  success: "Payment Success",
  failed: "Payment Failed",
};

export const PRINT_STATUS = {
  waiting: "Waiting for Payment",
  ready: "Ready to Print",
  printing: "Printing",
  printed: "Printed",
  failed: "Print Failed",
};
