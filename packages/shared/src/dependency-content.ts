/**
 * Node-only, deterministic hashing of the dependency package files actually
 * installed on disk. This intentionally is not exported from the shared
 * browser entrypoint: scanner and agent need the exact same implementation,
 * while the dashboard must not bundle Node filesystem APIs.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import type { Hash } from "node:crypto";
import type { Hex } from "viem";

export interface InstalledDependency {
  /** Lockfile-relative install location, e.g. node_modules/a/node_modules/b. */
  installPath: string;
  /** Absolute package directory derived from installPath. */
  dir: string;
  name: string;
  version: string;
  integrity?: string;
  resolved?: string;
  optional: boolean;
}

export class DependencyContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DependencyContentError";
  }
}

/**
 * Hashes each expected package's metadata and its directly-owned files, then
 * folds those package hashes in sorted install-path order. Nested node_modules
 * are excluded from a parent walk because each lockfile entry receives its own
 * package record. Symlinks are rejected rather than followed: following one
 * could make a stable-looking package hash depend on untracked external bytes.
 */
export async function dependencyContentHash(
  dependencies: readonly InstalledDependency[],
): Promise<Hex> {
  const records = await Promise.all(
    dependencies.map(async (dependency) => ({
      installPath: normalizeInstallPath(dependency.installPath),
      hash: await hashPackage(dependency),
    })),
  );

  records.sort((a, b) => compareBytes(a.installPath, b.installPath));
  const root = createHash("sha256");
  frameText(root, "domain", "rime-dependency-content-v1");
  frameUInt(root, "package-count", records.length);
  for (const record of records) {
    frameText(root, "install-path", record.installPath);
    frameBytes(root, "package-hash", Buffer.from(record.hash, "hex"));
  }
  return `0x${root.digest("hex")}` as Hex;
}

async function hashPackage(dependency: InstalledDependency): Promise<string> {
  const installPath = normalizeInstallPath(dependency.installPath);
  const hash = createHash("sha256");
  frameText(hash, "domain", "rime-dependency-package-v1");
  frameText(hash, "install-path", installPath);
  frameText(hash, "name", dependency.name);
  frameText(hash, "version", dependency.version);
  frameText(hash, "integrity", dependency.integrity ?? "");
  frameText(hash, "resolved", dependency.resolved ?? "");
  frameText(hash, "optional", dependency.optional ? "true" : "false");

  let stat;
  try {
    stat = await lstat(dependency.dir);
  } catch (cause) {
    if (dependency.optional && isMissing(cause)) {
      frameText(hash, "presence", "absent");
      return hash.digest("hex");
    }
    throw new DependencyContentError(`Required dependency is missing: ${installPath}`);
  }

  if (stat.isSymbolicLink()) {
    throw new DependencyContentError(`Unsafe symlinked dependency root: ${installPath}`);
  }
  if (!stat.isDirectory()) {
    throw new DependencyContentError(`Dependency path is not a directory: ${installPath}`);
  }

  frameText(hash, "presence", "present");
  await hashDirectory(hash, dependency.dir, "");
  return hash.digest("hex");
}

async function hashDirectory(hash: Hash, root: string, relative: string): Promise<void> {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  entries.sort((a, b) => compareBytes(a.name, b.name));

  for (const entry of entries) {
    if (entry.name === "node_modules" && entry.isDirectory()) continue;

    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const childPath = path.join(root, childRelative);
    const stat = await lstat(childPath);

    if (stat.isSymbolicLink()) {
      throw new DependencyContentError(`Unsafe symlink in dependency package: ${childRelative}`);
    }
    if (stat.isDirectory()) {
      await hashDirectory(hash, root, childRelative);
      continue;
    }
    if (!stat.isFile()) {
      throw new DependencyContentError(`Unsupported dependency filesystem entry: ${childRelative}`);
    }

    frameText(hash, "file", normalizeRelativePath(childRelative));
    frameUInt(hash, "mode", stat.mode & 0o777);
    frameUInt(hash, "size", stat.size);
    await streamFileIntoHash(hash, childPath, stat.size);
  }
}

async function streamFileIntoHash(hash: Hash, filePath: string, expectedBytes: number): Promise<void> {
  let seen = 0;
  for await (const chunk of createReadStream(filePath)) {
    const bytes = chunk as Buffer;
    hash.update(bytes);
    seen += bytes.length;
  }
  if (seen !== expectedBytes) {
    throw new DependencyContentError(`Dependency file changed while hashing: ${filePath}`);
  }
}

function normalizeInstallPath(value: string): string {
  const normalized = normalizeRelativePath(value);
  if (!normalized.startsWith("node_modules/")) {
    throw new DependencyContentError(`Unsafe dependency install path: ${value}`);
  }
  return normalized;
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new DependencyContentError(`Unsafe relative path: ${value}`);
  }
  return normalized;
}

function frameText(hash: Hash, label: string, value: string): void {
  frameBytes(hash, label, Buffer.from(value, "utf8"));
}

function frameUInt(hash: Hash, label: string, value: number): void {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64BE(BigInt(value));
  frameBytes(hash, label, bytes);
}

function frameBytes(hash: Hash, label: string, value: Buffer): void {
  const labelBytes = Buffer.from(label, "utf8");
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(value.length));
  hash.update(labelBytes);
  hash.update(Buffer.from([0]));
  hash.update(length);
  hash.update(value);
}

function compareBytes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isMissing(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT";
}
