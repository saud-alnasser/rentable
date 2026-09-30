//! moving records between the application and a file the reader chose: `export` writes one, and
//! `import` reads one back as a table of text.

pub mod export;
pub(crate) mod import;
mod plugin;

pub use plugin::plugin;
