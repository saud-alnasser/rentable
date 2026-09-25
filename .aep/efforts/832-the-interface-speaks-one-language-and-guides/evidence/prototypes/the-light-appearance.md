---

---

# Hypothesis

A light appearance can be drawn in the same token vocabulary as the dark one (neutral surfaces,
elevation by value, blue only for state) and read as elegant and calm on real surfaces.

# Falsifier

The human rejects light outright, or asks for dark only.

# Experiment

On 2026-09-24, the same prototype worktree added a `dark` / `light` switcher. `light` removed
`dark` from `<html>` and added `proto-light`, a block overriding every `:root` token in
`packages/design/src/lib/tokens.css`, with `color-scheme: light`. Values (oklch), kept here as the
starting point for the real token block:

| Token | Value |
| --- | --- |
| background | 0.965 0 0 |
| foreground, card-foreground, popover-foreground | 0.22 0 0 |
| card, popover | 1 0 0 |
| primary, ring, sidebar-primary, sidebar-ring | 0.58 0.2 256 |
| primary-foreground, permitted-foreground, sidebar-primary-foreground | 0.99 0 0 |
| secondary | 0.935 0 0 |
| muted | 0.95 0 0 |
| muted-foreground | 0.5 0 0 |
| accent | 0.915 0 0 |
| accent-foreground, sidebar-accent-foreground | 0.18 0 0 |
| destructive | 0.56 0.21 25 |
| info | 0.52 0.15 252 |
| warning | 0.58 0.13 70 |
| success | 0.55 0.14 152 |
| permitted | 0.56 0.13 163 |
| money | 0.52 0.15 152 |
| border | 0 0 0 / 9% |
| input | 0 0 0 / 12% |
| chart-1 to chart-5 | 0.55 0.22 264, 0.6 0.15 162, 0.7 0.16 70, 0.58 0.23 304, 0.6 0.22 16 |
| sidebar | 0.945 0 0 |
| sidebar-foreground | 0.22 0 0 |
| sidebar-accent | 0.905 0 0 |
| sidebar-border | 0 0 0 / 8% |

Toasts stayed dark in the prototype, because sonner still read `mode-watcher`.

# Observation

The human kept both: "both in settings can choose any of them or based on system".

# Result

Confirmed. Light is wanted beside dark, with system as the third choice, which is what
requirement 2 already says.

# Conclusion

The token vocabulary carries a light appearance. The values above are a first draft, not a
decision; the ticket that writes the real block checks them against the plan's contrast test and
adjusts. Sonner's theme has to follow the resolved appearance, as the plan says.

# Disposition of the code

Deleted with the worktree. The palette values above are the only thing carried forward.
