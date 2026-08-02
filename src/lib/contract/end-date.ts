/**
 * A contract's end date: the one its own inputs calculate, the window a user may
 * override it within, and whether the date currently showing is an override.
 *
 * The end date is normally derived from the start date, the interval, and the
 * cycle count. A user may move it within a tolerance window, and that override
 * has to survive edits elsewhere in the form while still being discarded when
 * the inputs it was an override *of* change — otherwise a corrected cycle count
 * would keep an end date that no longer answers to it.
 *
 * The arithmetic itself belongs to the contract domain and is imported; what is
 * here is the conversion between that arithmetic and the calendar widget, and
 * the rules deciding when an override survives.
 */
import type { Contract } from '$lib/api/database/schema';
import { parseDateInput, toCalendarDate } from '$lib/common/utils/date';
import {
	getContractCycleCountForPeriod,
	getContractEndDateForCycles,
	getContractEndDateWindow
} from '$lib/contract/contract';
import type { CalendarDate, DateValue } from '@internationalized/date';

/** The inputs an end date is calculated from. */
export type ContractEndDateInputs = {
	start: CalendarDate | undefined;
	interval: Contract['interval'];
	cycles: string;
};

/** The range an end date may be moved within while still matching whole cycles. */
export type ContractEndDateWindow = {
	start: CalendarDate | undefined;
	end: CalendarDate | undefined;
};

/** What is remembered about the end date between one look at the form and the next. */
export type ContractEndDateState = {
	/** Whether the end date differs from the one the inputs calculate. */
	isManuallyEdited: boolean;
	/** The inputs the end date was last calculated from; `undefined` before the first look. */
	lastCalculationKey: string | undefined;
	/** The end date last seen; `undefined` before any has been seen. */
	lastObservedEndDate: string | undefined;
};

/**
 * A state change, and whether the caller should recalculate the end date.
 *
 * **When nothing changed, `state` is the very object that was passed in.** The
 * caller holds this state in one place and writes every result back to it, so a
 * fresh object on an unchanged path would be a new value to anything watching —
 * and two watchers each rewriting it would never settle.
 */
export type ContractEndDateInputsChange = {
	state: ContractEndDateState;
	/** When true, replace the end date with the calculated one and shut the picker. */
	appliesCalculatedEndDate: boolean;
};

/**
 * A state change, and whether the caller should shut the end-date picker.
 *
 * Carries the same unchanged-state identity guarantee as
 * [`ContractEndDateInputsChange`], for the same reason.
 */
export type ContractEndDateChange = {
	state: ContractEndDateState;
	closesPicker: boolean;
};

/** A cycle count as a positive whole number, or `undefined` if it is not one. */
const parseCycleCount = (value: string) => {
	const parsedValue = Number(value);

	if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
		return undefined;
	}

	return parsedValue;
};

/**
 * The number of whole cycles between two dates, as the form holds it. Falls back
 * to a single cycle, which is what an incomplete or unreadable period means to a
 * form that must always show something.
 */
export const getContractCycleCount = (
	start: CalendarDate | undefined,
	end: CalendarDate | undefined,
	interval: Contract['interval']
) => {
	if (!start || !end) return '1';

	return String(
		Math.max(
			getContractCycleCountForPeriod({
				start: parseDateInput(start.toString()),
				end: parseDateInput(end.toString()),
				interval
			}) ?? 1,
			1
		)
	);
};

/** The end date these inputs calculate, or `undefined` while they are incomplete. */
export const getCalculatedContractEndDate = ({
	start,
	interval,
	cycles
}: ContractEndDateInputs) => {
	const cycleCount = parseCycleCount(cycles);

	if (!start || !cycleCount) {
		return undefined;
	}

	return toCalendarDate(
		getContractEndDateForCycles(parseDateInput(start.toString()), interval, cycleCount)
	);
};

/** The range these inputs allow an override within, or `undefined` while they are incomplete. */
export const getManualContractEndDateWindow = ({
	start,
	interval,
	cycles
}: ContractEndDateInputs): ContractEndDateWindow | undefined => {
	const cycleCount = parseCycleCount(cycles);

	if (!start || !cycleCount) {
		return undefined;
	}

	const window = getContractEndDateWindow(parseDateInput(start.toString()), interval, cycleCount);

	if (!window) {
		return undefined;
	}

	return { start: toCalendarDate(window.start), end: toCalendarDate(window.end) };
};

/** Whether `date` is a selectable end date. A half-open window admits nothing. */
export const isContractEndDateWithinWindow = (date: DateValue, window: ContractEndDateWindow) => {
	if (!window.start || !window.end) {
		return false;
	}

	return date.compare(window.start) >= 0 && date.compare(window.end) <= 0;
};

/**
 * The identity of one set of calculation inputs. Two sets producing the same key
 * calculate the same end date, so a change in the key is what makes an existing
 * override stale.
 */
export const getContractEndDateCalculationKey = ({
	start,
	interval,
	cycles
}: ContractEndDateInputs) => `${start?.toString() ?? ''}|${interval}|${cycles}`;

/** The state of a form that has not been opened, or has just been shut. */
export const createContractEndDateState = (): ContractEndDateState => ({
	isManuallyEdited: false,
	lastCalculationKey: undefined,
	lastObservedEndDate: undefined
});

/**
 * The state of a form just opened on an existing contract. A stored end date
 * that does not match what its own inputs calculate is one somebody overrode,
 * and reopening the form must not quietly undo that.
 */
export const hydrateContractEndDateState = ({
	endDate,
	calculatedEndDate,
	calculationKey
}: {
	endDate: string;
	calculatedEndDate: string;
	calculationKey: string;
}): ContractEndDateState => ({
	isManuallyEdited: endDate !== calculatedEndDate,
	lastCalculationKey: calculationKey,
	lastObservedEndDate: endDate
});

/**
 * Take account of the calculation inputs as they stand.
 *
 * The first look only records them: the end date already on the form was
 * calculated from those same inputs, so recalculating it would be a no-op that
 * discards an override the form was opened holding.
 */
export const observeContractEndDateInputs = (
	state: ContractEndDateState,
	calculationKey: string
): ContractEndDateInputsChange => {
	if (state.lastCalculationKey === undefined) {
		return {
			state: { ...state, lastCalculationKey: calculationKey },
			appliesCalculatedEndDate: false
		};
	}

	if (state.lastCalculationKey === calculationKey) {
		return { state, appliesCalculatedEndDate: false };
	}

	return {
		state: { ...state, lastCalculationKey: calculationKey, isManuallyEdited: false },
		appliesCalculatedEndDate: true
	};
};

/**
 * Take account of the end date as it stands.
 *
 * Only a date that moved while the picker was open counts as the user's doing —
 * the same field also moves when the form hydrates and when a recalculation
 * writes to it, and neither is an override. A date arriving before any has been
 * seen is hydration whatever the picker is doing.
 */
export const observeContractEndDate = (
	state: ContractEndDateState,
	{
		endDate,
		calculatedEndDate,
		isPickerOpen
	}: { endDate: string; calculatedEndDate: string; isPickerOpen: boolean }
): ContractEndDateChange => {
	if (state.lastObservedEndDate === endDate) {
		return { state, closesPicker: false };
	}

	const wasChosenByTheUser = isPickerOpen && state.lastObservedEndDate !== undefined;
	const observed = { ...state, lastObservedEndDate: endDate };

	if (!wasChosenByTheUser) {
		return { state: observed, closesPicker: false };
	}

	return {
		state: { ...observed, isManuallyEdited: endDate !== calculatedEndDate },
		closesPicker: true
	};
};
