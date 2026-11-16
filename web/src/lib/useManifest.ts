import { useEffect, useState } from "react";
import type { AuditManifest } from "@rime/shared";
import { fetchManifest } from "./manifest.ts";

export type ManifestQuery =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; manifest: AuditManifest };

type TaggedResult = { url: string; query: ManifestQuery };

export function useManifest(url: string): ManifestQuery {
  const [result, setResult] = useState<TaggedResult>({ url, query: { status: "loading" } });

  useEffect(() => {
    let cancelled = false;
    fetchManifest(url)
      .then((manifest) => !cancelled && setResult({ url, query: { status: "ok", manifest } }))
      .catch((err) => !cancelled && setResult({ url, query: { status: "error", message: String(err) } }));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return result.url === url ? result.query : { status: "loading" };
}
