export function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented-control">
        {options.map((option) => (
          <button
            className={value === option.value ? "selected" : ""}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
