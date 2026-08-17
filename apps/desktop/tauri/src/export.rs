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

/// One sheet, as the web layer hands it over: a header row and the rows under it, every cell
/// already rendered.
///
/// Strings throughout, and deliberately. What a column says is decided where the row is drawn —
/// an export is written from what the reader can see rather than from the query behind it — so
/// by the time anything reaches here the numbers have already been formatted in the reader's
/// locale. Typing a cell back into a number would undo that and print `1500` where the surface
/// showed `١٬٥٠٠`.
#[derive(serde::Deserialize)]
pub struct Sheet {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

/// Whether a spreadsheet would run the cell rather than show it.
///
/// The same rule the csv writer applies, restated here because it is the file format's
/// question and not the caller's: `=` and `@` always open a formula, and `+` or `-` do unless
/// what follows is a number — which is what keeps `+966…`, the shape every phone number here
/// has, from being defused into text it is not.
fn opens_a_formula(value: &str) -> bool {
    let mut characters = value.chars();

    match characters.next() {
        Some('=') | Some('@') => true,
        Some('+') | Some('-') => !matches!(
            characters.next(),
            Some(next) if next.is_ascii_digit() || matches!(next, '.' | ',' | ' ')
        ),
        _ => false,
    }
}

/// A cell as it is written: defused where a spreadsheet would otherwise execute it.
fn to_cell(value: &str) -> String {
    if opens_a_formula(value) {
        format!("'{value}")
    } else {
        value.to_owned()
    }
}

/// Write `sheet` as a workbook and answer with the path it landed on.
///
/// The format is built here rather than on the web side: the reader the import direction needs
/// is materially stronger in Rust, and the package that would have covered both directions in
/// JavaScript has no patched release on the registry. The effort's evidence,
/// `where-the-spreadsheet-format-belongs`, carries the comparison.
///
/// No byte-order mark, unlike the text export above — a workbook is a zip archive, and three
/// bytes in front of it is a corrupt file rather than a hint about encoding.
#[tauri::command]
pub async fn export_write_workbook(
    app: AppHandle,
    name: String,
    sheet: Sheet,
) -> Result<String, Error> {
    ensure_plain_name(&name)?;

    let path = export_dir(&app)?.join(&name);
    let mut workbook = rust_xlsxwriter::Workbook::new();
    let worksheet = workbook.add_worksheet();

    let write_failed = |error: rust_xlsxwriter::XlsxError| Error::Io {
        message: format!("could not build {name}: {error}"),
    };

    for (column, header) in sheet.headers.iter().enumerate() {
        worksheet
            .write_string(0, column as u16, to_cell(header))
            .map_err(write_failed)?;
    }

    for (index, row) in sheet.rows.iter().enumerate() {
        for (column, value) in row.iter().enumerate() {
            worksheet
                // the header occupies row zero, so the first record is row one.
                .write_string(index as u32 + 1, column as u16, to_cell(value))
                .map_err(write_failed)?;
        }
    }

    workbook.save(&path).map_err(|error| Error::Io {
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

    #[test]
    fn a_cell_a_spreadsheet_would_execute_is_written_as_text() {
        assert_eq!(to_cell("=cmd()"), "'=cmd()");
        assert_eq!(to_cell("@SUM(A1)"), "'@SUM(A1)");
        assert_eq!(to_cell("-cmd"), "'-cmd");
    }

    // the same carve-out the csv writer states: a phone number is the shape every tenant here
    // has, and defusing it would print a leading quote in every row.
    #[test]
    fn a_number_that_merely_starts_with_a_sign_is_left_alone() {
        assert_eq!(to_cell("+966512345678"), "+966512345678");
        assert_eq!(to_cell("-1500"), "-1500");
        assert_eq!(to_cell("-1.5"), "-1.5");
    }

    #[test]
    fn ordinary_text_passes_through_unchanged() {
        assert_eq!(to_cell("Abby Kris"), "Abby Kris");
        assert_eq!(to_cell("محمد"), "محمد");
        assert_eq!(to_cell(""), "");
    }

    // a workbook is a zip archive, so the bytes it starts with are the format's own signature.
    // The text export prepends a byte-order mark and this one must not: three bytes in front of
    // an archive is a file nothing opens.
    #[test]
    fn a_workbook_is_written_as_an_archive_with_no_byte_order_mark() {
        let mut workbook = rust_xlsxwriter::Workbook::new();
        let worksheet = workbook.add_worksheet();

        worksheet.write_string(0, 0, to_cell("الاسم")).unwrap();
        worksheet.write_string(1, 0, to_cell("=cmd()")).unwrap();

        let bytes = workbook.save_to_buffer().unwrap();

        assert_eq!(
            &bytes[0..2],
            b"PK",
            "a workbook starts with the zip signature"
        );
        assert_ne!(&bytes[0..3], UTF8_BOM.as_bytes());
    }
}
