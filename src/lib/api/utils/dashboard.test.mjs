import assert from 'node:assert/strict';
import test from 'node:test';

import {
	getCollectionProgress,
	getDashboardFollowUpAmount,
	getDashboardRate,
	getOccupancyRate,
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
