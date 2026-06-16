import { formatCurrency } from "../utils";

export function PaymentModal({ job, onCancel, onConfirm }) {
  if (!job) return null;

  return (
    <div className="modal-backdrop">
      <section className="modal-card" aria-modal="true" role="dialog">
        <div>
          <p className="eyebrow">Payment confirmation</p>
          <h2>{formatCurrency(job.amount)}</h2>
          <p className="muted">Job ID: {job.id}</p>
        </div>

        <div className="modal-actions">
          <button className="button button-secondary" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="button button-primary" onClick={() => onConfirm(job)} type="button">
            Confirm payment
          </button>
        </div>
      </section>
    </div>
  );
}
