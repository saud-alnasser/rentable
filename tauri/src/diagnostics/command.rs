use crate::diagnostics::DiagnosticRecord;

/// record an event that happened in the interface.
///
/// The webview has no filesystem of its own, so its events reach the same file
/// by the same route as everything else — including the redaction, which is
/// applied here rather than trusted to the caller across the boundary.
#[tauri::command]
pub fn diagnostics_write(record: DiagnosticRecord) {
    record.write();
}
