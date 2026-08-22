import { sql } from 'drizzle-orm';
import type { RouteHandlerMethod } from 'fastify';

import { Refusal, UNAVAILABLE } from '../failure.ts';
import type { ControlPlane } from './server.ts';

/**
 * Whether this process can reach its database.
 *
 * **The one route that takes no credential**, which is why the authenticate hook is declared per
 * route rather than on the instance: registered globally it would make a health check sign in.
 */
export const health =
	(plane: ControlPlane): RouteHandlerMethod =>
	async () => {
		try {
			// The query is the point of the route: a process that answers without having reached its
			// database reports the one thing a health check exists to disprove.
			await plane.db.get(sql`select 1`);
		} catch {
			// 503 rather than the generic 500, because *unavailable* is the answer this route exists
			// to give and a checker keyed on the status should not have to parse a body to find out.
			// The reason stays here: it names a file or a hostname, and this route needs no
			// credential.
			throw new Refusal(UNAVAILABLE, 503, 'the control plane cannot reach its database');
		}

		// Whether the database answered, and not which one it is. The URL is on stdout at startup,
		// where the person running it can see it and a caller cannot.
		return { status: 'ok' };
	};
