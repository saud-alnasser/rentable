import { parseDate } from '@internationalized/date';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createContractEndDateState,
	getCalculatedContractEndDate,
	getContractCycleCount,
	getContractEndDateCalculationKey,
	getManualContractEndDateWindow,
	hydrateContractEndDateState,
	isContractEndDateWithinWindow,
	observeContractEndDate,
	observeContractEndDateInputs,
	type ContractEndDateInputs
} from '../end-date.ts';

const START = parseDate('2025-01-01');
const CALCULATED = '2026-01-01';
const OVERRIDDEN = '2026-01-08';

const openedOn = (endDate: string, calculatedEndDate: string = CALCULATED) =>
	hydrateContractEndDateState({
		endDate,
		calculatedEndDate,
		calculationKey: getContractEndDateCalculationKey({
			start: START,
			interval: '12m',
			cycles: '1'
		})
	});

test('one cycle ends the day before the next would begin', () => {
	assert.equal(
		getCalculatedContractEndDate({ start: START, interval: '1m', cycles: '1' })?.toString(),
		'2025-01-31'
	);
	assert.equal(
		getCalculatedContractEndDate({ start: START, interval: '12m', cycles: '1' })?.toString(),
		'2025-12-31'
	);
});

test('an end date cannot be calculated until the inputs are complete and sane', () => {
	const of = (start: ContractEndDateInputs['start'], cycles: ContractEndDateInputs['cycles']) =>
		getCalculatedContractEndDate({ start, interval: '1m', cycles });

	assert.equal(of(undefined, '1'), undefined);
	assert.equal(of(START, ''), undefined);
	assert.equal(of(START, '0'), undefined);
	assert.equal(of(START, '-2'), undefined);
	assert.equal(of(START, '1.5'), undefined);
});

test('the override window is the calculated end date plus and minus the tolerance', () => {
	const window = getManualContractEndDateWindow({ start: START, interval: '1m', cycles: '1' });

	assert.equal(window?.start?.toString(), '2025-01-26');
	assert.equal(window?.end?.toString(), '2025-02-05');
	assert.equal(
		getManualContractEndDateWindow({ start: undefined, interval: '1m', cycles: '1' }),
		undefined
	);
});

test('only a date inside the window may be picked, and a half-open window admits none', () => {
	const window = getManualContractEndDateWindow({ start: START, interval: '1m', cycles: '1' });

	assert.ok(window);
	assert.equal(isContractEndDateWithinWindow(parseDate('2025-01-31'), window), true);
	assert.equal(isContractEndDateWithinWindow(parseDate('2025-01-26'), window), true);
	assert.equal(isContractEndDateWithinWindow(parseDate('2025-02-05'), window), true);
	assert.equal(isContractEndDateWithinWindow(parseDate('2025-01-25'), window), false);
	assert.equal(isContractEndDateWithinWindow(parseDate('2025-02-06'), window), false);
	assert.equal(
		isContractEndDateWithinWindow(parseDate('2025-01-31'), { start: undefined, end: undefined }),
		false
	);
});

test('the cycle count is recovered from a stored period and never drops below one', () => {
	assert.equal(getContractCycleCount(START, parseDate('2025-03-31'), '1m'), '3');
	assert.equal(getContractCycleCount(START, parseDate('2025-12-31'), '12m'), '1');
	assert.equal(getContractCycleCount(undefined, parseDate('2025-03-31'), '1m'), '1');
	assert.equal(getContractCycleCount(START, undefined, '1m'), '1');
});

test('a fresh form has no override and nothing observed yet', () => {
	assert.deepEqual(createContractEndDateState(), {
		isManuallyEdited: false,
		lastCalculationKey: undefined,
		lastObservedEndDate: undefined
	});
});

test('the calculation key covers the start date, the interval, and the cycle count', () => {
	const of = (
		start: ContractEndDateInputs['start'],
		interval: ContractEndDateInputs['interval'],
		cycles: ContractEndDateInputs['cycles']
	) => getContractEndDateCalculationKey({ start, interval, cycles });

	assert.equal(of(START, '1m', '3'), '2025-01-01|1m|3');
	assert.notEqual(of(START, '1m', '3'), of(START, '1m', '4'));
	assert.notEqual(of(START, '1m', '3'), of(START, '3m', '3'));
	assert.notEqual(of(START, '1m', '3'), of(parseDate('2025-02-01'), '1m', '3'));
	assert.equal(of(undefined, '1m', '1'), '|1m|1');
});

