# rentable

A desktop tracker for rent payments. It works offline, holds its workspace as a local replica of
a database on Turso, and syncs whenever there is a network.

## What is in here

| Path                            | What it is                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/desktop`                  | the application. A Tauri 2 shell in Rust around a SvelteKit 2 and Svelte 5 frontend       |
| `apps/control-plane`            | accounts, workspaces, membership, and the token a client syncs with. Plain JSON over HTTP |
| `packages/workspace-migrations` | the SQL a workspace database is built from, local or hosted                               |
| `.aep/`                         | how work is done here. `.aep/protocol.md` is the way in                                   |

A workspace is one database per account on Turso. The desktop keeps a replica and syncs with it
directly, so the control plane sits in the credential path continuously and in the data path
never: it mints tokens and reads nobody's ledger.

## Before the first run

- Node 24 and pnpm 11. `engine-strict` is on, so npm and yarn will refuse.
- The Rust toolchain, plus Tauri 2's platform prerequisites: <https://tauri.app/start/prerequisites/>.
- A Turso account with a Platform API token, an organization, and a group. The control plane
  creates one database per workspace and refuses to start without all three.
- A Google OAuth desktop client. Signing in is the only way into the application.

## Setup

```sh
pnpm install
cp apps/desktop/.env.example apps/desktop/.env
cp apps/control-plane/.env.example apps/control-plane/.env
pnpm db:migrate:control-plane
```

Fill both `.env` files in before that last command. Each variable carries a comment saying what
it is for; the one that catches people is `RENTABLE_CONTROL_PLANE_URL` in the desktop's, because
the application is a sign-in wall before it is anything else and a build told no control plane
reaches no account.

## Running it

```sh
pnpm dev
```

One command, one terminal, both halves: the control plane on its port, and the desktop app in
its window. Either half also starts on its own.

| Command                            | What it runs                                           |
| ---------------------------------- | ------------------------------------------------------ |
| `pnpm dev`                         | both                                                   |
| `pnpm dev:desktop`                 | the desktop app, Rust side included                    |
| `pnpm dev:control-plane`           | the control plane, restarting when a file changes      |
| `pnpm dev:web`                     | the frontend alone on port 1420, with no Rust under it |
| `pnpm prototype /contracts?create` | the desktop app, opened on one route                   |

`pnpm dev:web` is for UI work only. There is no Rust side under it, so anything reaching the
database or a Tauri command fails, and the sign-in wall never clears.

## Building it

```sh
pnpm build                 # both applications
pnpm build:desktop         # the installers alone
pnpm build:control-plane   # the control plane's JavaScript, into apps/control-plane/build
pnpm build:web             # the frontend bundle only
```

`pnpm build:desktop` is slow: it compiles the Rust side in release profile and then packages
every bundle target. `pnpm build:web` is the fast one, and it is what a pull request proves.

## Checking it

```sh
pnpm check      # each package's typecheck, then prettier over the whole tree
pnpm lint       # prettier and eslint
pnpm test       # the TypeScript tests, through turbo
pnpm test:rust  # the Rust tests
```

CI runs all of it as one required check called `integration`, which also runs `pnpm build:web`,
compiles the control plane, and compiles the Rust binary in release profile. It never packages
installers: that happens on `main`, in the release workflow.

## Operating the control plane

Its database is drizzle-kit's, so it is named like every other database here, from the root:

```sh
pnpm db:migrate:control-plane   # create its database, or bring it up to date
pnpm db:studio:control-plane    # browse it
```

Its operations are its own, and they run in the package that owns them:

```sh
pnpm --filter ./apps/control-plane sweep            # migrate every workspace database it knows about
pnpm --filter ./apps/control-plane decline foo@example.com   # end one account's sessions
pnpm --filter ./apps/control-plane prune-sessions   # remove session rows that can never be presented again
```

What each one is for, and what the routes and refusals are, is in
[`apps/control-plane/README.md`](apps/control-plane/README.md).

## Working in this repository

Read `.aep/protocol.md` first. It is the bootstrap for how changes are specified, built,
reviewed and landed here, and `CLAUDE.md` and `AGENTS.md` say the same thing for two agent
runtimes. Nothing about it is restated here, because a summary in an entrypoint is a second home
for the rules and it is the copy that drifts.
