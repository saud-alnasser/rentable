import type { Contract } from '$lib/api/database/schema';

type DateLike = Date | number;

const DASHBOARD_ENDING_SOON_NOTICE_DAYS = 60;

function toUtcDay(value: DateLike) {
	const date = value instanceof Date ? value : new Date(value);

	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
	return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days));
}

export function getDashboardRate(total: number, amount: number) {
	if (total <= 0) {
		return 0;
	}

	return Math.round((amount / total) * 1000) / 10;
}

export function getOccupancyRate(totalUnits: number, occupiedUnits: number) {
	return getDashboardRate(totalUnits, occupiedUnits);
}

export function getCollectionProgress(dueAmount: number, receivedAmount: number) {
	const normalizedDueAmount = Math.max(dueAmount, 0);
	const normalizedReceivedAmount = Math.max(receivedAmount, 0);
	const coveredAmount = Math.min(normalizedReceivedAmount, normalizedDueAmount);
	const remainingAmount = Math.max(normalizedDueAmount - coveredAmount, 0);

	return {
		coveredAmount,
		remainingAmount,
		rate: getDashboardRate(normalizedDueAmount, coveredAmount)
	};
}

export function isContractIncludedInDashboardPortfolio(status: Contract['status']) {
	return status !== 'terminated';
}

export function getDashboardFollowUpAmount(
	status: Contract['status'],
	monthDueAmount: number,
	outstandingAmount: number
) {
	return status === 'defaulted' ? Math.max(outstandingAmount, 0) : Math.max(monthDueAmount, 0);
}

export function shouldIncludeDashboardFollowUp(
	status: Contract['status'],
	monthDueAmount: number,
	outstandingAmount: number
) {
	return (
		status !== 'terminated' &&
		Math.max(outstandingAmount, 0) > 0 &&
		getDashboardFollowUpAmount(status, monthDueAmount, outstandingAmount) > 0
	);
}

export function isContractEndingSoon(
	status: Contract['status'],
	contractEnd: DateLike,
	now: DateLike = Date.now()
) {
	if (status !== 'active' && status !== 'fulfilled') {
		return false;
	}

	const today = toUtcDay(now);
	const end = toUtcDay(contractEnd);

	return (
		end.getTime() >= today.getTime() &&
		end.getTime() <= addUtcDays(today, DASHBOARD_ENDING_SOON_NOTICE_DAYS).getTime()
	);
}
