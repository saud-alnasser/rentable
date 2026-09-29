/**
 * The transfer capability: a whole workspace out as one workbook and back in from one, and a
 * directory's file read into it. Each record feature declares its sheet in its `feature.ts`
 * (`defineSheet`), the composition root hands the list over (`app/features.ts` for the router,
 * `app/transfer.ts` for the reading and writing here), and nothing in it names a concept. This
 * file is its whole API; a concept imports `$lib/transfer` and never a file inside it.
 */
export type { ExportCell, ExportSheet, ImportTable, TransferHost } from './host';
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
	defineSheet,
	type HeldName,
	type Reference,
	type Sheet,
	type Transfer,
	type TransferConcept,
	type TransferInput,
	type WorkspaceHeld,
	type WorkspaceTransfer,
	type Written
} from './sheet';
export {
	bindTransfer,
	countTransfer,
	emptyHeld,
	emptyTransfer,
	isWorkspaceImportable,
	planWorkspaceImport,
	toSheetTitle,
	toStatedNumber,
	toTransferInput,
	toWorkbook,
	transferConcepts,
	type UnresolvedReference,
	type WorkspacePlan,
	type WorkspaceSheetPlan
} from './transfer';
// the port's Tauri adapter: writing the file a reader chose and reading one back, which a list's
// export and the workspace's import and export reach through this entry rather than past it.
export { tauri as transferHost } from './tauri';
