import complex from '$lib/complex/feature';
import contract from '$lib/contract/feature';
import { defineFeature } from '$lib/feature/feature';
import history from '$lib/history/feature';
import tenant from '$lib/tenant/feature';
import workspace from '$lib/workspace/feature';
import app from './app';

/**
 * THE FEATURES
 *
 * every feature and capability the root router mounts, each under its declared name. This is the
 * one place that names them all: adding one is a line here, and removing one is taking it out.
 *
 * **It holds what the root mounts, and nothing mounted deeper.** Payment and the dashboard are
 * mounted by the contract router, and settings, sync and the organization by the app router, so
 * their paths stay `contract.payment.*` and `app.settings.*` until each is mounted here.
 */
export const features = [
	defineFeature({ name: 'app', router: app }),
	tenant,
	complex,
	contract,
	history,
	workspace
] as const;
