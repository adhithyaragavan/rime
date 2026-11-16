/**
 * Malicious payloads are usually obfuscated to survive a human skim of the
 * package on npm's website. None of these signals is damning alone — minifiers
 * produce similar shapes — so this rule stays at "low" and exists to corroborate
 * install-script/egress findings, not to convict a package by itself.
 */
import type { Finding } from "@rime/shared";
import type { Heuristic } from "./types.ts";

const DANGEROUS_CALLS = [/\beval\s*\(/, /new\s+Function\s*\(/, /\bFunction\s*\(\s*['"]/];
const HEX_ESCAPES = /(?:\\x[0-9a-f]{2}){8,}/i;
const LONG_BASE64 = /['"][A-Za-z0-9+/]{200,}={0,2}['"]/;

export const obfuscation: Heuristic = ({ pkg, installScriptSource }) => {
  if (!installScriptSource) return [];

  const hits: string[] = [];
  if (DANGEROUS_CALLS.some((re) => re.test(installScriptSource))) hits.push("eval/Function construction");
  if (HEX_ESCAPES.test(installScriptSource)) hits.push("dense hex-escape sequence");
  if (LONG_BASE64.test(installScriptSource)) hits.push("long base64-looking literal");

  if (hits.length === 0) return [];

  return [
    {
      package: pkg.id,
      rule: "obfuscation",
      severity: "low",
      detail: `install script looks obfuscated: ${hits.join(", ")}`,
    },
  ];
};
