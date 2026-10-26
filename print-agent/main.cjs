const { app, BrowserWindow } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { PDFDocument } = require("pdf-lib");

const execFileAsync = promisify(execFile);

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAr4IYnykpwovqOJWzfBd7abVdAma_Ig3Q",
  authDomain: "diet-planner-3bdf3.firebaseapp.com",
  databaseURL: "https://diet-planner-3bdf3-default-rtdb.firebaseio.com",
  projectId: "diet-planner-3bdf3",
  storageBucket: "diet-planner-3bdf3.firebasestorage.app",
  messagingSenderId: "927878354911",
  appId: "1:927878354911:web:2e616b171a267b9910566a",
};

const PRINT_VENDING_PATH = "Print_Vending";
const JOBS_PATH = `${PRINT_VENDING_PATH}/jobs`;
const TOTAL_PRINTED_PAGES_PATH = "Print_Vending/totalPrintedPages";
const TOTAL_PRINTED_PAGES_ALERT_PATH = "Print_Vending/alerts/printedPages10";
const PRINTING_PROGRESS_PATH = `${PRINT_VENDING_PATH}/printingProgress`;
const PAPER_PATH = `${PRINT_VENDING_PATH}/Paper`;
const OBSTACLE_PATH = `${PRINT_VENDING_PATH}/Obstacle`;
const PRINT_SIGNAL_PATH = `${PRINT_VENDING_PATH}/Print`;
const PAYMENT_SUCCESS = "Payment Success";
const READY_TO_PRINT = "Ready to Print";
const PRINTING = "Printing";
const PRINTED = "Printed";
const PRINT_FAILED = "Print Failed";
const DEFAULT_PRINTER = process.env.PRINT_VENDING_PRINTER || "Canon MG2500 series Printer";
const PRINTED_PAGES_ALERT_THRESHOLD = 10;
const PRINTED_PAGES_ALERT_CLAIM_MS = 60 * 1000;

let databaseApi;
let database;
let printWindow;
let queue = Promise.resolve();
let lastPaperState;
const queuedJobs = new Set();

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function sendPrintedPagesThresholdAlert(totalPages) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!botToken || !chatId || totalPages < PRINTED_PAGES_ALERT_THRESHOLD) return;

  const alertReference = databaseApi.ref(database, TOTAL_PRINTED_PAGES_ALERT_PATH);
  const claimToken = `${os.hostname()}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const claimResult = await databaseApi.runTransaction(
    alertReference,
    (currentAlert) => {
      if (currentAlert?.status === "sent") return undefined;
      if (
        currentAlert?.status === "sending" &&
        Date.now() - Number(currentAlert.claimedAt) < PRINTED_PAGES_ALERT_CLAIM_MS
      ) return undefined;

      return {
        status: "sending",
        claimedAt: Date.now(),
        claimToken,
      };
    },
    { applyLocally: false },
  );
  if (!claimResult.committed) return;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Printed page milestone reached: ${totalPages} pages printed (threshold: 10).`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(`Telegram rejected the alert (HTTP ${response.status}).`);
    }

    await databaseApi.set(alertReference, {
      status: "sent",
      sentAt: Date.now(),
      totalPages,
    });
    console.log(`[print-agent] Telegram page milestone alert sent at ${totalPages} pages.`);
  } catch (error) {
    try {
      await databaseApi.runTransaction(
        alertReference,
        (currentAlert) => currentAlert?.claimToken === claimToken ? null : undefined,
        { applyLocally: false },
      );
    } catch (releaseError) {
      console.error("[print-agent] Could not release the Telegram alert claim:", releaseError.message);
    }
    throw error;
  }
}

async function checkPrintedPagesThreshold(totalPages) {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !process.env.TELEGRAM_CHAT_ID?.trim()) return;

  try {
    await sendPrintedPagesThresholdAlert(totalPages);
  } catch (error) {
    console.error("[print-agent] Could not send the Telegram page milestone alert:", error.message);
  }
}

