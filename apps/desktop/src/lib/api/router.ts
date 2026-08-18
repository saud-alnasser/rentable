import complex from '$lib/complex/router';
import contract from '$lib/contract/router';
import history from '$lib/history/router';
import tenant from '$lib/tenant/router';
import app from './app';
import { router } from './trpc';

/**
 * ROUTER
 *
 * the root router: every domain router assembled into one. the app binds it to a real
 * context in `caller.ts`; tests bind it to an in-memory one (see
 * `$lib/platform/database/memory`).
 */
export const appRouter = router({
	app,
	tenant,
	complex,
	contract,
	history
});

export type AppRouter = typeof appRouter;
