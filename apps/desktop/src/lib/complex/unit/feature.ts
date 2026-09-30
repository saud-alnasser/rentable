import { defineFeature } from '$lib/feature/feature';
import { UNIT_KIND } from '../complex';
import units from './transfer';

/** The unit declares no router: its procedures are the complex's, served under `complex.units`. */
export default defineFeature({
	name: 'unit',
	kind: UNIT_KIND,
	prefix: ['complexes', 'units'],
	transfer: [units]
});
