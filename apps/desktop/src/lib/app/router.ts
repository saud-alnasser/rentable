import { routersOf } from '$lib/feature/feature';
import { bindContributions } from '$lib/api/contribution';
import { router } from '$lib/api/trpc';
import { contributions } from './contributions';
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

/**
 * **What the features contribute is bound as the router is built**, so every caller over it, the
 * application's and every test's, finds its procedures reading the same contributions. A
 * procedure reads them off `ctx.contributions` when it runs (`$lib/api/contribution`).
 */
bindContributions(contributions);

export type AppRouter = typeof appRouter;
