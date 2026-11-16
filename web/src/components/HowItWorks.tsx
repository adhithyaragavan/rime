const ROWS = [
  [
    { label: "Scan", detail: "Walk node_modules, flag supply-chain red flags" },
    { label: "Manifest", detail: "Findings + verdict, canonicalized" },
    { label: "auditHash", detail: "keccak256 of the manifest" },
  ],
  [
    { label: "report_data", detail: "Sealed into the TDX quote request" },
    { label: "Hardware quote", detail: "Signed by real Intel silicon" },
    { label: "certify()", detail: "Checked on-chain, with a freshness window" },
  ],
] as const;

/** Compact flow diagram: scan → manifest → hash → report_data → hardware
 * seal → on-chain check. Two explicit rows of three (rather than one
 * flex-wrapping row) so the connecting arrows never dangle at a wrap
 * point — the row break gets its own "↓" connector instead. */
export function HowItWorks() {
  return (
    <div className="flow">
      {ROWS.map((row, rowIndex) => (
        <div key={rowIndex}>
          {rowIndex > 0 && (
            <div className="flow-row-connector">
              <span className="flow-arrow" aria-hidden="true">↓</span>
            </div>
          )}
          <div className="flow-row">
            {row.map((step, i) => (
              <div className="flow-step-wrap" key={step.label}>
                <div className="flow-step">
                  <p className="flow-step-label">{step.label}</p>
                  <p className="flow-step-detail">{step.detail}</p>
                </div>
                {i < row.length - 1 && (
                  <span className="flow-arrow" aria-hidden="true">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