async function withRetry(operation, label, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const waitTime = Math.min(1000 * (2 ** (attempt - 1)), 15000);
      console.warn(`[print-agent] ${label} interrupted (${error.message}). Retrying in ${waitTime}ms...`);
      await delay(waitTime);
    }
  }
  throw lastError;
}

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
  if (scale === "default") return 90;
  return 100;
}

function isGeneratedImageDocument(job) {
  const sourceNames = Array.isArray(job.sourceFileNames)
    ? job.sourceFileNames
    : Object.values(job.sourceFileNames || {});
  return sourceNames.length > 0 && sourceNames.every((name) => /\.(png|jpe?g)$/i.test(name));
}

function getPaperDimensions(job) {
  const paperDimensions = {
    A3: [841.89, 1190.55],
    A4: [595.28, 841.89],
    Letter: [612, 792],
  };
  const [width, height] = paperDimensions[job.paperSize] || paperDimensions.A4;
  return job.orientation === "landscape" ? [height, width] : [width, height];
}

async function createImagePdf(sourceBytes, job) {
  const outputPdf = await PDFDocument.create();
  const isPng = job.fileType === "image/png" || /\.png$/i.test(job.fileName || "");
  const image = isPng
    ? await outputPdf.embedPng(sourceBytes)
    : await outputPdf.embedJpg(sourceBytes);
  const page = outputPdf.addPage(getPaperDimensions(job));
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: page.getWidth(),
    height: page.getHeight(),
  });
  return outputPdf.save();
}

async function hasPaper() {
  const snapshot = await withRetry(
    () => databaseApi.get(databaseApi.ref(database, PAPER_PATH)),
    "checking the paper sensor",
  );
  return Number(snapshot.val()) === 1;
}

const setPrintSignal = (value) => withRetry(
  () => databaseApi.set(databaseApi.ref(database, PRINT_SIGNAL_PATH), value ? 1 : 0),
  `setting Print to ${value ? 1 : 0}`,
);

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
  const isImage = job.fileType?.startsWith("image/") || /\.(png|jpe?g)$/i.test(job.fileName || "");
  const extension = isPdf || isImage ? ".pdf" : path.extname(job.fileName || "") || ".img";
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
    } else if (isImage) {
      await fs.writeFile(documentPath, await createImagePdf(sourceBytes, job));
    } else {
      await fs.writeFile(documentPath, sourceBytes);
    }
    return { documentPath, temporaryDirectory, isImage };
  } catch (error) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

function sendToPrinter(job, printerName, isImage) {
  return new Promise((resolve, reject) => {
    const generatedImageDocument = isGeneratedImageDocument(job);
    const options = {
      silent: true,
      deviceName: printerName,
      printBackground: true,
      color: job.printType === "color",
      copies: Math.max(1, Number(job.copies) || 1),
      collate: true,
      pageSize: ["A3", "A4", "Letter"].includes(job.paperSize) ? job.paperSize : "A4",
      landscape: job.orientation === "landscape",
      pagesPerSheet: Math.max(1, Number(job.pagesPerSheet) || 1),
      scaleFactor: isImage || generatedImageDocument ? 100 : getScaleFactor(job.scale),
      margins: {
        marginType: isImage || generatedImageDocument || job.scale === "actual" || job.scale === "fit"
          ? "none"
          : "printableArea",
      },
    };
    printWindow.webContents.print(options, (success, failureReason) => {
      if (success) resolve();
      else reject(new Error(failureReason || "Windows rejected the print job."));
    });
  });
}

