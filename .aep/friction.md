---
use-when: "deciding what to change in AEP, between projects"
---

# Friction

- 2026-10-09 861-the-app-never-shows-something-false: pnpm check, pnpm i18n and db:generate fail in deep ticket worktrees on Windows path length; children ran the tools directly
- 2026-10-09 861-the-app-never-shows-something-false: a renamed cargo target dir kept stale absolute paths until cargo clean -p tauri
- 2026-10-09 861-the-app-never-shows-something-false: worktree release failed while the orchestrator shell stood in a child surface
- 2026-10-11 861-the-app-never-shows-something-false: the shell's IPC cannot be mocked (read-only __TAURI_INTERNALS__), so staging in the desktop window needed the application's own core import redirected
