// Pins acceptance for #100: dashboard aggregation is deterministic given a fixed clock
// and a fake host — no ambient time reads, no reach into the desktop shell. The full
// behavioural characterization of the aggregation itself belongs to #105.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NOW, createApi, monthsFromNow, seedTenant } from '../testing.mjs';

test('dashboard timestamps come from the injected clock', async () => {
	const api = await createApi();

	const dashboard = await api.contract.dashboard();

	assert.equal(dashboard.generatedAt, NOW);
});

test('dashboard reads the notice window from the host, not the desktop shell', async () => {
	const api = await createApi({
		host: { settings: { get: async () => ({ endingSoonNoticeDays: 7, locale: 'en' }) } }
	});

	const dashboard = await api.contract.dashboard();

	assert.equal(dashboard.endingSoonNoticeDays, 7);
});

test('dashboard aggregation is identical across repeated calls', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	// an unpaid contract inside its period derives `active` and, ending within the notice
	// window, shows up in the ending-soon list — all of it derived from the fixed clock.
	await api.contract.create({
		govId: 'GOV-DASH-1',
		start: monthsFromNow(-11),
		end: monthsFromNow(1, -1),
		interval: '12m',
		cost: 1000,
		tenantId: tenant.id
	});

	const first = await api.contract.dashboard();
	const second = await api.contract.dashboard();

	assert.deepEqual(second, first);
	assert.equal(first.endingSoonContracts.length, 1);
	assert.equal(first.summary.contracts.active, 1);
});
