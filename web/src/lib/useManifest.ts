import { useEffect, useState } from "react";
import type { AuditManifest } from "@rime/shared";
import { fetchManifest } from "./manifest.ts";
import { MANIFEST_URL } from "./config.ts";

export type ManifestQuery =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; manifest: AuditManifest };

export function useManifest(): ManifestQuery {
  const [state, setState] = useState<ManifestQuery>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchManifest(MANIFEST_URL)
      .then((manifest) => !cancelled && setState({ status: "ok", manifest }))
      .catch((err) => !cancelled && setState({ status: "error", message: String(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
