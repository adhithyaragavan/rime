import type { Finding } from "@rime/shared";

export function FindingsTable({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return <p className="empty-state">No findings — dependency tree scanned clean.</p>;
  }
  return (
    <div className="findings-scroll">
      <table className="findings">
        <thead>
          <tr>
            <th>Severity</th>
            <th>Package</th>
            <th>Rule</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f, i) => (
            <tr key={i} className={`sev-${f.severity}`}>
              <td>{f.severity}</td>
              <td className="mono">{f.package}</td>
              <td>{f.rule}</td>
              <td>{f.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
