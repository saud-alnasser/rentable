/**
 * Every refusal an import raises, by code. An `unknown...` names a record the file refers to and
 * does not hold, by the name the file wrote. The sentences are the interface's, under
 * `common.refusals.workspace`; see `$lib/api/refusal`.
 */
export type WorkspaceRefusalCode =
	| 'workspace.unknownComplex'
	| 'workspace.unknownContract'
	| 'workspace.unknownTenant'
	| 'workspace.unknownUnit'
	| 'workspace.nothingToImport';
