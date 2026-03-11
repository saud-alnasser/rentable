import assert from 'node:assert/strict';
import test from 'node:test';

import {
	DEFAULT_DASHBOARD_ENDING_SOON_NOTICE_DAYS,
	getCollectionProgress,
	getDashboardFollowUpAmount,
	getDashboardRate,
	getOccupancyRate,
	isContractEndingSoon,
	isContractIncludedInDashboardPortfolio,
	shouldIncludeDashboardFollowUp
} from './dashboard.ts';

test('dashboard rate helper rounds to a single decimal place and handles empty totals', () => {
	assert.equal(getDashboardRate(0, 50), 0);
	assert.equal(getDashboardRate(7, 5), 71.4);
});

test('occupancy helper returns stable dashboard-friendly values', () => {
	assert.equal(getOccupancyRate(0, 0), 0);
	assert.equal(getOccupancyRate(7, 5), 71.4);
});

test('collection progress caps coverage at the due amount and keeps remaining non-negative', () => {
	assert.deepEqual(getCollectionProgress(1000, 250), {
		coveredAmount: 250,
		remainingAmount: 750,
		rate: 25
	});

	assert.deepEqual(getCollectionProgress(1000, 1600), {
		coveredAmount: 1000,
		remainingAmount: 0,
		rate: 100
	});
});

test('dashboard follow-up helpers include overdue defaulted contracts and exclude terminated ones', () => {
	assert.equal(getDashboardFollowUpAmount('active', 500, 900), 500);
	assert.equal(getDashboardFollowUpAmount('defaulted', 0, 900), 900);
	assert.equal(shouldIncludeDashboardFollowUp('defaulted', 0, 900), true);
	assert.equal(shouldIncludeDashboardFollowUp('terminated', 1000, 1000), false);
});

test('dashboard portfolio helper excludes terminated contracts from the live portfolio size', () => {
	assert.equal(isContractIncludedInDashboardPortfolio('active'), true);
	assert.equal(isContractIncludedInDashboardPortfolio('defaulted'), true);
	assert.equal(isContractIncludedInDashboardPortfolio('terminated'), false);
});

test('ending soon helper uses the default notice window and supports custom overrides', () => {
	const now = new Date('2026-01-01T00:00:00.000Z');

	assert.equal(DEFAULT_DASHBOARD_ENDING_SOON_NOTICE_DAYS, 60);
	assert.equal(isContractEndingSoon('active', new Date('2026-03-02T00:00:00.000Z'), now), true);
	assert.equal(isContractEndingSoon('fulfilled', new Date('2026-02-15T00:00:00.000Z'), now), true);
	assert.equal(isContractEndingSoon('active', new Date('2026-03-03T00:00:00.000Z'), now), false);
	assert.equal(isContractEndingSoon('active', new Date('2026-01-31T00:00:00.000Z'), now, 30), true);
	assert.equal(
		isContractEndingSoon('active', new Date('2026-02-01T00:00:00.000Z'), now, 30),
		false
	);
	assert.equal(isContractEndingSoon('defaulted', new Date('2026-02-15T00:00:00.000Z'), now), false);
	assert.equal(isContractEndingSoon('active', new Date('2025-12-31T00:00:00.000Z'), now), false);
});
