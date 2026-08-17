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
/// One cell, as the kind of thing it is rather than as the text a surface drew for it.
///
/// This used to be a string, on the reasoning that an export is written from what the reader
/// can see and typing a cell back into a number would print `1500` where the surface showed
/// `١٬٥٠٠`. That reasoning was about the wrong reader. A spreadsheet renders a *number* in
/// whatever locale the person opening it works in — the figure arrives as `١٬٥٠٠` for a reader
/// who has Arabic set, and as `1,500` for one who does not — while a string arrives as a
/// string for everyone and can be neither summed, sorted, nor filtered. The formatted text was
/// carrying a locale the file's reader had not chosen, at the cost of the file being a
/// spreadsheet at all.
///
/// So a figure crosses as a figure, a date as a date, and only what is genuinely text crosses
/// as text. What the surface shows is unchanged — this is what the *file* holds.
#[derive(serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Cell {
    Text {
        value: String,
    },
    Number {
        value: f64,
    },
    /// a whole day, as the count of days since the spreadsheet epoch the format already uses.
    Date {
        value: f64,
    },
    /// an amount of money, which is a number the file also says is money.
    Money {
        value: f64,
    },
    Empty,
}

#[derive(serde::Deserialize)]
pub struct Sheet {
    /// what the tab is called.
    ///
    /// Absent where the workbook holds one sheet: there is nothing to tell it apart from, and a
    /// tab named after the file says the file's name twice. Present once a workbook holds
    /// several, which is the whole of how a reader finds the tenants in a workspace.
    #[serde(default)]
    pub name: Option<String>,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<Cell>>,
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
pub(crate) fn to_cell(value: &str) -> String {
    if opens_a_formula(value) {
        format!("'{value}")
    } else {
        value.to_owned()
    }
}

/// The three ways a cell is spelled, built once and lent to every sheet.
///
/// A format in this crate belongs to the workbook rather than to a worksheet, so one set is
/// shared across the tabs — and a workspace whose five sheets each built their own would put
/// five identical style definitions in the file for no reader's benefit.
struct Formats {
    // a heading is a heading: bold, and the row frozen under it so a long sheet keeps saying
    // what its columns are. Both are what a person does to a sheet by hand the moment they open
    // one, and doing it here is the difference between a file and a dump.
    heading: rust_xlsxwriter::Format,
    /// whole days, spelled the way the reader's own spreadsheet spells them.
    day: rust_xlsxwriter::Format,
    // thousands separated and two places kept, so a column of amounts lines up on the decimal
    // and a total under it is a total rather than a guess.
    money: rust_xlsxwriter::Format,
}

impl Formats {
    fn new() -> Self {
        Self {
            heading: rust_xlsxwriter::Format::new().set_bold(),
            day: rust_xlsxwriter::Format::new().set_num_format("yyyy-mm-dd"),
            money: rust_xlsxwriter::Format::new().set_num_format("#,##0.00"),
        }
    }
}

/// Lay one sheet out on one worksheet.
///
/// Separate from the command because a workbook now holds one sheet or five, and the two differ
/// only in how many times this runs — a workspace whose tabs were laid out by a second copy of
/// this loop would be a second place for the heading row to drift.
fn write_sheet(
    worksheet: &mut rust_xlsxwriter::Worksheet,
    sheet: &Sheet,
    formats: &Formats,
) -> Result<(), rust_xlsxwriter::XlsxError> {
    if let Some(name) = &sheet.name {
        worksheet.set_name(name)?;
    }

    for (column, header) in sheet.headers.iter().enumerate() {
        worksheet.write_string_with_format(0, column as u16, to_cell(header), &formats.heading)?;
    }

    worksheet.set_freeze_panes(1, 0)?;

    for (index, row) in sheet.rows.iter().enumerate() {
        for (column, value) in row.iter().enumerate() {
            // the header occupies row zero, so the first record is row one.
            let row_index = index as u32 + 1;
            let column_index = column as u16;

            match value {
                Cell::Text { value } => worksheet
                    .write_string(row_index, column_index, to_cell(value))
                    .map(|_| ()),
                Cell::Number { value } => worksheet
                    .write_number(row_index, column_index, *value)
                    .map(|_| ()),
                Cell::Date { value } => worksheet
                    .write_number_with_format(row_index, column_index, *value, &formats.day)
                    .map(|_| ()),
                Cell::Money { value } => worksheet
                    .write_number_with_format(row_index, column_index, *value, &formats.money)
                    .map(|_| ()),
                Cell::Empty => Ok(()),
            }?;
        }
    }

    // wide enough to read without the reader dragging every boundary. Measured from what is in
    // the column rather than fixed, because a column of names and a column of counts are not
    // the same width and a file that needs adjusting before it can be read is half a file.
    worksheet.autofit();

    Ok(())
}

/// Write `sheets` as a workbook and answer with the path it landed on.
///
/// One sheet is a directory; several are a workspace, which is the only single file that can
/// hold the whole of one legibly — a tenant with their contracts and their payments is five
/// tables, and five files handed over in the wrong order is five chances to rebuild it wrong.
/// The tabs arrive in the order they are given, and that order is the caller's: it is the order
/// the sheets have to be read back in.
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
    sheets: Vec<Sheet>,
) -> Result<String, Error> {
    ensure_plain_name(&name)?;

    if sheets.is_empty() {
        return Err(Error::InvalidInput {
            message: "a workbook with no sheets is not a file".to_owned(),
        });
    }

    let path = export_dir(&app)?.join(&name);
    let mut workbook = rust_xlsxwriter::Workbook::new();
    let formats = Formats::new();

    for sheet in &sheets {
        let worksheet = workbook.add_worksheet();

        write_sheet(worksheet, sheet, &formats).map_err(|error| Error::Io {
            message: format!("could not build {name}: {error}"),
        })?;
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

    // a workspace is five sheets in one file, and which sheet is which is the tab's name. Read
    // back through the same library the import direction uses, because that is the only reader
    // whose answer matters.
    #[test]
    fn every_sheet_lands_under_its_own_name_in_the_order_it_was_given() {
        let sheets = vec![
            Sheet {
                name: Some("Tenants".to_owned()),
                headers: vec!["name".to_owned()],
                rows: vec![vec![Cell::Text {
                    value: "محمد".to_owned(),
                }]],
            },
            Sheet {
                name: Some("Complexes".to_owned()),
                headers: vec!["name".to_owned()],
                rows: vec![vec![Cell::Text {
                    value: "Al Nakheel".to_owned(),
                }]],
            },
        ];

        let mut workbook = rust_xlsxwriter::Workbook::new();
        let formats = Formats::new();

        for sheet in &sheets {
            write_sheet(workbook.add_worksheet(), sheet, &formats).unwrap();
        }

        let bytes = workbook.save_to_buffer().unwrap();
        let read = calamine::open_workbook_auto_from_rs(std::io::Cursor::new(bytes)).unwrap();

        assert_eq!(
            calamine::Reader::sheet_names(&read),
            vec!["Tenants", "Complexes"]
        );
    }

    // a sheet with no name is the directory export, which has one tab and nothing to tell it
    // apart from. The library's own default is what it keeps.
    #[test]
    fn a_sheet_that_names_itself_nothing_keeps_the_default_tab_name() {
        let sheet = Sheet {
            name: None,
            headers: vec!["name".to_owned()],
            rows: vec![],
        };

        let mut workbook = rust_xlsxwriter::Workbook::new();

        write_sheet(workbook.add_worksheet(), &sheet, &Formats::new()).unwrap();

        let bytes = workbook.save_to_buffer().unwrap();
        let read = calamine::open_workbook_auto_from_rs(std::io::Cursor::new(bytes)).unwrap();

        assert_eq!(calamine::Reader::sheet_names(&read), vec!["Sheet1"]);
    }
}
