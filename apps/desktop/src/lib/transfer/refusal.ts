/**
 * Every refusal an import raises, by code. An `unknown...` names a record the file refers to and
 * does not hold, by the name the file wrote, and `ambiguousReference` one that more than one record
 * answers to, which is refused rather than resolved to either. The sentences are the interface's, under
 * `common.refusals.workspace`; see `$lib/api/refusal`. The codes keep the `workspace.` they were
 * raised under before transfer was a capability of its own, since a code is the key its sentence
 * is looked up by.
 */
export type TransferRefusalCode =
	| 'workspace.ambiguousReference'
	| 'workspace.unknownComplex'
	| 'workspace.unknownContract'
	| 'workspace.unknownTenant'
	| 'workspace.unknownUnit'
	| 'workspace.nothingToImport';
