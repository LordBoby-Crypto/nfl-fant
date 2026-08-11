import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { WALKTHROUGH_STEPS } from "./model";

export function FirstTimeWalkthrough({
  onFinish,
  onOpenHelp,
}: {
  onFinish: () => void;
  onOpenHelp: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const step = WALKTHROUGH_STEPS[stepIndex];
  const isLast = stepIndex === WALKTHROUGH_STEPS.length - 1;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onFinish]);

  return (
    <div className="walkthrough-backdrop" role="presentation">
      <section
        aria-describedby="walkthrough-description"
        aria-labelledby="walkthrough-title"
        aria-modal="true"
        className="walkthrough-dialog"
        role="dialog"
      >
        <header>
          <div className="walkthrough-progress-copy">
            <small>First-time walkthrough</small>
            <strong>Step {stepIndex + 1} of {WALKTHROUGH_STEPS.length}</strong>
          </div>
          <button
            aria-label="Close walkthrough"
            className="walkthrough-close"
            onClick={onFinish}
            ref={closeButton}
          >
            <X />
          </button>
        </header>

        <div
          aria-label={`Walkthrough progress: ${stepIndex + 1} of ${WALKTHROUGH_STEPS.length}`}
          aria-valuemax={WALKTHROUGH_STEPS.length}
          aria-valuemin={1}
          aria-valuenow={stepIndex + 1}
          className="walkthrough-progress"
          role="progressbar"
        >
          <span
            style={{
              width: `${((stepIndex + 1) / WALKTHROUGH_STEPS.length) * 100}%`,
            }}
          />
        </div>

        <div className="walkthrough-content" key={step.id}>
          <span className="walkthrough-icon"><CircleHelp /></span>
          <h1 id="walkthrough-title">{step.title}</h1>
          <p id="walkthrough-description">{step.description}</p>
          <div
            className={
              step.id === "navigation"
                ? "walkthrough-points is-tabs"
                : "walkthrough-points"
            }
          >
            {step.points.map((point) => (
              <span key={point}><Check /> {point}</span>
            ))}
          </div>
          {step.example ? (
            <aside className="walkthrough-example">
              <small>Plain-English example</small>
              <strong>{step.example.title}</strong>
              <p>{step.example.detail}</p>
            </aside>
          ) : null}
        </div>

        <footer>
          <button
            className="button outline"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
          >
            <ChevronLeft /> Back
          </button>
          <button className="walkthrough-skip" onClick={onFinish}>Skip tour</button>
          {isLast ? (
            <button className="button primary" onClick={onOpenHelp}>
              Open permanent Help
            </button>
          ) : (
            <button
              className="button primary"
              onClick={() => setStepIndex((current) => current + 1)}
            >
              Next <ChevronRight />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
