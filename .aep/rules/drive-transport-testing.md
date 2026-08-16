---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - tauri/src/sync/google/test/**
  - tauri/src/sync/google/transport.rs
use-when: "a Drive transport test is being written or is failing"
---

# Rule — drive transport testing

## The Drive transport is tested against a real local HTTP server

Run an HTTP server in-process and point the client at it. Do not substitute a mocked transport
trait, and never contact the live Google Drive API from a test.

*Why: a mocked trait tests the mock's idea of HTTP, so the serialisation and status handling
that actually break in production are never exercised.*

Recorded originally as ADR 0004, *Drive transport is tested against a local HTTP server*.
