import { useState } from "react";
import { PAGE_TABS, PAYMENT_STATUS } from "./constants";
import { confirmPayment } from "./services/printVendingService";
import { usePrintJobs } from "./hooks/usePrintJobs";
import { AdminDashboard } from "./components/AdminDashboard";
import { AdminLogin } from "./components/AdminLogin";
import { PaymentModal } from "./components/PaymentModal";
import { StatusBanner } from "./components/StatusBanner";
import { UserPanel } from "./components/UserPanel";
import "./PrintVending.css";

export default function PrintVending() {
  const [activePage, setActivePage] = useState(PAGE_TABS.user);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [latestJob, setLatestJob] = useState(null);
  const [status, setStatus] = useState({ message: "", tone: "info" });
  const [paymentJob, setPaymentJob] = useState(null);
  const { jobs, metrics, totalPrintedPages } = usePrintJobs();

  const showStatusMessage = (message, tone = "info") => {
    setStatus({ message, tone });
  };

  const closePaymentModal = () => {
    setPaymentJob(null);
    showStatusMessage("Payment cancelled. Complete payment to release the job.", "info");
  };

  const handleAdminLogout = () => {
    setAdminAuthenticated(false);
    setActivePage(PAGE_TABS.user);
    showStatusMessage("Admin signed out.", "info");
  };

  const handleSimulatedPayment = async (job) => {
    if (!job) {
      showStatusMessage("No job found for payment.", "danger");
      return;
    }

    if (job.paymentStatus === PAYMENT_STATUS.success) {
      showStatusMessage("Payment already completed.", "info");
      return;
    }

    try {
      const paymentData = await confirmPayment(job, "Simulated Payment", "SIM");

      setLatestJob((currentJob) =>
        currentJob?.id === job.id ? { ...currentJob, ...paymentData } : currentJob,
      );
      setPaymentJob(null);
      showStatusMessage("Payment successful. Sent to the printer station.", "success");
    } catch (error) {
      console.error(error);
      showStatusMessage("Payment failed. Please try again.", "danger");
    }
  };

  return (
    <div className="print-vending-app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Automated print vending</p>
          <h2>Smart Print Station</h2>
        </div>

        <nav className="tab-switcher" aria-label="Application sections">
          <button
            className={activePage === PAGE_TABS.user ? "active" : ""}
            onClick={() => setActivePage(PAGE_TABS.user)}
            type="button"
          >
            User
          </button>
          <button
            className={activePage === PAGE_TABS.admin ? "active" : ""}
            onClick={() => setActivePage(PAGE_TABS.admin)}
            type="button"
          >
            Admin
          </button>
        </nav>
      </header>

      <StatusBanner message={status.message} tone={status.tone} />

      {activePage === PAGE_TABS.user ? (
        <UserPanel
          latestJob={latestJob}
          onJobCreated={setLatestJob}
          onOpenPayment={setPaymentJob}
          showStatusMessage={showStatusMessage}
        />
      ) : adminAuthenticated ? (
        <AdminDashboard
          jobs={jobs}
          metrics={metrics}
          onLogout={handleAdminLogout}
          showStatusMessage={showStatusMessage}
          totalPrintedPages={totalPrintedPages}
        />
      ) : (
        <AdminLogin
          onAuthenticate={() => setAdminAuthenticated(true)}
          showStatusMessage={showStatusMessage}
        />
      )}

      <PaymentModal
        job={paymentJob}
        onCancel={closePaymentModal}
        onConfirm={handleSimulatedPayment}
      />
    </div>
  );
}
