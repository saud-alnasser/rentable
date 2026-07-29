---
status: accepted
---

# One database client type, shared by tests and production

The application's database client is a sqlite-proxy-backed Drizzle client whose rows arrive
across the IPC boundary from Rust. Tests reach **that same type** by running the proxy driver
over an in-memory SQLite engine, built by applying the project's real migrations, with a shim
reproducing the row shape Rust returns — base64-encoded blobs, booleans bound as integers,
batches wrapped in a transaction.

## Considered Options

A separate test client on the synchronous driver would have been faster to build and quicker
to run. It was rejected because a test passing against a row shape production never produces
is worse than no test at all: the proxy row-mapping is real logic sitting on the language
boundary, and a test client that skips it verifies a system that does not ship.

## Consequences

The proxy row-mapping and the true schema are exercised by every test that touches the
database, rather than bypassed. The cost is that the test harness must track the Rust row
shape — if the proxy's encoding changes, the shim changes with it or the suite goes quietly
untrue.

The seed and purge scripts are explicitly **excluded**: they remain on the synchronous
driver, keep their use of transactions, and are designated development tooling rather than
application code. They are not required to adopt the application's client type.