async function getWindowsPrintJobs(printerName) {
  const command = [
    "$jobs = @(Get-PrintJob -PrinterName $env:PRINT_VENDING_QUERY_PRINTER -ErrorAction Stop |",
    "  Select-Object @{Name='JobId'; Expression={$_.ID}}, TotalPages, PagesPrinted,",
    "    @{Name='JobStatus'; Expression={[string]$_.JobStatus}},",
    "    @{Name='StatusMask'; Expression={[uint32]$_.JobStatus}})",
    "ConvertTo-Json -InputObject $jobs -Compress",
  ].join("\n");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    {
      env: { ...process.env, PRINT_VENDING_QUERY_PRINTER: printerName },
      timeout: 10000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  const output = stdout.trim();
  if (!output) return [];
  const jobs = JSON.parse(output);
  return Array.isArray(jobs) ? jobs : [jobs];
}

function getSpoolerState(printJob) {
  const statusMask = Number(printJob?.StatusMask) || 0;
  if (statusMask & 1024) return "user_intervention";
  if (statusMask & 512) return "blocked";
  if (statusMask & 2) return "error";
  if (statusMask & 64) return "paper_out";
  if (statusMask & 32) return "offline";
  if (statusMask & 8) return "spooling";
  if (statusMask & 16) return "printing";
  if (statusMask & 128) return "printed";
  return String(printJob?.JobStatus || "printing").trim().toLowerCase() || "printing";
}

async function savePrintingProgress(job, progress) {
  const expectedPages = Math.max(1, Number(job.totalPages) || 1);
  const currentPage = Math.max(0, Number(progress.currentPage) || 0);
  const totalPages = Math.max(1, Number(progress.totalPages) || expectedPages);
  const obstacle = ["blocked", "error", "user_intervention"].includes(progress.status) ? 1 : 0;
  const updatedAt = new Date().toISOString();
  const value = {
    jobId: job.id,
    fileName: job.fileName || "",
    currentPage,
    totalPages,
    display: `${currentPage} / ${totalPages}`,
    status: progress.status,
    obstacle,
    source: "windows-spooler",
    updatedAt,
  };
  const updates = {};
  updates[PRINTING_PROGRESS_PATH] = value;
  updates[OBSTACLE_PATH] = obstacle;
  updates[`${JOBS_PATH}/${job.id}/currentPrintingPage`] = currentPage;
  updates[`${JOBS_PATH}/${job.id}/printerTotalPages`] = totalPages;
  updates[`${JOBS_PATH}/${job.id}/printerProgressStatus`] = progress.status;
  updates[`${JOBS_PATH}/${job.id}/printerProgressUpdatedAt`] = updatedAt;
  await databaseApi.update(databaseApi.ref(database), updates);
}

async function monitorPrintingProgress(job, printerName, existingJobIds, control) {
  const expectedPages = Math.max(1, Number(job.totalPages) || 1);
  const discoveryDeadline = Date.now() + 15000;
  const monitorDeadline = Date.now() + (30 * 60 * 1000);
  let printerJobId = null;
  let lastPagesPrinted = 0;
  let lastSavedValue = "";

  await savePrintingProgress(job, {
    currentPage: 0,
    totalPages: expectedPages,
    status: "submitting",
  });

  while (!control.cancelled && Date.now() < monitorDeadline) {
    const printJobs = await getWindowsPrintJobs(printerName);
    let printJob;

    if (printerJobId !== null) {
      printJob = printJobs.find((item) => Number(item.JobId) === printerJobId);
      if (!printJob) {
        await savePrintingProgress(job, {
          currentPage: expectedPages,
          totalPages: expectedPages,
          status: "completed",
        });
        return { currentPage: expectedPages, totalPages: expectedPages, status: "completed" };
      }
    } else {
      printJob = printJobs.find((item) => !existingJobIds.has(Number(item.JobId)));
      if (!printJob) {
        if (Date.now() >= discoveryDeadline) {
          await savePrintingProgress(job, {
            currentPage: 0,
            totalPages: expectedPages,
            status: "progress_unavailable",
          });
          return { currentPage: 0, totalPages: expectedPages, status: "progress_unavailable" };
        }
        await delay(750);
        continue;
      }
      printerJobId = Number(printJob.JobId);
    }

    const status = getSpoolerState(printJob);
    const reportedTotal = Number(printJob.TotalPages) || expectedPages;
    const completedPages = Math.max(0, Number(printJob.PagesPrinted) || 0);
    // Windows reports completed pages, while the Canon status monitor displays
    // the page currently passing through the printer (1/2 while 0 are complete).
    const activePage = status === "printing"
      ? Math.min(reportedTotal, completedPages + 1)
      : completedPages;
    const reportedCurrent = Math.min(
      reportedTotal,
      Math.max(lastPagesPrinted, activePage),
    );
    lastPagesPrinted = reportedCurrent;
    const valueKey = `${reportedCurrent}/${reportedTotal}/${status}`;

    if (valueKey !== lastSavedValue) {
      await savePrintingProgress(job, {
        currentPage: reportedCurrent,
        totalPages: reportedTotal,
        status,
      });
      console.log(`[print-agent] Progress ${job.id}: ${reportedCurrent}/${reportedTotal} (${status})`);
      lastSavedValue = valueKey;
    }
    await delay(750);
  }

  if (!control.cancelled) {
    await savePrintingProgress(job, {
      currentPage: lastPagesPrinted,
      totalPages: expectedPages,
      status: "monitor_timeout",
    });
  }
  return { currentPage: lastPagesPrinted, totalPages: expectedPages, status: "monitor_timeout" };
}

async function claimJob(job) {
  const jobReference = databaseApi.ref(database, `${JOBS_PATH}/${job.id}`);
  const claimToken = `${os.hostname()}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const result = await databaseApi.runTransaction(
        jobReference,
        (currentJob) => {
          if (
            !currentJob ||
            currentJob.paymentStatus !== PAYMENT_SUCCESS ||
            currentJob.printStatus !== READY_TO_PRINT
          ) return undefined;

          return {
            ...currentJob,
            printStatus: PRINTING,
            printAgent: os.hostname(),
            printClaimToken: claimToken,
            printClaimedAt: new Date().toISOString(),
          };
        },
        { applyLocally: false },
      );
      return result.committed;
    } catch (error) {
      let currentJob;
      try {
        const snapshot = await withRetry(
          () => databaseApi.get(jobReference),
          `checking claim ${job.id}`,
          3,
        );
        currentJob = snapshot.val();
      } catch {
        currentJob = null;
      }
      if (currentJob?.printClaimToken === claimToken && currentJob.printStatus === PRINTING) {
        console.log(`[print-agent] Recovered confirmed claim after disconnect: ${job.id}`);
        return true;
      }
      if (currentJob?.printStatus !== READY_TO_PRINT) return false;
      if (attempt === 6) throw error;
      const waitTime = Math.min(1000 * (2 ** (attempt - 1)), 15000);
      console.warn(`[print-agent] Claim disconnected for ${job.id}. Retrying in ${waitTime}ms...`);
      await delay(waitTime);
    }
  }
  return false;
}

async function markFailed(job, error) {
  await withRetry(
    () => databaseApi.update(databaseApi.ref(database, `${JOBS_PATH}/${job.id}`), {
      printStatus: PRINT_FAILED,
      printError: String(error?.message || error),
      printAgent: os.hostname(),
      printFailedAt: new Date().toISOString(),
      printClaimToken: null,
    }),
    `saving failure for ${job.id}`,
  );
}

async function printJob(job) {
  if (!(await hasPaper())) {
    console.log(`[print-agent] Waiting for paper before printing ${job.id}.`);
    return;
  }

  if (!(await claimJob(job))) return;

  let preparedDocument;
  const progressControl = { cancelled: false };

  try {
    const printer = await findPrinter();
    if (!printer) throw new Error(`Printer '${DEFAULT_PRINTER}' is not available.`);

    console.log(`[print-agent] Printing queue ${String(job.queueNumber || "---").padStart(3, "0")} (${job.id}): ${job.fileName}`);
    await setPrintSignal(1);
    preparedDocument = await prepareLocalDocument(job);
    await printWindow.loadFile(preparedDocument.documentPath);
    await delay(2500);
    const existingPrintJobs = await getWindowsPrintJobs(printer.name).catch((error) => {
      console.warn(`[print-agent] Could not read the initial Windows print queue: ${error.message}`);
      return [];
    });
    const existingJobIds = new Set(existingPrintJobs.map((item) => Number(item.JobId)));
    const progressPromise = monitorPrintingProgress(
      job,
      printer.name,
      existingJobIds,
      progressControl,
    ).catch((error) => {
      console.warn(`[print-agent] Print progress monitoring failed: ${error.message}`);
      return null;
    });
    await sendToPrinter(job, printer.name, preparedDocument.isImage);
    await progressPromise;

    const rootUpdates = {};
    rootUpdates[`${JOBS_PATH}/${job.id}/printStatus`] = PRINTED;
    rootUpdates[`${JOBS_PATH}/${job.id}/printedAt`] = new Date().toLocaleString();
    rootUpdates[`${JOBS_PATH}/${job.id}/printedTime`] = Date.now();
    rootUpdates[`${JOBS_PATH}/${job.id}/printAgent`] = os.hostname();
    rootUpdates[`${JOBS_PATH}/${job.id}/printerName`] = printer.name;
    rootUpdates[`${JOBS_PATH}/${job.id}/printError`] = "";
    rootUpdates[`${JOBS_PATH}/${job.id}/printClaimToken`] = null;
    rootUpdates[TOTAL_PRINTED_PAGES_PATH] = databaseApi.increment(Number(job.totalPages) || 0);
    await withRetry(
      () => databaseApi.update(databaseApi.ref(database), rootUpdates),
      `saving print completion for ${job.id}`,
    );
    console.log(`[print-agent] Sent successfully: ${job.id}`);
  } catch (error) {
    progressControl.cancelled = true;
    console.error(`[print-agent] Failed ${job.id}:`, error.message);
    await markFailed(job, error);
  } finally {
    try {
      await setPrintSignal(0);
    } catch (error) {
      console.error("[print-agent] Failed to reset Print to 0:", error.message);
    }
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

  if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !process.env.TELEGRAM_CHAT_ID?.trim()) {
    console.warn("[print-agent] Telegram alerts are disabled; set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable them.");
  } else {
    databaseApi.onValue(
      databaseApi.ref(database, TOTAL_PRINTED_PAGES_PATH),
      (snapshot) => {
        void checkPrintedPagesThreshold(Number(snapshot.val()) || 0);
      },
      (error) => console.error("[print-agent] Printed-page listener failed:", error.message),
    );
  }

  printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  await setPrintSignal(0);
  console.log("[print-agent] Print signal reset to 0.");

  const printer = await findPrinter();
  if (!printer) {
    throw new Error(`Required printer '${DEFAULT_PRINTER}' was not found.`);
  }
  console.log(`[print-agent] Ready on ${os.hostname()} using ${printer.name}`);
  console.log("[print-agent] Waiting for paid Firebase jobs...");

  databaseApi.onValue(databaseApi.ref(database, PRINT_VENDING_PATH), (snapshot) => {
    if (!snapshot.exists()) return;
    const printVending = snapshot.val();
    const paperAvailable = Number(printVending.Paper) === 1;
    if (paperAvailable !== lastPaperState) {
      console.log(
        paperAvailable
          ? "[print-agent] Paper sensor is 1. Printing is enabled."
          : "[print-agent] Paper sensor is 0. Waiting for paper; ready jobs will not print.",
      );
      lastPaperState = paperAvailable;
    }
    if (!paperAvailable) return;

    const jobs = Object.entries(printVending.jobs || {})
      .map(([id, value]) => ({ id, ...value }))
      .filter(
        (job) => job.paymentStatus === PAYMENT_SUCCESS && job.printStatus === READY_TO_PRINT,
      )
      .sort((a, b) => {
        const aQueue = Number(a.queueNumber) || null;
        const bQueue = Number(b.queueNumber) || null;
        if (aQueue && bQueue) return aQueue - bQueue;
        if (aQueue) return 1;
        if (bQueue) return -1;
        return Number(a.createdTime || 0) - Number(b.createdTime || 0);
      });
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
