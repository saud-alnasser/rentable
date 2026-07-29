---
status: accepted
---

# Drive transport is tested against a local HTTP server

The Rust Drive transport is tested by running a real HTTP server in-process and pointing the
client at it, rather than by substituting a mocked transport trait. The live Google Drive API
is never contacted.

## Considered Options

A mock transport trait was the close call, and on the usual criteria it wins: tests stay
offline, run faster, and no abstraction is introduced that exists only for testing.

It was rejected because what actually breaks in this layer is header construction, retry and
backoff behaviour, and the mapping of error responses onto the typed error enum — and a mock
transport asserts the mock. The relocation in
[0003](0003-drive-client-relocates-to-rust.md) is the highest-variance work in the
programme, against the subsystem whose failure mode is data loss. Exercising the real HTTP
stack was judged worth the added dependency and the slower suite.

## Consequences

The test suite carries an HTTP server dependency and runs slower than a mocked equivalent.
Rust tests already run single-threaded and are not isolated from each other, so a harness
binding a port must account for that rather than assume a fresh process per test.
