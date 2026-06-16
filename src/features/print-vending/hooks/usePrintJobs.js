import { useEffect, useMemo, useState } from "react";
import {
  subscribeToJobs,
  subscribeToPrintedPages,
} from "../services/printVendingService";
import { PAYMENT_STATUS, PRINT_STATUS } from "../constants";

export function usePrintJobs() {
  const [jobs, setJobs] = useState([]);
  const [totalPrintedPages, setTotalPrintedPages] = useState(0);

  useEffect(() => subscribeToJobs(setJobs), []);

  useEffect(() => subscribeToPrintedPages(setTotalPrintedPages), []);

  const metrics = useMemo(
    () => ({
      totalJobs: jobs.length,
      pendingPayments: jobs.filter((job) => job.paymentStatus === PAYMENT_STATUS.pending).length,
      readyToPrint: jobs.filter((job) => job.printStatus === PRINT_STATUS.ready).length,
      printedJobs: jobs.filter((job) => job.printStatus === PRINT_STATUS.printed).length,
    }),
    [jobs],
  );

  return {
    jobs,
    totalPrintedPages,
    metrics,
  };
}
