---
paths:
  - apps/desktop/tauri/src/organization/**
  - apps/desktop/src/lib/organization/**
  - apps/desktop/src/lib/layout/startup.ts
use-when: "the request touches an organization, its members, their vaults, or the account it lives on"
---

# Organization

An organization is a Turso account's worth of workspaces and the people who may open them, and it
lives on the customer's own account. Built by [[efforts/819-an-organization-hosts-its-own-workspaces/spec]]
across 2026-08-30 to 2026-09-12; the spec and its plan are where every design choice here is argued,
and this file is the vocabulary and the boundaries a change has to keep.

## Language

**Organization**:
One database on the owner's Turso account, `org-<id>`, holding seven tables: the organization,
its members, its workspaces, the grants, the certificates, the invitations and the migration
lease. Every name and address in it is sealed under the content key; every authority field is
signed along a chain rooted at a key the join link pins. Every member's machine keeps a replica.
_Avoid_: "the control plane" and "the account" for it. There is no service of ours, and the
account is Turso's.

**Vault**:
A member's X25519 keypair, sealed under a key Argon2id derives from their password, on their own
row. The password opens it on any machine, with or without a network; what it unseals is the
content key and every credential the member was granted. There is no escrow, no master key, and no
key that opens a vault its holder did not build, and a test tries every key an administrator holds
against every other vault to keep it so.

**Grant**:
A credential for one workspace, sealed to one member's public key. Full access is the granter's own
credential re-sealed, so an administrator grants only what they reach; read-only is minted, which
is the owner's. A grant is what says a member is in a workspace, and removing it is what says they
are not.

**Chain**:
The organization key, derived from the owner's secret and stored nowhere, certifies the owner and
each administrator; their keys sign the rows. A row is verified against the key the link pinned,
never against one read out of the database it judges.

**Link**:
`rentable://join/...`, the organization's locator: its id, name, remote, verifying key and a
read-only credential over sealed rows, and for an invitation the invitation's half of the secret.
It never expires; the invitation it names does.

**Authority**:
The Platform API token a consent produced, in the keyring on the owner's machine and nowhere else.
Creating a workspace, minting, rotating and deleting need it; an owner restored on a new machine
repeats the consent for it, because no row holds it.

## Boundaries

- **The password and the keys never cross the IPC boundary.** Every command takes a password in
  and hands facts back; the vault, the content key, the credentials and the Turso authority stay
  in Rust ([[rules/credentials]], *Client boundary*). What the web layer holds is what a screen
  draws.
- **What a member may do is what their signed row carries.** The interface draws controls from
  the session's permissions and every command refuses again on the row, through
  `MemberSession::settled` and `permission::require`; a member on a handed password reaches
  nothing else until they have chosen their own.
- **The owner's machine is the only one with the Turso authority**, and the acts that need it,
  creating and deleting workspaces, minting read-only grants, renewing and rotating credentials,
  locking out, are refused for everybody else at the command with a sentence saying to ask the
  owner. There is no request queue.
- **Removal ends synchronisation and reaches into nothing.** An ordinary removal stops renewing
  and disturbs nobody; a lock-out rotates the workspaces the member held and says beforehand how
  many others stop syncing until their application collects a fresh credential, which it does
  on its own. The replica on the removed member's disk stays readable, and a test pins it.
- **A migration reaches a workspace under a lease taken at the primary**, by whichever member
  opens it, and an older build refuses a newer workspace before reading anything.
- **Live tests reach the human's account only when asked**, each creating and removing its own
  database; [[rules/testing]] under *Tests that reach a live remote* admits them, and
  [[references/turso]] under *Never run* bounds them.
