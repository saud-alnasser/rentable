import { defineFeature } from '$lib/feature/feature';

/** The unit declares no router: its procedures are the complex's, served under `complex.units`. */
export default defineFeature({ name: 'unit', kind: 'unit', prefix: ['complexes', 'units'] });
