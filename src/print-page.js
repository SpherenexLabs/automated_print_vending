import { get, ref } from "firebase/database";
import { printDatabase } from "./print-firebase.js";
import { JOBS_PATH, PAYMENT_STATUS } from "./features/print-vending/constants.js";

const title = document.querySelector("#print-title");
const status = document.querySelector("#print-status");
const settings = document.querySelector("#job-settings");
const viewer = document.querySelector("#document-viewer");
const errorPanel = document.querySelector("#print-error");
const printButton = document.querySelector("#print-button");
let printStarted = false;
let automaticPrintTimer = null;

const triggerPrint = () => {
  if (printStarted) return;

  printStarted = true;
  if (automaticPrintTimer) {
    window.clearTimeout(automaticPrintTimer);
    automaticPrintTimer = null;
  }
  printButton.disabled = true;
  status.textContent = "Print dialog opened. Complete or cancel it to finish this process.";
  window.print();
};

const showError = (message) => {
  title.textContent = "Unable to print";
  status.textContent = "The print job could not be prepared.";
  errorPanel.textContent = message;
  errorPanel.hidden = false;
};

const addSetting = (label, value) => {
  const item = document.createElement("div");
  const name = document.createElement("span");
  const detail = document.createElement("strong");
  name.textContent = label;
  detail.textContent = value;
  item.append(name, detail);
  settings.append(item);
};

const applyPrintStyles = (job) => {
  const style = document.createElement("style");
  const margin = job.scale === "actual" ? "0" : "10mm";
  style.textContent = `@page { size: ${job.paperSize || "A4"}; margin: ${margin}; }`;
  document.head.append(style);
  document.body.dataset.scale = job.scale || "default";
};

const loadDocument = (job) =>
  new Promise((resolve, reject) => {
    const isImage = job.fileType?.startsWith("image/") || /\.(png|jpe?g)$/i.test(job.fileName || "");
    const element = document.createElement(isImage ? "img" : "iframe");
    element.className = "print-document";
    element.addEventListener("load", resolve, { once: true });
    element.addEventListener("error", () => reject(new Error("The uploaded document could not be loaded.")), { once: true });

    if (isImage) {
      element.alt = job.fileName || "Uploaded print document";
    } else {
      element.title = job.fileName || "Uploaded print document";
    }

    element.src = job.fileURL;
    viewer.append(element);
  });

const fetchPrintJob = async (requestedJobId) => {
  if (requestedJobId) {
    const snapshot = await get(ref(printDatabase, `${JOBS_PATH}/${requestedJobId}`));
    return snapshot.exists() ? { id: requestedJobId, ...snapshot.val() } : null;
  }

  const jobsSnapshot = await get(ref(printDatabase, JOBS_PATH));
  if (!jobsSnapshot.exists()) return null;

  const jobs = Object.entries(jobsSnapshot.val())
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => Number(b.createdTime || 0) - Number(a.createdTime || 0));

  return jobs.find((job) => job.paymentStatus === PAYMENT_STATUS.success) || null;
};

const start = async () => {
  const requestedJobId = new URLSearchParams(window.location.search).get("jobId")?.trim();

  try {
    status.textContent = requestedJobId
      ? "Fetching the selected job from Firebase."
      : "Finding the newest paid job in Firebase.";
    const job = await fetchPrintJob(requestedJobId);
    if (!job) {
      showError(requestedJobId
        ? "This print job does not exist or has been deleted."
        : "No paid print jobs were found in Firebase. Complete payment first.");
      return;
    }

    if (job.paymentStatus !== PAYMENT_STATUS.success) {
      showError("Payment has not been confirmed for this job. Printing is blocked until Firebase shows Payment Success.");
      return;
    }

    if (!job.fileURL) {
      showError("This job has no uploaded document URL.");
      return;
    }

    title.textContent = job.fileName || `Print job ${job.id}`;
    status.textContent = "Saved Firebase settings loaded. Preparing the system print dialog…";
    addSetting("Destination", job.destination || "Canon MG2500 series Printer");
    addSetting("Pages", job.pageSelection === "custom" ? job.pageRange : "All");
    addSetting("Colour", job.printType === "color" ? "Colour" : "Black and white");
    addSetting("Paper size", job.paperSize || "A4");
    addSetting("Pages per sheet", String(job.pagesPerSheet || 1));
    addSetting("Scale", job.scale || "default");
    addSetting("Copies", String(job.copies || 1));
    addSetting("Paper sheets", String(job.sheets ?? job.totalPages ?? 1));
    settings.hidden = false;

    applyPrintStyles(job);
    await loadDocument(job);
    status.textContent = "Document ready. If the dialog does not open, select Print.";
    printButton.disabled = false;
    automaticPrintTimer = window.setTimeout(triggerPrint, 350);
  } catch (error) {
    console.error(error);
    showError("Firebase or the uploaded document could not be reached. Check your connection and database rules.");
  }
};

window.addEventListener("afterprint", () => {
  if (!printStarted) return;

  status.textContent = "Print process completed. This window can now close.";
  viewer.replaceChildren();
  window.setTimeout(() => {
    window.close();
    if (!window.closed) {
      title.textContent = "Print process completed";
      settings.hidden = true;
    }
  }, 250);
});

printButton.addEventListener("click", triggerPrint);
start();
