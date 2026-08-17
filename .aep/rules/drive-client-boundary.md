---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/tauri/src/sync/google/**
  - apps/desktop/src/lib/sync/**
use-when: "the request touches Drive credentials, OAuth, or where Drive network calls are made"
---

# Rule — drive client boundary

## Every Drive network call and every Drive credential stays in Rust

The OAuth client secret, the refresh token, token refresh, HTTP, manifest handling, conflict
analysis, and retention all live in `tauri/src/sync/google/`. No Drive network code exists in
TypeScript, and no command hands a credential to the web layer.

*Why: the credential boundary and the network boundary have to be the same boundary — where
they differ, the gap is exactly what an incident occupies.*

Recorded originally as ADR 0003, *The Google Drive client relocates wholly to Rust*.
