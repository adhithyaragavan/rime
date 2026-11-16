import { mkdtemp, mkdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DependencyContentError,
  dependencyContentHash,
  type InstalledDependency,
} from "../src/dependency-content.ts";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "rime-content-"));
  const direct = path.join(root, "node_modules", "direct");
  const transitive = path.join(direct, "node_modules", "nested");
  await mkdir(transitive, { recursive: true });
  await writeFile(path.join(direct, "package.json"), '{"name":"direct","version":"1.0.0"}');
  await writeFile(path.join(direct, "index.js"), "module.exports = 'direct';\n");
  await writeFile(path.join(transitive, "package.json"), '{"name":"nested","version":"2.0.0"}');
  await writeFile(path.join(transitive, "index.js"), "module.exports = 'nested';\n");

  const dependencies: InstalledDependency[] = [
    {
      installPath: "node_modules/direct",
      dir: direct,
      name: "direct",
      version: "1.0.0",
      integrity: "sha512-direct",
      resolved: "https://registry.example/direct.tgz",
      optional: false,
    },
    {
      installPath: "node_modules/direct/node_modules/nested",
      dir: transitive,
      name: "nested",
      version: "2.0.0",
      integrity: "sha512-nested",
      resolved: "https://registry.example/nested.tgz",
      optional: false,
    },
  ];
  return { root, direct, transitive, dependencies };
}

test("dependency content hash is stable for unchanged files and package ordering", async () => {
  const { root, dependencies } = await fixture();
  try {
    assert.equal(
      await dependencyContentHash(dependencies),
      await dependencyContentHash([...dependencies].reverse()),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dependency content hash changes for modified, added, and deleted files", async () => {
  const { root, direct, dependencies } = await fixture();
  try {
    const baseline = await dependencyContentHash(dependencies);
    const file = path.join(direct, "index.js");
    await writeFile(file, "module.exports = 'modified';\n");
    assert.notEqual(await dependencyContentHash(dependencies), baseline, "modified file must change root");

    await writeFile(file, "module.exports = 'direct';\n");
    await writeFile(path.join(direct, "added.js"), "module.exports = 'added';\n");
    assert.notEqual(await dependencyContentHash(dependencies), baseline, "added file must change root");

    await unlink(path.join(direct, "added.js"));
    await unlink(file);
    assert.notEqual(await dependencyContentHash(dependencies), baseline, "deleted file must change root");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dependency content hash includes transitive package files and lockfile metadata", async () => {
  const { root, transitive, dependencies } = await fixture();
  try {
    const baseline = await dependencyContentHash(dependencies);
    await writeFile(path.join(transitive, "index.js"), "module.exports = 'modified nested';\n");
    assert.notEqual(await dependencyContentHash(dependencies), baseline);

    await writeFile(path.join(transitive, "index.js"), "module.exports = 'nested';\n");
    const changedMetadata = dependencies.map((dependency) =>
      dependency.name === "nested" ? { ...dependency, integrity: "sha512-different" } : dependency,
    );
    assert.notEqual(await dependencyContentHash(changedMetadata), baseline);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("optional packages may be absent, but required packages may not", async () => {
  const { root, dependencies } = await fixture();
  try {
    const absent = {
      ...dependencies[0],
      installPath: "node_modules/optional-missing",
      dir: path.join(root, "node_modules", "optional-missing"),
      name: "optional-missing",
      optional: true,
    };
    await dependencyContentHash([...dependencies, absent]);
    await assert.rejects(
      () => dependencyContentHash([{ ...absent, optional: false }]),
      DependencyContentError,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dependency package symlinks are rejected", async (t) => {
  const { root, direct, dependencies } = await fixture();
  try {
    try {
      await symlink("index.js", path.join(direct, "unsafe-link.js"));
    } catch (cause) {
      if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EPERM") {
        t.skip("symlink creation is unavailable in this environment");
        return;
      }
      throw cause;
    }
    await assert.rejects(() => dependencyContentHash(dependencies), /Unsafe symlink/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
