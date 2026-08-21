/**
 * Two ways to obtain a hardware-signed TDX quote, behind one interface, so
 * attest.ts doesn't care which platform it's running on:
 *
 *   - dstack: the production path (Phala Cloud, or any dstack-managed CVM).
 *     RTMR3 measures our compose file + image digest, so hardware identity
 *     covers the actual container.
 *   - configfs-tsm: the raw-TDX path (any TDX Confidential VM without
 *     dstack — GCP's c3-standard-* is what this was proven against). MRTD/
 *     RTMRs here measure the VM's boot chain, not our workload — a real,
 *     documented reduction, not a bug. See the "What changes, and what
 *     doesn't" section of the plan this was built against
 *     (~/.claude/plans/okay-so-what-could-sleepy-donut.md) for why that's
 *     an acceptable tradeoff: auditHash + the boot-time self-check still
 *     carry code identity, and the measurement allowlist was always
 *     additive (off by default).
 *
 * Selected via RIME_QUOTE_PROVIDER=dstack|configfs-tsm, default dstack
 * (unchanged behavior for existing deployments).
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DstackClient } from "@phala/dstack-sdk";
import { hexToBytes, type Hex } from "viem";

export interface QuoteResult {
  quote: Hex;
  /** report_data as the provider itself reports embedding, when it can tell us. */
  sdkReportData?: Hex;
}

export interface QuoteProvider {
  getQuote(reportData: Hex): Promise<QuoteResult>;
}

/** Wraps @phala/dstack-sdk. See attest.ts for the string-vs-bytes and
 * missing-0x-prefix quirks already worked out for this SDK. */
export class DstackQuoteProvider implements QuoteProvider {
  private readonly client: DstackClient;

  constructor(endpoint?: string) {
    this.client = new DstackClient(endpoint ?? (process.env.DSTACK_SIMULATOR_ENDPOINT || undefined));
  }

  async getQuote(reportData: Hex): Promise<QuoteResult> {
    const response = await this.client.getQuote(hexToBytes(reportData));
    return {
      quote: withPrefix(response.quote),
      sdkReportData: response.report_data ? withPrefix(response.report_data) : undefined,
    };
  }
}

/**
 * Reads a TDX quote via configfs-tsm — the standard Linux interface
 * (kernel >=6.7, CONFIG_TSM_REPORTS) that any real TDX guest exposes,
 * dstack or not. Validated end-to-end against a GCP c3-standard-4
 * Confidential VM: write 64 bytes to inblob, read the quote from outblob.
 *
 * Requires root (or CAP_SYS_ADMIN-equivalent) to write under
 * /sys/kernel/config/tsm/report — same as the `sudo mkdir` / `sudo tee`
 * used to validate this manually. A production container using this
 * provider needs to run with that privilege.
 */
export class ConfigfsTsmQuoteProvider implements QuoteProvider {
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
      // The kernel interface doesn't echo back what it embedded the way
      // dstack's SDK does — nothing to cross-check against here. That
      // verification already happened once, empirically, against real
      // hardware (see the plan's "Result" section): our own
      // extractReportData() on a real quote matched the commitment we sent.
      return { quote };
    } finally {
      await rm(entryDir, { recursive: true, force: true });
    }
  }
}

export function makeQuoteProvider(): QuoteProvider {
  const kind = process.env.RIME_QUOTE_PROVIDER ?? "dstack";
  switch (kind) {
    case "dstack":
      return new DstackQuoteProvider();
    case "configfs-tsm":
      return new ConfigfsTsmQuoteProvider();
    default:
      throw new Error(`Unknown RIME_QUOTE_PROVIDER "${kind}" — expected "dstack" or "configfs-tsm".`);
  }
}

function withPrefix(hex: string): Hex {
  return (hex.startsWith("0x") ? hex : `0x${hex}`) as Hex;
}
