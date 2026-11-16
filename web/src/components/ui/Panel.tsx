import type { ReactNode } from "react";

export function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      {eyebrow && <p className="panel-eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {children}
    </section>
  );
}
