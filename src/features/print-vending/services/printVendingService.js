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
  set,
  update,
} from "firebase/database";
import {
  FILES_PATH,
  JOBS_PATH,
  PAYMENT_STATUS,
  PRINT_STATUS,
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
      .sort((a, b) => Number(b.createdTime || 0) - Number(a.createdTime || 0));

    callback(jobs);
  });
};

export const subscribeToPrintedPages = (callback) => {
  const countReference = dbRef(database, TOTAL_PRINTED_PAGES_PATH);

  return onValue(countReference, (snapshot) => {
    callback(snapshot.exists() ? Number(snapshot.val()) : 0);
  });
};

export const createPrintJob = async ({ file, copies, pages, printType, paperSize, amount }) => {
  const safeFileName = sanitizeFileName(file.name);
  const uniqueFileName = `${createTransactionId("FILE")}_${safeFileName}`;
  const filePath = `${FILES_PATH}/${uniqueFileName}`;
  const fileStorageReference = storageRef(storage, filePath);

  await uploadBytes(fileStorageReference, file);
  const fileURL = await getDownloadURL(fileStorageReference);

  const jobReference = push(dbRef(database, JOBS_PATH));
  const totalPages = Number(pages) * Number(copies);

  const jobData = {
    fileName: file.name,
    fileURL,
    filePath,
    fileType: file.type,
    copies: Number(copies),
    pages: Number(pages),
    totalPages,
    printType,
    paperSize,
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
  await remove(dbRef(database, JOBS_PATH));
  await savePrintedPageCount(0);
};
