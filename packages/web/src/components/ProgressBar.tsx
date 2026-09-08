export function ProgressBar({ value, tone = 'active' }: { value: number; tone?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`progress-fill progress-${tone}`} style={{ width: `${clamped}%` }} />
      <span className="progress-label">{clamped}%</span>
    </div>
  );
}
