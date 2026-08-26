---

---

# Question

Does reading and writing xlsx belong in a JavaScript library on the webview side or in a Rust
crate behind the host port — answered once for both directions, since #494 writes the format and
#515 reads it.

# Sources

- `npm view <package> version dist.unpackedSize dependencies` — the npm registry itself, read
  2026-08-17.
- `https://crates.io/api/v1/crates/<crate>` — the crates.io API, read 2026-08-17.
- `https://api.github.com/advisories?ecosystem=npm&affects=xlsx` — GitHub's advisory database,
  read 2026-08-17. Primary: it is the advisory record, not a write-up of one.
- `apps/desktop/tauri/src/export.rs` and `apps/desktop/src/lib/platform/tauri.ts` at
  `600f477` — the export seam as it stands.
- [[efforts/a-workspace-follows-its-user/spec]] decision 08, **decided 2026-08-17**.

# Findings

**source — the npm package with the best coverage is not installable at a patched version.**
`npm view xlsx version` answers **0.18.5**; SheetJS moved distribution off the registry after it.
GitHub's advisory database returns two **high** advisories against `xlsx`:
`GHSA-4r6h-8v6p-xvw6` (prototype pollution, affected `< 0.19.3`) and `GHSA-5pgg-2g8v-p4x9`
(ReDoS, affected `< 0.20.2`). Both report **`first_patched_version: null`** — there is no fixed
release *on npm* to upgrade to.
*conclusion:* SheetJS via npm is unavailable at any safe version. Not a trade-off, an exclusion.

**source — the remaining JavaScript options, at 2026-08-17.**

| Package | Version | Unpacked | Dependencies | Directions |
| --- | --- | --- | --- | --- |
| `exceljs` | 4.4.0 | **21.8 MB** | jszip, saxes, uuid, dayjs, tmp | read + write |
| `write-excel-file` | 4.1.1 | 1.8 MB | fflate | **write only** |
| `xlsx-populate` | 1.21.0 | 15.1 MB | cfb, sax, jszip, lodash | read + write |

**source — the Rust options, at 2026-08-17.**

| Crate | Version | Downloads | Last release | Directions |
| --- | --- | --- | --- | --- |
| `rust_xlsxwriter` | 0.98.2 | 3.6M | 2026-08-17 | **write only** |
| `calamine` | 0.36.1 | 11.1M | 2026-07-27 | **read only** (xlsx, ods, xls) |
| `umya-spreadsheet` | 3.1.0 | 976k | 2026-08-17 | read + write |

*interpretation:* the only single-package answers that cover both directions are the two heavy
JavaScript ones and `umya-spreadsheet`. Everything else is a pair.

**observation — the existing port is text-shaped, and specifically CSV-shaped.**
`export_write(app, name: String, contents: String)` writes `format!("{UTF8_BOM}{contents}")`. The
BOM is unconditional and is what makes Arabic survive a CSV opened in Excel.
*conclusion:* xlsx cannot travel through this command at all. A zip archive is not a `String`,
and a leading BOM would corrupt it even if it were. Whichever side builds the format, this port
is extended or joined by a second one.

**source — decision 08 classifies `export.write` as *Ports differently*,** because it answers
*where the file landed* and a browser cannot. It is decided, and what it changes is that `Host`
becomes a declared interface; it explicitly leaves open "what a browser client actually does for
each *Ports differently* row".
*interpretation:* the destination is what makes this row awkward off the desktop, not the content
type. A command that takes a table rather than a string is no harder for a browser to satisfy
than one that takes a string — both end in a download it cannot report a path for.

**observation — what crosses the boundary is already materialised.** A list's `exportAs.columns`
are `{ header, value: (record) => string }`; the values are rendered on the webview side before
anything is written, because an export is written from what the row shows rather than from the
query behind it.
*conclusion:* handing Rust a table of strings costs nothing in fidelity. The concept keeps
deciding what a column says; only the encoding moves.

# Conclusion

**The format belongs in Rust, as a pair of crates: `rust_xlsxwriter` to write and `calamine` to
read.**

What carries it:

- The best-covered JavaScript package is excluded outright on the advisory record, not weighed.
- Of what remains, covering both directions in JavaScript means `exceljs` at 21.8 MB unpacked
  with a five-package transitive tree, landing in the renderer — the process that displays the
  data — where the Rust side already owns the filesystem and the export destination.
- The heavy half is reading, and Rust's reader is the strongest single artifact in the whole
  comparison: `calamine`, 11.1M downloads, pure Rust, no unsafe archive handling in the webview.
- The port has to change either way, because it is CSV-shaped. Given that, changing it once
  toward a table is cheaper than encoding a zip into a string to fit a command that would then
  need the BOM suppressed for one caller.

`umya-spreadsheet` would cover both in one crate and was not chosen: it is a fifth of
`calamine`'s adoption, and a read-only reader beside a write-only writer is a smaller blast
radius than one library holding both.

# Not checked

- **Binary-size cost was not measured.** Neither crate was compiled into the shell; download
  counts and release dates are adoption, not size. The release-profile compile in `integration`
  is what would show it, and it has not been run against either.
- **`calamine` was not exercised at all.** This increment chose it on the record; #515 is where
  it is proved against a real file, and that ticket should treat the choice as directed rather
  than settled.
- **No file was opened in Excel.** Criterion 8 is manual by the spec's own Testing Strategy and
  is not covered by anything here.
- **Formula injection on the xlsx side was not investigated** — whether a writer escapes a
  leading `=` or leaves it to the caller, as the CSV writer does explicitly.
- ODS was not considered. The criterion names Excel, and no requirement asks for it.
