const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAr4IYnykpwovqOJWzfBd7abVdAma_Ig3Q",
  authDomain: "diet-planner-3bdf3.firebaseapp.com",
  databaseURL: "https://diet-planner-3bdf3-default-rtdb.firebaseio.com",
  projectId: "diet-planner-3bdf3",
  storageBucket: "diet-planner-3bdf3.firebasestorage.app",
  messagingSenderId: "927878354911",
  appId: "1:927878354911:web:2e616b171a267b9910566a",
};

const JOBS_PATH = "Print_Vending/jobs";
const TOTAL_PRINTED_PAGES_PATH = "Print_Vending/totalPrintedPages";
const PAYMENT_SUCCESS = "Payment Success";
const READY_TO_PRINT = "Ready to Print";
const PRINTING = "Printing";
const PRINTED = "Printed";
const PRINT_FAILED = "Print Failed";
const DEFAULT_PRINTER = process.env.PRINT_VENDING_PRINTER || "Canon MG2500 series Printer";

let databaseApi;
let database;
let printWindow;
let queue = Promise.resolve();
const queuedJobs = new Set();

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function getSelectedPageIndexes(job, pageCount) {
  if (job.pageSelection !== "custom" || !job.pageRange) {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const indexes = new Set();
  String(job.pageRange)
    .split(",")
    .map((part) => part.trim())
    .forEach((part) => {
      const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) return;
      const from = Number(match[1]) - 1;
      const to = Number(match[2] || match[1]) - 1;
      if (from < 0 || to < from || from >= pageCount) return;
      for (let index = from; index <= Math.min(to, pageCount - 1); index += 1) {
        indexes.add(index);
      }
    });

  return [...indexes].sort((a, b) => a - b);
}

function getScaleFactor(scale) {
  if (scale === "fit") return 95;
  return 100;
}

async function findPrinter() {
  const printers = await printWindow.webContents.getPrintersAsync();
  return printers.find(
    (printer) => printer.name === DEFAULT_PRINTER || printer.displayName === DEFAULT_PRINTER,
  );
}

async function prepareLocalDocument(job) {
  const response = await fetch(job.fileURL);
  if (!response.ok) throw new Error(`Document download failed (${response.status}).`);

  const sourceBytes = Buffer.from(await response.arrayBuffer());
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "print-vending-"));
  const isPdf = job.fileType === "application/pdf" || /\.pdf$/i.test(job.fileName || "");
  const extension = isPdf ? ".pdf" : path.extname(job.fileName || "") || ".img";
  const documentPath = path.join(temporaryDirectory, `job${extension}`);

  try {
    if (isPdf && job.pageSelection === "custom") {
      const sourcePdf = await PDFDocument.load(sourceBytes);
      const selectedIndexes = getSelectedPageIndexes(job, sourcePdf.getPageCount());
      if (!selectedIndexes.length) throw new Error("The selected PDF page range is empty.");

      const outputPdf = await PDFDocument.create();
      const pages = await outputPdf.copyPages(sourcePdf, selectedIndexes);
      pages.forEach((page) => outputPdf.addPage(page));
      await fs.writeFile(documentPath, await outputPdf.save());
    } else {
      await fs.writeFile(documentPath, sourceBytes);
    }
    return { documentPath, temporaryDirectory };
  } catch (error) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

function sendToPrinter(job, printerName) {
  return new Promise((resolve, reject) => {
    const options = {
      silent: true,
      deviceName: printerName,
      printBackground: true,
      color: job.printType === "color",
      copies: Math.max(1, Number(job.copies) || 1),
      collate: true,
      pageSize: ["A3", "A4", "Letter"].includes(job.paperSize) ? job.paperSize : "A4",
      pagesPerSheet: Math.max(1, Number(job.pagesPerSheet) || 1),
      scaleFactor: getScaleFactor(job.scale),
      margins: { marginType: job.scale === "actual" ? "none" : "printableArea" },
    };
    printWindow.webContents.print(options, (success, failureReason) => {
      if (success) resolve();
      else reject(new Error(failureReason || "Windows rejected the print job."));
    });
  });
}

