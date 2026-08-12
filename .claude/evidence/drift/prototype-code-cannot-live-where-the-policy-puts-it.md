---
owner: repository
kind: drift
falsifies: [.claude/policies/evidence.md]
---

# Throwaway prototype code cannot live in `.claude/position/prototypes/`

Checked against: `dbd17b1`, Vite 8.2.0 / SvelteKit 2 / Svelte 5, 2026-08-12

`.claude/policies/evidence.md` states, under **Drift findings**: *"Throwaway prototype code is
not evidence — code goes to `.claude/position/prototypes/` and is deleted; the write-up goes to
`.claude/evidence/prototypes/` and is kept."*

In this repository a prototype is a Svelte component rendered by the running application, and
Vite will not load one from that path. Importing
`.claude/position/prototypes/record-treatments.svelte` from a route fails at transform time:

```
Failed to load url C:/…/rentable/.claude/position/prototypes/record-treatments.svelte
(resolved id: …) in C:/…/rentable/src/routes/tenants/[id]/+page.svelte. Does the file exist?
```

The file existed. The path is outside what the dev server will serve, so the import never
resolves. The prototype was written to `src/lib/prototype/` instead — beside
`switcher.svelte`, which is the repository's own prototype machinery and already lives there —
and deleted once the question was answered. Being untracked, it shows in `git status`, which is
what stops it being committed silently.

**What this falsifies is the placement rule for prototype *code*, and nothing else.** The
write-up still belongs in `.claude/evidence/prototypes/` and is unaffected; so is the reason the
policy gives, which is that code and write-up must not share a name. A repository whose
prototypes are not rendered by a bundler is unaffected too — this is a constraint of the tool,
not an argument against the rule.

`.claude/policies/evidence.md` declares `owner: framework`, so it is followed as written and not
edited. This is recorded rather than healed, and belongs to whoever owns the framework's copy.
