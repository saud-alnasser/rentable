import app from './routers/app';
import complex from './routers/complex';
import contract from './routers/contract';
import tenant from './routers/tenant';
import { router } from './trpc';

/**
 * ROUTER
 *
 * the root router: every domain router assembled into one. the app binds it to a real
 * context in `mod.ts`; tests bind it to an in-memory one (see `./database/memory`).
 */
export const appRouter = router({
	app,
	tenant,
	complex,
	contract
});

export type AppRouter = typeof appRouter;
