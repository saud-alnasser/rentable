---
status: accepted
---

# The Google Drive client relocates wholly to Rust

The OAuth client secret and a long-lived refresh token currently cross the IPC boundary into
the webview, where all Drive HTTP traffic originates. OAuth, token refresh, HTTP, manifest
handling, conflict analysis, and retention all move into Rust; the commands that hand
credentials to the web layer stop doing so; the TypeScript Drive module is deleted, leaving
no Drive network code in TypeScript.

The point is that **the credential boundary and the network boundary become the same
boundary**. Where they differ, the gap is exactly what an incident has to occupy.

## Considered Options

Keeping the client in TypeScript behind a credential-injecting proxy command — Rust holds
the secret and signs or forwards each request — was the smaller change by a wide margin, and
it was rejected. It removes the credential from the web layer but leaves the traffic there,
so a compromised dependency still sits on the connection it needs; and it adds a proxy
command whose only purpose is to keep a boundary that is in the wrong place. Record this:
it is the obvious thing to re-propose once the size of the rewrite becomes concrete.

The realistic exposure today is limited — the webview loads only local bundled code — so
this is a decision about which boundary would contain a supply-chain or XSS incident, not a
response to a live compromise.

## Consequences

Roughly fifteen hundred lines of the subsystem whose failure mode is **data loss** are
rewritten into the language with the thinner test harness. That risk is the reason the
characterization suite and the Rust module trees are sequenced first: the port lands in
designed destinations, against pinned behaviour, or it does not begin.

The Rust surface is deliberately **coarse** — approximately five operations (link, unlink,
sync, state, resolve conflict) rather than a mirror of the current fine-grained export list.
Callers observe state and answer questions instead of sequencing protocol steps, so the
protocol cannot be assembled incorrectly from outside.

Credential _lifecycle_ — rotating or revoking the existing OAuth credentials — is out of
scope. Moving the boundary is not the same as reissuing what crossed it.
