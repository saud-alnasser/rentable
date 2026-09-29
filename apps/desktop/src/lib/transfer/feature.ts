import { defineFeature } from '$lib/feature/feature';
import transferRouter from './router';
import { sheetsOf, type SheetsOf } from './sheet';

/**
 * The transfer, declared from the features that hand it a sheet. Called once, by
 * `app/features.ts`, with the list it sits beside: a capability never imports a feature, so the
 * sheets come in from the one place that names them all.
 */
export default function transfer<const F extends readonly object[]>(features: F) {
	const sheets = sheetsOf(features) as SheetsOf<F>[];

	return defineFeature({ name: 'transfer', router: transferRouter(sheets) });
}
