import { MaskAction, maskActionLabels } from '../../types/privacy';

interface ActionSegmentedProps {
  value: MaskAction;
  onChange: (action: MaskAction) => void;
  /** 正文类字段没有“省略整段”的语义，可只提供 保留 / 遮蔽。 */
  options?: MaskAction[];
  ariaLabel?: string;
}

const DEFAULT_OPTIONS: MaskAction[] = ['keep', 'mask', 'omit'];

/** keep / mask / omit 三态分段选择，配色复用模板卡片的选中态。 */
export function ActionSegmented({ value, onChange, options = DEFAULT_OPTIONS, ariaLabel }: ActionSegmentedProps) {
  return (
    <div
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface-alt)] p-0.5"
      role="group"
    >
      {options.map((action) => {
        const active = value === action;
        return (
          <button
            key={action}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(action)}
            className={`min-h-8 rounded px-3 text-xs font-semibold transition ${
              active
                ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)] ring-1 ring-[var(--accent)]'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            {maskActionLabels[action]}
          </button>
        );
      })}
    </div>
  );
}
