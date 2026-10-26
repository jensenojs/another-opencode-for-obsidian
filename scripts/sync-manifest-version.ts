#!/usr/bin/env bun
/**
 * Sync manifest.json version with package.json version
 * This script is run during the 'version' lifecycle hook after package.json is updated
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const rootDir = process.cwd();

// Read package.json to get the new version
const packageJsonPath = join(rootDir, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const newVersion = packageJson.version;

if (!newVersion) {
  console.error("Error: No version found in package.json");
  process.exit(1);
}

// Read manifest.json
const manifestPath = join(rootDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

// Update version
manifest.version = newVersion;

// Write back with proper formatting (2-space indent, trailing newline)
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

// Obsidian reads versions.json to decide the minimum app version per plugin version, and the
// release workflow refuses to publish a tag that is missing here. Keep it in sync at the same
// moment the version exists, otherwise the tag ships without a release.
const versionsPath = join(rootDir, "versions.json");
const versions = JSON.parse(readFileSync(versionsPath, "utf-8")) as Record<string, string>;

if (!versions[newVersion]) {
  versions[newVersion] = manifest.minAppVersion;
  writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + "\n");
  console.log(`Added ${newVersion} -> Obsidian ${manifest.minAppVersion} to versions.json`);
}

console.log(`Updated manifest.json version to ${newVersion}`);
