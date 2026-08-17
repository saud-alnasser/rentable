//! writing what a surface is showing out of the application.
//!
//! There is no server, so a file is the only way anything here reaches another program. The
//! web layer composes the text; this decides where a file may land and puts it there.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::Error;

/// The byte-order mark a spreadsheet needs to read a UTF-8 file as UTF-8.
///
/// Without it Excel decodes the bytes in the system's legacy code page, and Arabic text —
/// which this application is half written in — comes back as mojibake. It costs three bytes
/// and every other reader ignores it.
const UTF8_BOM: &str = "\u{feff}";

/// Where an exported file goes: the user's downloads directory, or their documents directory
/// where the platform has no downloads one.
fn export_dir(app: &AppHandle) -> Result<PathBuf, Error> {
    let paths = app.path();

    paths
        .download_dir()
        .or_else(|_| paths.document_dir())
        .map_err(|error| Error::Io {
            message: format!("no directory to export into: {error}"),
        })
}

/// Refuse a name that would place the file anywhere but the export directory.
///
/// The name comes from the web layer, which composes it from a surface's own words — so it
/// is not hostile, and it is also not checked anywhere else.
fn ensure_plain_name(name: &str) -> Result<(), Error> {
    // the colon is here for Windows: `join` treats `C:name` as a drive-relative path and
    // discards the directory it was joined onto.
    let is_plain = !name.is_empty()
        && !name.contains(['/', '\\', ':', '\0'])
        && name != "."
        && name != ".."
        && !name.starts_with('.');

    if is_plain {
        return Ok(());
    }

    Err(Error::InvalidInput {
        message: format!("'{name}' is not a file name"),
    })
}

/// Write `contents` as a UTF-8 file and answer with the path it landed on.
///
/// An existing file of the same name is replaced: exporting the same directory twice is a
/// refresh rather than a second copy.
#[tauri::command]
pub async fn export_write(app: AppHandle, name: String, contents: String) -> Result<String, Error> {
    ensure_plain_name(&name)?;

    let path = export_dir(&app)?.join(&name);

    std::fs::write(&path, format!("{UTF8_BOM}{contents}")).map_err(|error| Error::Io {
        message: format!("could not write {}: {error}", path.display()),
    })?;

    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_name_is_accepted() {
        assert!(ensure_plain_name("tenants.csv").is_ok());
        assert!(ensure_plain_name("المستأجرون.csv").is_ok());
    }

    #[test]
    fn a_name_that_would_leave_the_export_directory_is_refused() {
        for name in ["", ".", "..", ".hidden", "a/b.csv", "a\\b.csv", "C:b.csv"] {
            assert!(
                ensure_plain_name(name).is_err(),
                "expected '{name}' to be refused"
            );
        }
    }
}
