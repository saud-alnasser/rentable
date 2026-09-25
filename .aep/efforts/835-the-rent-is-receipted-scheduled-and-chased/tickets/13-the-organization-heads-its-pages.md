---
status: resolved
blocked-by: [11]
---

# feat(desktop): the organization heads its printed pages

## Outcome

A receipt and a schedule are headed by the organization's name, which every member holds, instead
of the workspace's.

## Acceptance Criteria

Traces requirement 13 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]].

- [x] Both hosts take the issuer from the session's organization name, never the workspace's
      (criterion 13(a), host tests on the preview opening with it).
- [x] The preview opens on the application's language, and a refusal from the host is one sentence
      (host test, carrying ticket 11's fourth criterion).
