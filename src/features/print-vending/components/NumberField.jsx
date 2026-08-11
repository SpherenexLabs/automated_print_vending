export function NumberField({ label, value, onChange, min = 1, readOnly = false, hint = "" }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        min={min}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        type="number"
        value={value}
      />
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}
