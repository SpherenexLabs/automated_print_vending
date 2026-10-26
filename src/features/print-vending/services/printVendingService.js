import { database, storage } from "../../../firebase";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
  deleteObject,
} from "firebase/storage";
import {
  onValue,
  push,
  ref as dbRef,
  remove,
  runTransaction,
  set,
  update,
} from "firebase/database";
import {
  FILES_PATH,
  JOBS_PATH,
  QUEUE_COUNTER_PATH,
  PAYMENT_STATUS,
  PRINT_STATUS,
  TOTAL_PRINTED_PAGES_ALERT_PATH,
  TOTAL_PRINTED_PAGES_PATH,
} from "../constants";
import {
  createTransactionId,
  getCurrentTimeMs,
  getCurrentTimestamp,
  sanitizeFileName,
} from "../utils";

export const subscribeToJobs = (callback) => {
  const jobsReference = dbRef(database, JOBS_PATH);

  return onValue(jobsReference, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }

    const jobs = Object.entries(snapshot.val())
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => {
        const aQueue = Number(a.queueNumber) || null;
        const bQueue = Number(b.queueNumber) || null;
        if (aQueue && bQueue) return aQueue - bQueue;
        if (aQueue) return 1;
        if (bQueue) return -1;
        return Number(a.createdTime || 0) - Number(b.createdTime || 0);
      });

    callback(jobs);
  });
};

export const subscribeToPrintedPages = (callback) => {
  const countReference = dbRef(database, TOTAL_PRINTED_PAGES_PATH);

  return onValue(countReference, (snapshot) => {
    callback(snapshot.exists() ? Number(snapshot.val()) : 0);
  });
};

export const createPrintJob = async ({
  file,
  sourceFileNames = [],
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
}) => {
  const safeFileName = sanitizeFileName(file.name);
  const uniqueFileName = `${createTransactionId("FILE")}_${safeFileName}`;
  const filePath = `${FILES_PATH}/${uniqueFileName}`;
  const fileStorageReference = storageRef(storage, filePath);

  await uploadBytes(fileStorageReference, file);
  const fileURL = await getDownloadURL(fileStorageReference);

  const queueResult = await runTransaction(
    dbRef(database, QUEUE_COUNTER_PATH),
    (currentValue) => (Number(currentValue) || 0) + 1,
    { applyLocally: false },
  );
  if (!queueResult.committed) {
    throw new Error("Could not reserve a queue number.");
  }
  const queueNumber = Number(queueResult.snapshot.val());

  const jobReference = push(dbRef(database, JOBS_PATH));
  const totalPages = Number(selectedPages) * Number(copies);

  const jobData = {
    fileName: file.name,
    sourceFileNames,
    sourceFileCount: sourceFileNames.length || 1,
    fileURL,
    filePath,
    fileType: file.type,
    queueNumber,
    copies: Number(copies),
    pages: Number(pages),
    totalPages,
    printType,
    paperSize,
    orientation: orientation === "landscape" ? "landscape" : "portrait",
    destination,
    pageSelection,
    pageRange: pageSelection === "custom" ? pageRange : "",
    pagesPerSheet: Number(pagesPerSheet),
    scale,
    selectedPages: Number(selectedPages),
    sheets: Number(sheets),
    amount,
    paymentStatus: PAYMENT_STATUS.pending,
    printStatus: PRINT_STATUS.waiting,
    paymentMode: "",
    transactionId: "",
    paymentTime: "",
    createdAt: getCurrentTimestamp(),
    createdTime: getCurrentTimeMs(),
  };

  await set(jobReference, jobData);

  return {
    id: jobReference.key,
    ...jobData,
  };
};

export const confirmPayment = async (job, paymentMode, prefix = "SIM") => {
  const transactionId = createTransactionId(prefix);
  const paymentTime = getCurrentTimestamp();

  const paymentData = {
    paymentStatus: PAYMENT_STATUS.success,
    printStatus: PRINT_STATUS.ready,
    paymentMode,
    paymentTime,
    transactionId,
  };

  await update(dbRef(database, `${JOBS_PATH}/${job.id}`), paymentData);

  return paymentData;
};

export const updatePrintStatus = (jobId, printStatus, extraData = {}) =>
  update(dbRef(database, `${JOBS_PATH}/${jobId}`), {
    printStatus,
    ...extraData,
  });

export const savePrintedPageCount = (count) =>
  set(dbRef(database, TOTAL_PRINTED_PAGES_PATH), Number(count));

export const deletePrintJob = async (job) => {
  await remove(dbRef(database, `${JOBS_PATH}/${job.id}`));

  if (job.filePath) {
    await deleteObject(storageRef(storage, job.filePath));
  }
};

export const clearPrintJobs = async () => {
  await update(dbRef(database), {
    [JOBS_PATH]: null,
    [QUEUE_COUNTER_PATH]: null,
    [TOTAL_PRINTED_PAGES_PATH]: 0,
    [TOTAL_PRINTED_PAGES_ALERT_PATH]: null,
  });
};
