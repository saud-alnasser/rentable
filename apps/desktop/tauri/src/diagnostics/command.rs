use crate::diagnostics::DiagnosticRecord;

/// record an event that happened in the interface.
///
/// The webview has no filesystem of its own, so its events reach the same file
/// by the same route as everything else — including the redaction, which is
/// applied here rather than trusted to the caller across the boundary. Invoked as
/// `plugin:diagnostics|write`: the plugin supplies the feature the Rust name repeats.
#[tauri::command(rename = "write")]
pub fn diagnostics_write(record: DiagnosticRecord) {
    record.write();
}
