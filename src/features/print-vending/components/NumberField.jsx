export function NumberField({ label, value, onChange, min = 1 }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        min={min}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={value}
      />
    </label>
  );
}
