import { routersOf } from '$lib/feature/feature';
import { router } from '$lib/api/trpc';
import { features } from './features';

/**
 * ROUTER
 *
 * the root router, built from the list of features: each one's router mounted under its name. The
 * app binds it to a real context in `caller.ts`; tests bind it to an in-memory one (see
 * `$lib/platform/database/memory`). Its type is inferred from the list, so the typed client is
 * the one a hand-written record of the same routers would give.
 */
export const appRouter = router(routersOf(features));

export type AppRouter = typeof appRouter;
