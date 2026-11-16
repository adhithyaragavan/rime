import { ACTS, type Act } from "../lib/demo.ts";

const ORDER: Act[] = ["clean", "tampered", "stale"];

/** Drives the three verified acts (README.md "Status": clean / tampered /
 * stale) by switching which manifest is compared and which registry the
 * certificate panel reads from — both real, already-deployed on-chain
 * state, not fabricated for the demo. */
export function DemoPanel({ act, onChange }: { act: Act; onChange: (act: Act) => void }) {
  return (
    <div className="demo-panel">
      <p className="demo-panel-label">Demo</p>
      <div className="demo-panel-acts">
        {ORDER.map((a) => (
          <button
            key={a}
            type="button"
            className={`demo-act ${a === act ? "demo-act-active" : ""}`}
            onClick={() => onChange(a)}
          >
            <span className="demo-act-label">{ACTS[a].label}</span>
            <span className="demo-act-desc">{ACTS[a].description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
