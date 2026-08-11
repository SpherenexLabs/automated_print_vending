import { PAYMENT_STATUS, PRINT_STATUS } from "../constants";
import { Badge } from "./Badge";
import {
  clearPrintJobs,
  confirmPayment,
  deletePrintJob,
  updatePrintStatus,
} from "../services/printVendingService";
import {
  formatCurrency,
  formatShortPrintType,
  getPaymentTone,
} from "../utils";

const getPrintTone = (status) => {
  if (status === PRINT_STATUS.printed) return "success";
  if (status === PRINT_STATUS.failed) return "danger";
  if (status === PRINT_STATUS.ready || status === PRINT_STATUS.printing) return "info";
  return "warning";
};

export function AdminDashboard({ jobs, metrics, totalPrintedPages, showStatusMessage }) {
  const handleManualPayment = async (job) => {
    try {
      await confirmPayment(job, "Admin Manual Confirmation", "ADMIN");
      showStatusMessage("Payment marked as successful.", "success");
    } catch (error) {
      console.error(error);
      showStatusMessage("Failed to update payment status.", "danger");
    }
  };

  const handleStartPrinting = async (job) => {
    if (job.paymentStatus !== PAYMENT_STATUS.success) {
      showStatusMessage("Payment is not completed. Printing is not allowed.", "danger");
      return;
    }

    try {
      await updatePrintStatus(job.id, PRINT_STATUS.ready, { printError: "" });
      showStatusMessage("Job sent to the laptop print agent.", "success");
    } catch (error) {
      console.error(error);
      showStatusMessage("Failed to send the job to the print agent.", "danger");
    }
  };

  const handleDeleteJob = async (job) => {
    if (!window.confirm("Delete this job and its uploaded file?")) return;

    try {
      await deletePrintJob(job);
      showStatusMessage("Job deleted successfully.", "success");
    } catch (error) {
      console.error(error);
      showStatusMessage("Delete failed. File may already be deleted.", "danger");
    }
  };

  const handleClearJobs = async () => {
    if (!window.confirm("Clear all jobs and reset the printed page count?")) return;

    try {
      await clearPrintJobs();
      showStatusMessage("All jobs cleared.", "success");
    } catch (error) {
      console.error(error);
      showStatusMessage("Clear failed.", "danger");
    }
  };

  return (
    <main className="workspace admin-workspace">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Print queue</h1>
        </div>
        <button className="button button-danger" onClick={handleClearJobs} type="button">
          Clear queue
        </button>
      </section>

      <section className="metric-grid">
        <div className="metric-card">
          <span>Total jobs</span>
          <strong>{metrics.totalJobs}</strong>
        </div>
        <div className="metric-card">
          <span>Printed pages</span>
          <strong>{totalPrintedPages}</strong>
        </div>
        <div className="metric-card">
          <span>Pending payments</span>
          <strong>{metrics.pendingPayments}</strong>
        </div>
        <div className="metric-card">
          <span>Ready</span>
          <strong>{metrics.readyToPrint}</strong>
        </div>
      </section>

      {jobs.length === 0 ? (
        <section className="empty-state">
          <h2>No print jobs</h2>
          <p className="muted">Uploaded customer files will appear in this queue.</p>
        </section>
      ) : (
        <section className="queue-panel">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>File</th>
                  <th>Pages</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Print</th>
                  <th>Transaction</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="mono-cell">{job.id}</td>
                    <td className="file-cell">{job.fileName}</td>
                    <td>{job.selectedPages ?? job.pages} x {job.copies}<br /><span className="muted">{job.sheets ?? job.totalPages} sheets</span></td>
                    <td>{formatShortPrintType(job.printType)} / {job.paperSize}<br /><span className="muted">{job.pagesPerSheet || 1} per sheet</span></td>
                    <td>{formatCurrency(job.amount)}</td>
                    <td>
                      <Badge tone={getPaymentTone(job.paymentStatus)}>
                        {job.paymentStatus}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={getPrintTone(job.printStatus)}>
                        {job.printStatus}
                      </Badge>
                    </td>
                    <td className="mono-cell">{job.transactionId || "-"}</td>
                    <td>{job.createdAt}</td>
                    <td>
                      <div className="table-actions">
                        <a className="button button-secondary button-small" href={job.fileURL} rel="noreferrer" target="_blank">
                          Open
                        </a>
                        {job.paymentStatus !== PAYMENT_STATUS.success && (
                          <button
                            className="button button-success button-small"
                            onClick={() => handleManualPayment(job)}
                            type="button"
                          >
                            Paid
                          </button>
                        )}
                        {job.paymentStatus === PAYMENT_STATUS.success &&
                          job.printStatus !== PRINT_STATUS.printed &&
                          job.printStatus !== PRINT_STATUS.printing && (
                          <button
                            className="button button-primary button-small"
                            onClick={() => handleStartPrinting(job)}
                            type="button"
                          >
                            {job.printStatus === PRINT_STATUS.failed ? "Retry" : "Send"}
                          </button>
                        )}
                        <button
                          className="button button-danger button-small"
                          onClick={() => handleDeleteJob(job)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
