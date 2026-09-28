import type {
	ComplexSurfaceContributions,
	UnitContributions,
	UnitSurfaceContributions
} from '$lib/complex';
import type { ContractContributions, ContractSurfaceContributions } from '$lib/contract';
import { contributionsOf } from '$lib/feature/feature';
import type { TenantContributions, TenantSurfaceContributions } from '$lib/tenant';
import { features } from './features';

/**
 * THE CONTRIBUTIONS
 *
 * what each kind needs of the features depending on it, by the kind: the one place every need is
 * named, as `features.ts` is for the routers. Each need is a type its own feature declares; the
 * features that depend on it contribute the values, in their `feature.ts` for what a router reads
 * and in their `surface.ts` for what the window reads (`$lib/feature/feature`, under *What a
 * feature contributes*).
 *
 * **Adding a need is a member of the kind's type there, and its value in the feature that
 * contributes it.** A kind needing something for the first time is a line here too.
 */
export type Contributions = {
	tenant: TenantContributions;
	unit: UnitContributions;
	contract: ContractContributions;
};

/** What each kind needs in the window: its pages, its host and its acts. */
export type SurfaceContributions = {
	tenant: TenantSurfaceContributions;
	complex: ComplexSurfaceContributions;
	unit: UnitSurfaceContributions;
	contract: ContractSurfaceContributions;
};

/**
 * Every feature's contributions, merged, for its routers: `$lib/app/router` binds them as it builds
 * the root router, and each procedure reads its kind's off `ctx.contributions`. Typed as the map
 * above, so a member nobody contributes fails the type check here.
 */
export const contributions: Contributions = contributionsOf(features);