async function claimJob(job) {
  const statusReference = databaseApi.ref(database, `${JOBS_PATH}/${job.id}/printStatus`);
  const result = await databaseApi.runTransaction(
    statusReference,
    (status) => (status === READY_TO_PRINT ? PRINTING : undefined),
    { applyLocally: false },
  );
  return result.committed;
}

async function markFailed(job, error) {
  await databaseApi.update(databaseApi.ref(database, `${JOBS_PATH}/${job.id}`), {
    printStatus: PRINT_FAILED,
    printError: String(error?.message || error),
    printAgent: os.hostname(),
    printFailedAt: new Date().toISOString(),
  });
}

async function printJob(job) {
  if (!(await claimJob(job))) return;

  let preparedDocument;

  try {
    const printer = await findPrinter();
    if (!printer) throw new Error(`Printer '${DEFAULT_PRINTER}' is not available.`);

    console.log(`[print-agent] Printing ${job.id}: ${job.fileName}`);
    preparedDocument = await prepareLocalDocument(job);
    await printWindow.loadFile(preparedDocument.documentPath);
    await delay(2500);
    await sendToPrinter(job, printer.name);

    const rootUpdates = {};
    rootUpdates[`${JOBS_PATH}/${job.id}/printStatus`] = PRINTED;
    rootUpdates[`${JOBS_PATH}/${job.id}/printedAt`] = new Date().toLocaleString();
    rootUpdates[`${JOBS_PATH}/${job.id}/printedTime`] = Date.now();
    rootUpdates[`${JOBS_PATH}/${job.id}/printAgent`] = os.hostname();
    rootUpdates[`${JOBS_PATH}/${job.id}/printerName`] = printer.name;
    rootUpdates[`${JOBS_PATH}/${job.id}/printError`] = "";
    rootUpdates[TOTAL_PRINTED_PAGES_PATH] = databaseApi.increment(Number(job.totalPages) || 0);
    await databaseApi.update(databaseApi.ref(database), rootUpdates);
    console.log(`[print-agent] Sent successfully: ${job.id}`);
  } catch (error) {
    console.error(`[print-agent] Failed ${job.id}:`, error.message);
    await markFailed(job, error);
  } finally {
    if (preparedDocument?.temporaryDirectory) {
      await fs.rm(preparedDocument.temporaryDirectory, { recursive: true, force: true });
    }
  }
}

function enqueue(job) {
  if (queuedJobs.has(job.id)) return;
  queuedJobs.add(job.id);
  queue = queue
    .then(() => printJob(job))
    .catch((error) => console.error("[print-agent] Queue error:", error))
    .finally(() => queuedJobs.delete(job.id));
}

async function startAgent() {
  const firebaseAppApi = await import("firebase/app");
  databaseApi = await import("firebase/database");
  const firebaseApp = firebaseAppApi.initializeApp(FIREBASE_CONFIG, "windows-print-agent");
  database = databaseApi.getDatabase(firebaseApp);

  printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  const printer = await findPrinter();
  if (!printer) {
    throw new Error(`Required printer '${DEFAULT_PRINTER}' was not found.`);
  }
  console.log(`[print-agent] Ready on ${os.hostname()} using ${printer.name}`);
  console.log("[print-agent] Waiting for paid Firebase jobs...");

  databaseApi.onValue(databaseApi.ref(database, JOBS_PATH), (snapshot) => {
    if (!snapshot.exists()) return;
    const jobs = Object.entries(snapshot.val())
      .map(([id, value]) => ({ id, ...value }))
      .filter(
        (job) => job.paymentStatus === PAYMENT_SUCCESS && job.printStatus === READY_TO_PRINT,
      )
      .sort((a, b) => Number(a.createdTime || 0) - Number(b.createdTime || 0));
    jobs.forEach(enqueue);
  }, (error) => console.error("[print-agent] Firebase listener failed:", error));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(startAgent).catch((error) => {
    console.error("[print-agent] Startup failed:", error.message);
    app.exit(1);
  });
  app.on("window-all-closed", (event) => event.preventDefault());
}
