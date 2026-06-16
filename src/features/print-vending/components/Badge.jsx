export function Badge({ tone = "info", children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
