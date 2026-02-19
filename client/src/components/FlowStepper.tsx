interface FlowStep {
  id: string;
  label: string;
  description: string;
}

interface FlowStepperProps {
  steps: FlowStep[];
  activeStepId: string;
}

export default function FlowStepper({ steps, activeStepId }: FlowStepperProps) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      {steps.map((step, index) => {
        const isActive = step.id === activeStepId;
        const isDone = steps.findIndex((item) => item.id === activeStepId) > index;
        return (
          <div
            key={step.id}
            className={`rounded-2xl border p-3 transition duration-200 ${
              isActive
                ? 'border-[var(--accent-gold)] bg-[color:color-mix(in_srgb,var(--surface-2),var(--accent-gold)_9%)] text-[var(--ink)] shadow-[inset_0_-1px_0_0_var(--accent-gold)]'
                : isDone
                  ? 'border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)]'
                  : 'border-[var(--line)] bg-[var(--surface-1)] text-[var(--muted-ink)]'
            }`}
          >
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                isActive ? 'bg-[var(--accent-gold)] text-[var(--surface-1)]' : 'bg-[var(--surface-3)] text-[var(--muted-ink)]'
              }`}>
                {index + 1}
              </span>
              {step.label}
            </div>
            <p className="text-xs leading-relaxed">{step.description}</p>
          </div>
        );
      })}
    </div>
  );
}
