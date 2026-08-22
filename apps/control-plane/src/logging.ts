import { pino, type Logger } from 'pino';

/**
 * What this process says about itself.
 *
 * **At the root beside `failure.ts`, and for the same reason**: it belongs to no one concept.
 * `account/`, `session/`, `workspace/` and `server/` each name a thing this control plane holds,
 * and what the process says while holding them is not one of them.
 *
 * **`pino` rather than a logger of this repository's own, because the server already has one.**
 * Fastify builds a `pino` instance per process and stamps `reqId` on every line a request emits,
 * which is the whole of requirement 6. Writing a second mechanism beside it, so that a command and
 * a route could disagree about what a line looks like, is the thing this file exists to prevent.
 * That is why `pino` is a declared dependency here: the commands import it directly rather than
 * reaching through Fastify for something that is not a server.
 *
 * **A command's lines carry no request identifier**, because a command has no request. That is the
 * one deliberate difference between this and the server's logger, and it is not a gap to close.
 *
 * **Nothing consumes these logs.** Nothing is deployed, so no collector, no format and no field
 * names are fixed by anything yet, and the first thing that reads them is what will fix them. This
 * is therefore the default `pino` output on stdout and nothing more: designing a schema for a
 * consumer that does not exist would be settling a question nobody has asked.
 */
export const logger = (name: string): Logger => pino({ name });
