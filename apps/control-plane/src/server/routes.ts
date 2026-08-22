import type { FastifyInstance } from 'fastify';

import { identify } from './account.ts';
import { authenticate } from './authenticate.ts';
import { health } from './health.ts';
import { mintSchema, renameSchema, workspaceParams } from './schema.ts';
import type { ControlPlane } from './server.ts';
import { mint, rename } from './workspace.ts';

/**
 * The control plane's whole HTTP surface.
 *
 * **This is the list.** Before this file the list was a chain of `if` statements over
 * `request.method` and `request.url`, two of them against regular expressions built inline, and
 * the 404 at the bottom was what happened when you fell off it. A reader who wants to know what
 * this service answers now reads five lines.
 *
 * **`plane` is closed over and never attached to `app`.** No plugin is registered and `decorate`
 * is not called anywhere in this package, which is requirement 7 held structurally rather than
 * remembered: a handler has no path to a database except the one it was given. *Two alternatives
 * were rejected and are not re-proposed: a descriptor table walked by a registrar, which invents a
 * second framework over five routes, and a plugin per concept, which is Fastify's own idiom and
 * the shape through which `decorate` arrives one convenience at a time.*
 *
 * **`authenticated` is spread rather than registered.** `app.addHook` on the instance would attach
 * it to `/health` too, which takes no credential. Measured on 2026-08-22 by writing it that way
 * and watching a request for a route that does not exist come back 401 instead of 404. Why the
 * hook is `onRequest` rather than `preValidation` is `authenticate.ts`'s, and it is the load-
 * bearing detail of this whole change.
 */
export const routes = (app: FastifyInstance, plane: ControlPlane): void => {
	const authenticated = { onRequest: authenticate(plane) };

	app.get('/health', health(plane));

	app.post('/account/sign-in', authenticated, identify(plane));
	app.post('/session/refresh', authenticated, identify(plane));

	app.post(
		'/workspace/:workspaceId/token',
		{ ...authenticated, schema: { ...mintSchema, params: workspaceParams } },
		mint(plane)
	);

	// A sibling of the mint's path rather than a `PATCH /workspace/:id`: this surface names the act
	// in the path and takes it as a POST, and one route spelled the other way would be two
	// conventions for one client.
	app.post(
		'/workspace/:workspaceId/name',
		{ ...authenticated, schema: { ...renameSchema, params: workspaceParams } },
		rename(plane)
	);
};
