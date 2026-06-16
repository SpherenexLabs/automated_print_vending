export function StatusBanner({ message, tone = "info" }) {
  if (!message) return null;

  return (
    <div className={`status-banner ${tone}`} role="status">
      {message}
    </div>
  );
}
