/**
 * Obtains a hardware-signed TDX quote via configfs-tsm — the standard Linux
 * interface (kernel >=6.7, CONFIG_TSM_REPORTS) any real TDX guest exposes:
 * write report_data to inblob, read the quote back from outblob. Validated
 * end-to-end against a real GCP c3-standard-4 Confidential VM (see
 * ARCHITECTURE.md's "Live agent" section) — no container platform, no
 * managed CVM host, just a VM with TDX enabled.
 *
 * MRTD/RTMRs here measure the VM's boot chain, not a specific container —
 * a real, stated tradeoff (see ARCHITECTURE.md's "Quote providers"
 * section), not an oversight. The report_data binding and freshness
 * window — the two things that carry the actual claim — are unaffected.
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hexToBytes, type Hex } from "viem";

export interface QuoteResult {
  quote: Hex;
}

/**
 * Requires root (or CAP_SYS_ADMIN-equivalent) to write under
 * /sys/kernel/config/tsm/report — the production systemd unit runs as
 * root for exactly this reason (see ARCHITECTURE.md).
 */
export class ConfigfsTsmQuoteProvider {
  private readonly basePath: string;

  constructor(basePath = "/sys/kernel/config/tsm/report") {
    this.basePath = basePath;
  }

  async getQuote(reportData: Hex): Promise<QuoteResult> {
    const bytes = hexToBytes(reportData);
    if (bytes.length !== 64) {
      throw new Error(
        `configfs-tsm report_data must be exactly 64 bytes, got ${bytes.length}. ` +
          `Right-pad the 32-byte commitment before calling getQuote.`,
      );
    }

    // A fresh directory per request — simplest way to avoid any question of
    // whether an entry can be safely reused across concurrent callers.
    const entryDir = path.join(this.basePath, `rime-${randomBytes(8).toString("hex")}`);

    try {
      await mkdir(entryDir);
    } catch (cause) {
      throw new Error(
        `Could not create ${entryDir}. If this says ENOENT or "No such device or ` +
          `address", configfs-tsm isn't active on this VM — confirm TDX is really ` +
          `enabled (--confidential-compute-type=TDX) and the tdx_guest module is ` +
          `loaded (modprobe tdx_guest).`,
        { cause },
      );
    }

    try {
      await writeFile(path.join(entryDir, "inblob"), bytes);
      const quoteBytes = await readFile(path.join(entryDir, "outblob"));
      const quote = `0x${Buffer.from(quoteBytes).toString("hex")}` as Hex;
      return { quote };
    } finally {
      await rm(entryDir, { recursive: true, force: true });
    }
  }
}
