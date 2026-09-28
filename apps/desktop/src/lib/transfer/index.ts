/**
 * The transfer capability: a whole workspace out as one workbook and back in from one, and a
 * directory's file read into it. Each record feature declares its sheet in its `feature.ts`
 * (`defineSheet`), the composition root hands the list over (`app/features.ts` for the router,
 * `app/transfer.ts` for the reading and writing here), and nothing in it names a concept. This
 * file is its whole API; a concept imports `$lib/transfer` and never a file inside it.
 */
export type { ImportRejection } from './import';
export {
	UNIT_LIST_SEPARATOR,
	toContractReference,
	toGovIdFromReference,
	toTransferKey,
	toUnitParts,
	toUnitReference
} from './reference';
export {
	bindTransfer,
	countTransfer,
	defineSheet,
	emptyHeld,
	emptyTransfer,
	isWorkspaceImportable,
	planWorkspaceImport,
	toSheetTitle,
	toStatedNumber,
	toTransferInput,
	toWorkbook,
	transferConcepts,
	type HeldName,
	type Reference,
	type Sheet,
	type Transfer,
	type TransferConcept,
	type TransferInput,
	type UnresolvedReference,
	type WorkspaceHeld,
	type WorkspacePlan,
	type WorkspaceSheetPlan,
	type WorkspaceTransfer,
	type Written
} from './transfer';
