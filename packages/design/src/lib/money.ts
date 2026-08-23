/**
 * What a form may accept as an amount of money.
 *
 * The rule used to be the browser's: a money input carries `step="0.01"`, and a native
 * constraint check refused anything finer. The shared form surface sets `novalidate`, so
 * every rule the browser was enforcing has to be stated somewhere the schema can see it.
 */

/**
 * Whether `value` is an amount the currency can represent — a whole number of halalas.
 *
 * Accepts anything the input itself accepts, including exponent notation, and rejects a
 * value with a third decimal place. `value` is the raw input string; a value that is not a
 * number at all is rejected here too, but the caller states that rule separately so its
 * message can.
 */
export const isWholeHalalas = (value: string) => {
	const amount = Number(value);

	// scaling by 100 and rounding is the obvious test and is wrong above a few million, where
	// a float can no longer represent the scaled value exactly. the round-trip through
	// `toFixed` holds at every magnitude the input accepts.
	return Number(amount.toFixed(2)) === amount;
};
