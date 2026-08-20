import type { AuditManifest } from "@rime/shared";

export async function fetchManifest(url: string): Promise<AuditManifest> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch manifest from ${url}: HTTP ${res.status}`);
  return (await res.json()) as AuditManifest;
}
