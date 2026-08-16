---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: research
---

# Question

Can Tauri 2's `frontendDist` and its before-build hooks address a frontend that lives in a
sibling workspace package rather than beside `tauri.conf.json`?

# Sources

- **Tauri 2 configuration reference**, <https://v2.tauri.app/reference/config/> — the primary
  reference for `build.frontendDist`, `build.beforeBuildCommand` and `build.beforeDevCommand`.
  Read 2026-08-17.
- **This repository**, `tauri/tauri.conf.json` and the tree at `63a8811`. Read 2026-08-17.

# Findings

**source** — `frontendDist` accepts three kinds of value: an external URL, a path to a
directory of frontend assets, or an array of specific files to embed. The reference states
that "when a path relative to the configuration file is provided, it is read recursively and
all files are embedded in the application binary."

**interpretation** — resolution is relative to the directory holding `tauri.conf.json`, not to
a project root Tauri computes for itself. There is no root-anchoring to work around.

**observation** — this repository already relies on that. `tauri/tauri.conf.json` sets
`frontendDist: "../build"`, and the build output it names is `build/` at the repository root —
one directory *above* the config file. So a path that leaves the Tauri directory is not merely
permitted in principle; it is what ships today.

**conclusion** — a value such as `../apps/desktop/build`, or `../build` where `tauri/` has
moved inside the desktop package, is the same mechanism at a different depth.

**source** — `beforeBuildCommand` and `beforeDevCommand` accept a `cwd` option within the
command configuration.

**interpretation** — the working directory of the hook is configurable, which is the piece a
workspace needs: `pnpm build` has to run in the desktop package rather than wherever the
default would put it. Without `cwd` the hook would have to encode a `cd` or a `--filter`, both
of which push layout knowledge into a string.

**source, negative** — the reference does **not** state a default working directory for the
hooks when `cwd` is omitted, and does **not** explicitly address paths pointing outside the
Tauri directory or into a sibling package.

**interpretation** — the absence matters in one direction only. The behaviour is demonstrated
by this repository for `frontendDist`, so the gap is in the documentation rather than in the
capability. For the hooks' default `cwd`, nothing here establishes it, so the plan sets `cwd`
explicitly rather than inheriting a default it has not observed.

# Conclusion

The Tauri build is not a constraint on the layout. `frontendDist` is a path relative to
`tauri.conf.json` and already crosses out of the Tauri directory in this repository, and the
before-build hooks take an explicit `cwd`. Any of the layouts under consideration can be built
by setting those two fields.

# Not checked

- Whether `pnpm`'s workspace resolution and Tauri's asset embedding interact badly when the
  frontend output directory is a symlink — pnpm links workspace dependencies, and a build
  output directory is not one, so this was judged out of the path rather than verified.
- The default `cwd` of the before-build hooks, which the reference does not state and which
  the plan therefore does not rely on.
- Whether the Tauri CLI's own project detection (`tauri build` invoked from a package rather
  than the repository root) changes which `tauri.conf.json` it finds. The repository invokes
  the CLI through `scripts/tauri-with-env.mjs`, so the invocation is already indirected and
  the plan pins the config path there.
