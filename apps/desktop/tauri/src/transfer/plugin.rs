use tauri::plugin::{Builder, TauriPlugin};

/// the whole-workspace workbook and the single-list files: writing what a surface shows out to a
/// file the reader chose, and reading one back. It manages no state and runs no setup.
///
/// `build.rs` reads the handler below to write the plugin's permissions, so a command added to it
/// is allowed by the ACL with no second list to keep.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    Builder::new("transfer")
        .invoke_handler(tauri::generate_handler![
            super::export::export_write,
            super::export::export_write_workbook,
            super::import::import_read,
            super::import::import_read_book,
        ])
        .build()
}
