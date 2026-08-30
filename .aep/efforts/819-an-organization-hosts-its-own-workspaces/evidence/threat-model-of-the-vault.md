---
use-when: "changing the vault's key schedule, or judging whether something proposed against it is safe"
---

# Threat model — the organization vault

Written alongside ticket 06 rather than after it. A threat model produced once the
code exists is a description of the code, and the risk it is here to answer is a
key schedule that is wrong in a way that reviews well.

# Scope

The key schedule, and only that: deriving a member key from a password, sealing an
X25519 secret key under it, sealing a credential to a member's public key,
re-sealing under a new password, and sealing an invitation under two halves.

Out of it, and each with its own answer elsewhere:

- **Whether a row is telling the truth.** That is signatures, the certificate
  chain, and ticket 07. Nothing in the vault verifies authority, and a reviewer who
  checks the vault has not checked the chain.
- **The Turso consent and the platform token.** Requirement 5 keeps it on the
  owner's machine and out of every database, and it is never sealed here.
- **Whether the interface shows a button.** What a member may do is decided by what
  their password unlocks, and the interface is not part of the defence.

# What is being protected

| Asset | Where it is | What losing it costs |
| --- | --- | --- |
| a workspace credential | `grant.sealed_credential`, sealed to a member's public key | the whole ledger of that workspace, readable and writable outside the application |
| the organization content key | `member.sealed_content_key`, sealed to a member's public key | every sealed name, email and workspace name in the organization database |
| a member's X25519 secret key | `member.sealed_secret_key`, sealed under their member key | both of the above, for that member, and every future grant to them |

The member key itself is not an asset: it is derived on demand, never written down,
and never leaves the process.

# Who the adversaries are, and what each already holds

The credential Turso mints is whole-database and there is nothing finer, so **read
access to `organization.db` is not a privilege this design can withhold from a
member.** Every adversary below is therefore assumed to hold every ciphertext, every
salt, every cost, and every public key in it.

| Adversary | Additionally holds | How they get there |
| --- | --- | --- |
| **the organization database's reader** | nothing | any member, anyone holding a leaked invitation link's read-only credential, Turso itself, anyone inside the customer's Turso account |
| **a member** | their own password | they are one |
| **an administrator** | their own password, and the credentials their own vault opens | they are one |
| **a link holder** | `invitation_secret` and a read-only organization credential | the link was forwarded, or intercepted in whatever the person sent it over |
| **a machine holder** | the local replica, the OS keyring, and whatever is in process memory | they have the laptop, signed in or not |

# What each of them gets

**The organization database's reader gets ciphertext and an offline guessing
attack, and nothing else.** They cannot derive a member key without the password,
they cannot open a sealed credential without the secret key it was sealed to, and
they cannot tell a wrong guess from a corrupted row: every failure is the same
`Integrity` error carrying the same fixed message, produced by a Poly1305 tag and by
nothing else. There is no verifier column, no password hash, no boolean, and no
branch for a modified client to take, which is the whole content of requirement 9.

**A member gets their own credentials and no more.** Their member key opens their own
sealed secret key, and that secret key opens what was sealed to their public key.
Neither reaches another member's row: the seal binds the public key, the salt and the
cost into the associated data, so a member key applied to somebody else's row fails
the tag rather than producing anything usable.

**An administrator gets exactly what a member gets.** There is no administrative key
here, no escrow copy, and no path by which one could be added without failing the
test that says so. This is what makes a reset a reissue: an administrator restores
access by building a member a fresh vault around credentials **the administrator can
already reach**, which is why `member_reset` has to report the workspaces it could
not restore. A design that made that report unnecessary would be a design with a key
that opens everything.

**A link holder gets a database they can read and a payload they cannot open.** The
invitation payload is sealed under a key mixed from both halves: HKDF-SHA256 over the
stretched generated password, salted with the secret the link carries. Neither half
alone produces the key, so a forwarded link is not an invitation and a password
overheard without the link is not one either.

**A machine holder gets whatever the signed-in session had.** This is not defended
against and is stated below.

# What the defence actually is

**Cost per guess, and nothing else.** There is no rate limiting and there cannot be:
the attacker holds the ciphertext and runs the guesses on their own hardware, so a
counter kept anywhere in this application is a counter they never consult. That makes
the Argon2id parameters a security decision rather than a performance one, and it is
why they are measured rather than assumed.

**The measurement is recorded on the ticket**, at `m = 256 MiB, t = 3, p = 1`. What
the number buys is memory: 256 MiB per parallel guess is what stops an attacker
converting money into guesses on a graphics card, where memory rather than
arithmetic is the scarce thing. Lowering `m` is the change that matters and lowering
it is a weakening; lowering `t` costs proportionally less.

**The cost lives in the row, never in the code.** Raising it later re-seals a
member's vault on their next sign-in and touches nobody else, so the parameter can
follow hardware without a migration and without a flag day. A cost compiled in is a
cost that can only be raised by a migration, and a migration that has to be scheduled
is one that is not performed.

**The password is what the whole thing rests on**, which is why requirement 13 puts a
strength floor at first change and says so on the screen rather than drawing a meter.
That floor is not this module's and is not enforced here.

# What is deliberately not defended against

Each of these is a limit somebody will later mistake for a bug, so each is written
down as behaviour.

- **A member destroying rows they cannot forge.** A full-access credential writes the
  whole database. Signatures stop a member forging authority; nothing stops them
  deleting. The answer is Turso's point-in-time restore, run by whoever administers
  the customer's account, and it is not in this application.
- **A member reading a workspace they belong to, outside the application.** Their
  credential is whole-database by construction. This was already accepted, in decision
  05 of the workspace effort.
- **A compromised machine while somebody is signed in.** The unsealed secret key is in
  memory for as long as the session needs it. `x25519-dalek` scrubs the secret half
  when it drops and the derived member key is scrubbed the same way, but a debugger,
  a core dump, or swap defeat both, and this module does not pretend otherwise.
- **A weak password.** Argon2id multiplies the cost of a guess; it does not reduce
  the number of guesses a common password needs. The strength floor is the answer and
  it is elsewhere.
- **Metadata.** Row counts, timestamps, and how many members an organization has are
  readable by anyone who can read the database. Only the named fields are sealed.
- **Turso as an adversary of availability.** This model treats Turso as a reader who
  learns nothing. It does not treat them as an adversary who withholds the database,
  which is an availability question and is the customer's account to answer.

# What would invalidate this model

Any one of these is a change of design rather than a change of code, and each has a
test standing against it today:

- **An escrow copy of any vault**, sealed to an organization key, an administration
  key, or anything else. It puts a second master secret beside the owner's Turso
  authority and makes every member's credentials openable at once.
- **A stored value the password is compared against.** A comparison is a branch, and
  a branch is what a modified client edits out.
- **`kdf_params` becoming a constant.** Raising the cost then needs a migration, so it
  is not raised.
- **A distinguishable failure.** A wrong password reporting anything other than what a
  tampered ciphertext reports hands an offline attacker an oracle.
- **Signing moving into this module.** One module answering both *can this password
  open this* and *is this row telling the truth* lets a reviewer check one and believe
  they checked both.

# Not modelled

- **The certificate chain**, which is where requirement 16 lives. Until it exists, a
  member who rewrites another member's `role` is caught by nothing.
- **The invitation's lifetime and revocation**, which are rows and are requirement
  23's.
- **The replica and the wire.** Two databases, their sync, and what Turso enforces on
  a `read-only` token are the store's and are proved against a live account, not here.
