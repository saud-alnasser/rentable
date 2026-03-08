import type { Contract } from '$lib/api/database/schema';

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
