/** The whole thesis in one row — maps 1:1 onto the three checks
 * AgentRegistry.certify() actually performs (contracts/src/AgentRegistry.sol):
 * a real TDX hardware quote, this exact audited dependency tree bound into
 * its report_data, and a freshness window that expires. */
const CLAIMS = [
  { title: "Genuine TDX hardware", detail: "Verified on-chain by Automata's deployed DCAP verifier — not reimplemented." },
  { title: "This exact dependency tree", detail: "The audit's hash is sealed inside the quote's report_data field." },
  { title: "As of minutes ago", detail: "Certificates expire on a freshness window and must be renewed." },
] as const;

export function ClaimStrip() {
  return (
    <div className="claim-strip">
      {CLAIMS.map((c) => (
        <div className="claim" key={c.title}>
          <p className="claim-title">{c.title}</p>
          <p className="claim-detail">{c.detail}</p>
        </div>
      ))}
    </div>
  );
}
