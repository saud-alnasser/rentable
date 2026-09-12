# rentable

A desktop tracker for rent payments. It works offline, holds its workspace as a local replica of
a database on the customer's own Turso account, and syncs whenever there is a network.

## What is in here

| Path                            | What it is                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/desktop`                  | the application. A Tauri 2 shell in Rust around a SvelteKit 2 and Svelte 5 frontend                         |
| `packages/workspace-migrations` | the SQL a workspace database is built from                                                                  |
| `packages/workspace-permission` | what a member may do to a workspace, named the same way on both sides                                       |
| `packages/design`               | the design system the frontend is drawn from                                                                |
| `packages/turso-platform`       | Turso's Platform API and the migration runner in TypeScript, kept for a hosted tier and imported by nothing |
| `.aep/`                         | how work is done here. `.aep/protocol.md` is the way in                                                     |

An organization lives on a Turso account its owner holds: one database for the organization's
own directory, sealed and signed, and one per workspace. Every member's machine keeps a replica
of the workspaces they were granted and syncs with them directly. There is no service of ours in
between: the owner grants the application authority over their account once, in the browser,
and everything after that is between the members' machines and their own account.

## Before the first run

- Node 24 and pnpm 11. `engine-strict` is on, so npm and yarn will refuse.
- The Rust toolchain, plus Tauri 2's platform prerequisites: <https://tauri.app/start/prerequisites/>.
- A Turso account, to set an organization up on. The application asks for the consent on its
  first run and creates what it needs; nothing is pasted or typed.

## Setup

```sh
pnpm install
cp apps/desktop/.env.example apps/desktop/.env
```

Each variable in the `.env` carries a comment saying what it is for. Nothing in it is needed
to sign in: a person's password opens their place in an organization on this machine, with or
without a network.

## Running it

```sh
pnpm dev
```

| Command                            | What it runs                                           |
| ---------------------------------- | ------------------------------------------------------ |
| `pnpm dev`                         | the desktop app, Rust side included                    |
| `pnpm dev:desktop`                 | the same                                               |
| `pnpm dev:web`                     | the frontend alone on port 1420, with no Rust under it |
| `pnpm prototype /contracts?create` | the desktop app, opened on one route                   |

`pnpm dev:web` is for UI work only. There is no Rust side under it, so anything reaching the
database or a Tauri command fails, and the sign-in wall never clears.

## Building it

```sh
pnpm build                 # the installers
pnpm build:desktop         # the same
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

CI runs all of it as one required check called `integration`, which also runs `pnpm build:web`
and compiles the Rust binary in release profile. It never packages installers: that happens on
`main`, in the release workflow.

Some Rust tests reach a live Turso account. They are ignored by default, armed by
`RENTABLE_LIVE_TURSO=1` as well as by `--ignored`, and each one creates and removes its own
database; `apps/desktop/.env.example` names what they read.

## Working in this repository

Read `.aep/protocol.md` first. It is the bootstrap for how changes are specified, built,
reviewed and landed here, and `CLAUDE.md` and `AGENTS.md` say the same thing for two agent
runtimes. Nothing about it is restated here, because a summary in an entrypoint is a second home
for the rules and it is the copy that drifts.