test('opening a contract whose end date is the calculated one shows no override', () => {
	assert.equal(openedOn(CALCULATED).isManuallyEdited, false);
});

test('opening a contract whose end date was overridden restores the override', () => {
	assert.equal(openedOn(OVERRIDDEN).isManuallyEdited, true);
});

test('the first look at the calculation inputs latches them without recalculating', () => {
	const { state, appliesCalculatedEndDate } = observeContractEndDateInputs(
		createContractEndDateState(),
		'2025-01-01|1m|1'
	);

	assert.equal(appliesCalculatedEndDate, false);
	assert.equal(state.lastCalculationKey, '2025-01-01|1m|1');
});

test('inputs that have not moved leave the end date and the state object alone', () => {
	const opened = openedOn(OVERRIDDEN);
	assert.ok(opened.lastCalculationKey);

	const { state, appliesCalculatedEndDate } = observeContractEndDateInputs(
		opened,
		opened.lastCalculationKey
	);

	assert.equal(appliesCalculatedEndDate, false);
	assert.equal(state.isManuallyEdited, true);
	// the identity the caller depends on: an unchanged look returns the very
	// object it was given, so writing every result back cannot cycle.
	assert.equal(state, opened);
});

test('changing the inputs an override was made against discards it and recalculates', () => {
	const { state, appliesCalculatedEndDate } = observeContractEndDateInputs(
		openedOn(OVERRIDDEN),
		'2025-01-01|1m|9'
	);

	assert.equal(appliesCalculatedEndDate, true);
	assert.equal(state.isManuallyEdited, false);
	assert.equal(state.lastCalculationKey, '2025-01-01|1m|9');
});

test('an end date that has not moved is not a change, and returns the same state object', () => {
	const opened = openedOn(CALCULATED);
	const { state, closesPicker } = observeContractEndDate(opened, {
		endDate: CALCULATED,
		calculatedEndDate: CALCULATED,
		isPickerOpen: true
	});

	assert.equal(closesPicker, false);
	assert.equal(state, opened);
});

test('an end date that moves while the picker is shut is recorded but is not an override', () => {
	const { state, closesPicker } = observeContractEndDate(openedOn(CALCULATED), {
		endDate: OVERRIDDEN,
		calculatedEndDate: CALCULATED,
		isPickerOpen: false
	});

	assert.equal(closesPicker, false);
	assert.equal(state.isManuallyEdited, false);
	assert.equal(state.lastObservedEndDate, OVERRIDDEN);
});

test('picking a date other than the calculated one is an override and shuts the picker', () => {
	const { state, closesPicker } = observeContractEndDate(openedOn(CALCULATED), {
		endDate: OVERRIDDEN,
		calculatedEndDate: CALCULATED,
		isPickerOpen: true
	});

	assert.equal(closesPicker, true);
	assert.equal(state.isManuallyEdited, true);
});

test('picking the calculated date back is not an override', () => {
	const { state, closesPicker } = observeContractEndDate(openedOn(OVERRIDDEN), {
		endDate: CALCULATED,
		calculatedEndDate: CALCULATED,
		isPickerOpen: true
	});

	assert.equal(closesPicker, true);
	assert.equal(state.isManuallyEdited, false);
});

test('re-editing after an override keeps the override and re-shuts the picker', () => {
	const overridden = observeContractEndDate(openedOn(CALCULATED), {
		endDate: OVERRIDDEN,
		calculatedEndDate: CALCULATED,
		isPickerOpen: true
	}).state;

	assert.equal(overridden.isManuallyEdited, true);

	const reEdited = observeContractEndDate(overridden, {
		endDate: '2026-01-15',
		calculatedEndDate: CALCULATED,
		isPickerOpen: true
	});

	assert.equal(reEdited.closesPicker, true);
	assert.equal(reEdited.state.isManuallyEdited, true);
	assert.equal(reEdited.state.lastObservedEndDate, '2026-01-15');
});

test('a never-observed end date arriving while the picker is open is hydration, not an override', () => {
	const { state, closesPicker } = observeContractEndDate(createContractEndDateState(), {
		endDate: OVERRIDDEN,
		calculatedEndDate: CALCULATED,
		isPickerOpen: true
	});

	assert.equal(closesPicker, false);
	assert.equal(state.isManuallyEdited, false);
});
