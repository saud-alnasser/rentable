---

---

# Hypothesis

A bundled typeface pair reads better than the system stack in both English and Arabic, and one of
three candidate pairs is clearly the best fit for this application.

# Falsifier

The human prefers the system stack, or cannot tell the candidates apart on real data.

# Experiment

On 2026-09-24, in a detached worktree at `_prototype-language`, a switcher bar mounted app-wide in
`routes/+layout.svelte` set a class on `<html>` choosing one of four stacks, loaded from
prototype-only fontsource packages (5.3.0):

- `system`: the current Tailwind system stack.
- `inter-plex`: Inter Variable for Latin, IBM Plex Sans Arabic (400, 500, 600) for Arabic.
- `readex`: Readex Pro Variable alone, one family drawn for both scripts.
- `inter-noto`: Inter Variable for Latin, Noto Sans Arabic Variable for Arabic.

Latin face first, Arabic second, then `system-ui`, so the browser picks per glyph. Judged by the
human on `/contracts`, a contract record and settings, in both locales, against the developer
workspace seeded with 5,000 tenants, 10 complexes and their contracts and payments.

# Observation

The human chose `readex`.

# Result

Confirmed: a bundled face was preferred over the system stack, and one candidate was chosen.

# Conclusion

**Readex Pro** is the application's typeface for both scripts, as one variable family. It closes
the spec's typeface question. Inter with IBM Plex Sans Arabic and Inter with Noto Sans Arabic lost;
the system stack is retired.

# Disposition of the code

Deleted with the worktree. What ships is the idea only: Readex Pro bundled as subset `woff2` in the
design package and named by `--font-sans`, per the plan's *Components*. The fontsource packages are
not added to the real tree.
