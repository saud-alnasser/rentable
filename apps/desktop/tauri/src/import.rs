//! reading a file back into the application.
//!
//! The mirror of `export`, and the halves are deliberately asymmetric: an export answers
//! *where it landed* and never asks anything, while an import has to be told which file — so
//! this one takes a path the user chose through a dialog rather than a name the web layer
//! composed.
//!
//! What it returns is a table of strings and nothing else. Which column means what, whether a
//! row is valid, and whether the set collides with itself are all questions about tenants and
//! contracts, and this module knows about neither.

use std::path::Path;

use calamine::{Data, Reader};

use crate::error::Error;

/// A file as a table: the header row, and the rows under it.
#[derive(serde::Serialize)]
pub struct Table {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

/// The byte-order mark the export writes, which is not part of the first heading.
const UTF8_BOM: &str = "\u{feff}";

/// Split one line of a delimited file, honouring the quoting RFC 4180 describes.
///
/// Written out rather than taken from a crate: the only csv this reads is the one the export
/// beside it writes, the rule is four lines long, and a dependency for it would be a third
/// party in the round trip between two functions in one repository.
fn split_row(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut characters = line.chars().peekable();

    while let Some(character) = characters.next() {
        match character {
            // a doubled quote inside a quoted field is one literal quote, which is the whole of
            // the escaping this format has.
            '"' if quoted && characters.peek() == Some(&'"') => {
                field.push('"');
                characters.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => fields.push(std::mem::take(&mut field)),
            _ => field.push(character),
        }
    }

    fields.push(field);
    fields
}

/// The leading apostrophe the writers add to a cell a spreadsheet would otherwise execute.
///
/// Taken back off on the way in, so a value that went out as text comes back as the text it
/// was. Without it a round trip grows an apostrophe every time it is made.
fn undefuse(value: &str) -> String {
    value
        .strip_prefix('\'')
        .filter(|rest| rest.starts_with(['=', '@', '+', '-']))
        .unwrap_or(value)
        .to_owned()
}

fn read_delimited(contents: &str) -> Table {
    let mut lines = contents
        .strip_prefix(UTF8_BOM)
        .unwrap_or(contents)
        .lines()
        .filter(|line| !line.trim().is_empty());

    let headers = lines
        .next()
        .map(|line| {
            split_row(line)
                .iter()
                .map(|field| undefuse(field))
                .collect()
        })
        .unwrap_or_default();
    let rows = lines
        .map(|line| {
            split_row(line)
                .iter()
                .map(|field| undefuse(field))
                .collect()
        })
        .collect();

    Table { headers, rows }
}

/// One cell of a workbook, as the text the surface would have shown.
///
/// Everything is read as written rather than as typed: the export sends figures already
/// formatted in the reader's locale, so a cell that arrives as a number is a cell some other
/// program wrote, and rendering it here with Rust's own formatting would be this application
/// guessing at a locale it was not told.
fn to_text(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        Data::String(value) => undefuse(value),
        Data::Float(value) => value.to_string(),
        Data::Int(value) => value.to_string(),
        Data::Bool(value) => value.to_string(),
        // a day, not the number of days. The export writes a date as the count the format
        // counts in and tells the sheet to display it as a date; read back as that count it
        // would be `46053`, which is a true answer to a question nobody asked.
        Data::DateTime(value) => value
            .as_datetime()
            .map(|moment| moment.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| value.as_f64().to_string()),
        Data::DateTimeIso(value) => value.clone(),
        other => other.to_string(),
    }
}

/// One sheet as a table: the first row is the heading, the rest are records.
fn to_table(sheet: &calamine::Range<Data>) -> Table {
    let mut rows = sheet
        .rows()
        .map(|row| row.iter().map(to_text).collect::<Vec<_>>());
    let headers = rows.next().unwrap_or_default();

    Table {
        headers,
        // a workbook keeps its shape, so a trailing blank row is a row of empty cells rather
        // than a short one — and it is not a record.
        rows: rows
            .filter(|row| row.iter().any(|cell| !cell.trim().is_empty()))
            .collect(),
    }
}

fn read_workbook(path: &Path) -> Result<Table, Error> {
    let mut workbook = calamine::open_workbook_auto(path).map_err(|error| Error::Io {
        message: format!("could not read {}: {error}", path.display()),
    })?;

    let sheet = workbook
        .worksheet_range_at(0)
        .ok_or_else(|| Error::InvalidInput {
            message: "the workbook has no sheets".to_owned(),
        })?
        .map_err(|error| Error::Io {
            message: format!("could not read the first sheet: {error}"),
        })?;

    Ok(to_table(&sheet))
}

/// Read a file the user chose, as a table of text.
#[tauri::command]
pub async fn import_read(path: String) -> Result<Table, Error> {
    let path = Path::new(&path);
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "csv" => {
            let contents = std::fs::read_to_string(path).map_err(|error| Error::Io {
                message: format!("could not read {}: {error}", path.display()),
            })?;

            Ok(read_delimited(&contents))
        }
        "xlsx" | "xls" | "xlsm" => read_workbook(path),
        _ => Err(Error::InvalidInput {
            message: format!("'{extension}' is not a file this can read"),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_delimited_file_is_read_as_its_headers_and_its_rows() {
        let table = read_delimited("\"name\",\"phone\"\r\n\"Abby Kris\",\"+966512345678\"");

        assert_eq!(table.headers, vec!["name", "phone"]);
        assert_eq!(table.rows, vec![vec!["Abby Kris", "+966512345678"]]);
    }

    #[test]
    fn the_byte_order_mark_the_export_writes_is_not_part_of_the_first_heading() {
        let table = read_delimited("\u{feff}\"name\"\r\n\"Abby Kris\"");

        assert_eq!(table.headers, vec!["name"]);
    }

    #[test]
    fn a_quoted_field_keeps_its_commas_and_its_doubled_quotes() {
        let table = read_delimited("\"a\"\r\n\"one, two\"\r\n\"he said \"\"hello\"\"\"");

        assert_eq!(
            table.rows,
            vec![vec!["one, two"], vec!["he said \"hello\""]]
        );
    }

    // the writers defuse a cell a spreadsheet would execute; reading takes it back off, or a
    // round trip grows an apostrophe every time it is made.
    #[test]
    fn a_defused_cell_comes_back_as_the_text_it_was() {
        let table = read_delimited("\"a\"\r\n\"'=cmd()\"\r\n\"'@SUM(A1)\"");

        assert_eq!(table.rows, vec![vec!["=cmd()"], vec!["@SUM(A1)"]]);
    }

    // a name that genuinely starts with an apostrophe is not a defused formula, and taking it
    // off would quietly edit the record.
    #[test]
    fn an_apostrophe_that_is_part_of_the_value_is_left_alone() {
        assert_eq!(undefuse("'tis"), "'tis");
        assert_eq!(undefuse("O'Brien"), "O'Brien");
    }

    #[test]
    fn a_blank_line_is_not_a_row() {
        let table = read_delimited("\"a\"\r\n\"one\"\r\n\r\n");

        assert_eq!(table.rows, vec![vec!["one"]]);
    }

    // the round trip the ticket exists for, across the format itself: the export's own writer
    // puts a sheet on disk and this module's reader takes it back off, with nothing between
    // them agreeing on a shape. A cell a spreadsheet would execute goes out defused and comes
    // back as the text it was, which is the one place the two halves could disagree.
    #[test]
    fn a_workbook_the_export_wrote_reads_back_as_the_rows_it_was_given() {
        let headers = ["name", "national id", "phone"];
        let written = [
            ["=cmd()", "1234567890", "+966512345678"],
            ["محمد", "1234567891", "+966512345679"],
        ];

        let mut workbook = rust_xlsxwriter::Workbook::new();
        let worksheet = workbook.add_worksheet();

        for (column, header) in headers.iter().enumerate() {
            worksheet
                .write_string(0, column as u16, crate::export::to_cell(header))
                .unwrap();
        }

        for (index, row) in written.iter().enumerate() {
            for (column, value) in row.iter().enumerate() {
                worksheet
                    .write_string(
                        index as u32 + 1,
                        column as u16,
                        crate::export::to_cell(value),
                    )
                    .unwrap();
            }
        }

        let bytes = workbook.save_to_buffer().unwrap();
        let mut read = calamine::open_workbook_auto_from_rs(std::io::Cursor::new(bytes)).unwrap();
        let table = to_table(&read.worksheet_range_at(0).unwrap().unwrap());

        assert_eq!(table.headers, headers);
        assert_eq!(table.rows, written.map(|row| row.to_vec()).to_vec());
    }

    // the export writes a day as the count of days the format counts in, and tells the sheet to
    // show it as a date. Read back it has to be the day again — a reader who exported `31 Jan
    // 2026` and imported `46053` was handed a true answer to a question nobody asked.
    #[test]
    fn a_date_the_export_wrote_reads_back_as_a_day_and_not_as_a_count_of_them() {
        let mut workbook = rust_xlsxwriter::Workbook::new();
        let worksheet = workbook.add_worksheet();
        let day = rust_xlsxwriter::Format::new().set_num_format("yyyy-mm-dd");

        worksheet.write_string(0, 0, "start").unwrap();
        worksheet
            .write_number_with_format(1, 0, 46_053.0, &day)
            .unwrap();

        let bytes = workbook.save_to_buffer().unwrap();
        let mut read = calamine::open_workbook_auto_from_rs(std::io::Cursor::new(bytes)).unwrap();
        let table = to_table(&read.worksheet_range_at(0).unwrap().unwrap());

        assert_eq!(table.rows, vec![vec!["2026-01-31"]]);
    }

    // the same round trip for the other format, which is written on the web side. The bytes
    // below are what `toCsv` produces for that row, pinned there by a test of its own — the
    // literal is the contract between two suites that cannot call each other.
    #[test]
    fn a_delimited_file_the_export_wrote_reads_back_as_the_row_it_was_given() {
        let table = read_delimited(
            "\u{feff}\"name\",\"national id\",\"phone\"\r\n\"'=cmd()\",\"1234567890\",\"+966512345678\"",
        );

        assert_eq!(table.headers, vec!["name", "national id", "phone"]);
        assert_eq!(
            table.rows,
            vec![vec!["=cmd()", "1234567890", "+966512345678"]]
        );
    }

    #[test]
    fn arabic_text_survives_the_read() {
        let table = read_delimited("\"الاسم\"\r\n\"محمد\"");

        assert_eq!(table.headers, vec!["الاسم"]);
        assert_eq!(table.rows, vec![vec!["محمد"]]);
    }
}
