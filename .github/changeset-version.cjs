/* eslint-disable @typescript-eslint/no-require-imports */
// credits https://github.com/t3-oss/create-t3-app/blob/next/.github/changeset-version.js

const { execSync } = require('node:child_process');

// this script is used by the `release.yaml` workflow to update the version of the packages being released.
// the standard step is only to run `changeset version` but this does not update the `package-lock.json` or `cargo.lock` file.
// so we also run `pnpm install --lockfile-only`, which does this update also we run `cargo update`.
// this is a workaround until this is handled automatically by `changeset version`.
// see https://github.com/changesets/changesets/issues/421.
execSync('pnpm changeset version');

console.log('package.json version synced to changesets');

execSync('pnpm install --lockfile-only');

console.log('package-lock.json updated');

const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
const version = pkg.version;

const target = path.resolve('tauri/Cargo.toml');
let cargo = fs.readFileSync(target, 'utf-8');

cargo = cargo.replace(/^version\s*=\s*".*?"/m, `version = "${version}"`);

fs.writeFileSync(target, cargo);

console.log(`cargo.toml version synced to package.json: ${version}`);

execSync('cd tauri && cargo update');

console.log('cargo.lock updated');
