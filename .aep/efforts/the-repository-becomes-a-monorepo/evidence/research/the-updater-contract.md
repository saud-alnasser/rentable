---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: research
---

# Question

The spec names "the updater feed and the `v*.*.*` tag scheme" as a single public contract that
already-installed applications read. If the release tag moves to the workspace convention
`@rentable/desktop@<version>`, what breaks for the five published releases' worth of installs
already on users' machines — and what has to be built so they can still update?

Asked because the human directed the tag change during `/implement` on #500. The spec had
answered the opposite ("single-tag, unchanged") and had done so *on the strength of that
contract claim*, so the claim had to be checked before the change could be sized.

# Sources

- **The live endpoint**, `https://github.com/saud-alnasser/rentable/releases/latest/download/latest.json`,
  followed with `curl -sIL` and then fetched. Read 2026-08-17.
- **GitHub REST documentation**, *Get the latest release*,
  <https://docs.github.com/en/rest/releases/releases#get-the-latest-release>. Read 2026-08-17.
- **tauri-action**, `src/index.ts` and `src/upload-version-json.ts` on `tauri-apps/tauri-action@dev`.
  Read 2026-08-17.
- **tauri-plugin-updater**, `plugins/updater/src/updater.rs` on `tauri-apps/plugins-workspace@v2`.
  Read 2026-08-17.
- **This repository**, `apps/desktop/tauri/tauri.conf.json`, `.github/workflows/release.yml`,
  `.github/changeset-tag.cjs`, and `gh release list`. Read 2026-08-17.

# Findings

**observation** — the installed application polls one hard-coded URL, set in
`tauri.conf.json`'s `plugins.updater.endpoints`:

```
https://github.com/saud-alnasser/rentable/releases/latest/download/latest.json
```

It contains no tag, and no version. Following it:

```
HTTP/1.1 302 Found
Location: https://github.com/saud-alnasser/rentable/releases/download/v0.12.0/latest.json
```

**interpretation** — the tag appears only in a *redirect target that GitHub computes*, never in
what the application asks for. Whatever GitHub currently calls the latest release is what the
application receives.

**source** — GitHub's documentation for that pointer: *"The latest release is the most recent
non-prerelease, non-draft release, sorted by the `created_at` attribute."*

**interpretation** — the resolution is **by date, and by draft/prerelease status. The tag name is
never consulted.** A release tagged `@rentable/desktop@0.12.1` becomes "latest" the moment it is
published, exactly as a `v0.12.1` one would.

**observation** — the manifest the endpoint returns today:

```
version:   0.12.0
pub_date:  2026-08-13T13:44:04.616Z
platforms: darwin-aarch64, …, windows-x86_64-nsis   (11 entries)
url:       https://api.github.com/repos/saud-alnasser/rentable/releases/assets/513035249
```

**interpretation** — `version` is bare semver: no `v`, no package name, nothing tag-shaped. The
asset URLs are opaque numeric ids, so they carry no tag either. Nothing in this document would
read differently under a renamed tag.

**source** — `tauri-action`'s `src/index.ts` derives the app version separately from the tag:
`const info = getInfo(targetInfo, configArg)`, then
`uploadVersionJSON(info.version, body, releaseId, artifacts, info, info.unzippedSigs)`. `tagName`
is used only for `getOrCreateRelease(tagName, …)`, and supports a `__VERSION__` placeholder that
is substituted *from* `info.version`.

**interpretation** — the manifest's `version` comes from the application, not from the tag. The
dependency runs tag ← version, never version ← tag. So a tag rename cannot corrupt the field the
updater compares.

**source** — `tauri-plugin-updater`'s `updater.rs` decides:
`None => release.version > self.current_version`, over `semver::Version`, with the field
deserialized through `Version::from_str(str.trim_start_matches('v'))`.

**interpretation** — semver comparison of the manifest field against the running binary's
version, tolerant of a leading `v` that this repository does not emit anyway. **The git tag is
absent from the decision entirely.**

**observation** — `git tag --list '@rentable/desktop@*' --sort=-version:refname` version-sorts
correctly with the prefix in place: `0.13.0`, `0.12.1`, `0.12.0`, `0.10.1`, `0.9.0`. The legacy
`v*.*.*` tags are matched by neither glob.

**observation, negative** — the repository has one ruleset and it targets `branch`;
`repos/{owner}/{repo}/tags/protection` returns 404. Nothing constrains tag names.

# Conclusion

**The tag scheme is not part of the updater contract, and the spec's claim that it is was wrong.**
What installed applications actually depend on is three things:

| The contract | Where it lives |
| --- | --- |
| the endpoint URL | `tauri.conf.json` → `plugins.updater.endpoints` |
| `latest.json`'s `version`, sorting above what is installed | written by tauri-action from the app's own version |
| the signing key | `TAURI_SIGNING_PRIVATE_KEY` / `pubkey` |

The tag is internal. **No migration mechanism is required, and none should be built** — a
hand-made `v*` tag alongside the new one would be machinery with no consumer, which is the same
thing `# Architecture` refused for `packages/schema`.

What the rename *does* break is one internal thing: `release.yml` detected `v*.*.*`, and left
alone it would have gone on finding `v0.12.0`, seen that a release already existed for it, and
never published again. That is the whole of the work.

The old `v*.*.*` tags are kept rather than deleted, because the five published releases still
point at them. They can never be newest again — the first tag cut under the new scheme supersedes
them by date, which is the only ordering that matters here.

# Not checked

- **That an installed 0.12.0 application actually updates to a release tagged the new way.** Every
  link in the chain is read from source above, but the chain has not been run end to end. This is
  exactly acceptance criterion 6, which was already a manual post-merge gate for other reasons —
  the tag change adds a second reason rather than a second gate.
- **Whether `changeset tag` would produce the same tag.** The repository uses a custom
  `changeset-tag.cjs` rather than that command, so it was not compared. It is the natural
  replacement when a second publishable package appears, and the removal condition for the
  hand-rolled script.
- **macOS and Linux updater behaviour specifically.** The reasoning is platform-independent —
  none of the three contract items varies by platform — but only the manifest was inspected, not
  a run on each.
