// credits https://github.com/t3-oss/create-t3-app/blob/next/.github/changeset-version.js

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execSync } = require('node:child_process');

// this script is used by the `release.yaml` workflow to update the version of the packages being released.
// the standard step is only to run `changeset version` but this does not update the `package-lock.json` or `cargo.lock` file.
// so we also run `pnpm install --lockfile-only`, which does this update also we run `cargo update`.
// this is a workaround until this is handled automatically by `changeset version`.
// see https://github.com/changesets/changesets/issues/421.
execSync('pnpm changeset version');
execSync('pnpm install --lockfile-only');
execSync('cd src-tauri && cargo update');
