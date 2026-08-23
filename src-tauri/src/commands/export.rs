//! Export pipeline commands (M8: Export Pipeline).
//!
//! Three Tauri commands:
//! - `export_xml` — write a DPA-ISPSoft v1.0 XML snapshot to a user-chosen path.
//! - `export_csv` — write a DOPSoft-compatible tag table CSV to a user-chosen path.
//! - `copy_il_to_clipboard` — copy the current generated IL to the system clipboard.
//!
//! All three accept their inputs as command arguments (no dependency on the
//! active project state) so they can be invoked from anywhere in the UI.
//!
//! # DPA-ISPSoft v1.0 schema (XML)
//!
//! ```xml
//! <?xml version="1.0" encoding="UTF-8"?>
//! <!-- DPA-ISPSoft v1.0 - Delta DVP project export by Delta PLC AI Generator (DPA) -->
//! <Project name="..." model="..." createdAt="..." updatedAt="..." version="2">
//!   <IoTable>
//!     <Point address="X0" type="input" label="..." defaultValue="..." comment="..."/>
//!   </IoTable>
//!   <Program language="ST"><![CDATA[ ... ]]></Program>
//!   <HmiTable>
//!     <Tag address="M100" type="button" label="..." plcRef="X0" source="auto"/>
//!   </HmiTable>
//! </Project>
//! ```
//!
//! - Attribute values (label, defaultValue, comment, project name) are XML-escaped.
//! - The ST code is embedded in `<![CDATA[...]]>` and is NOT escaped, but any
//!   `]]>` terminator occurring inside it is split with the standard
//!   `]]]]><![CDATA[>` idiom so the section cannot be closed prematurely.
//! - `IoPoint` types are lowercased: `Input`→`input`, `Output`→`output`,
//!   `Relay`→`relay`, `Timer`→`timer`, `Counter`→`counter`.
//! - `HmiElementType` values are lowercased to `button`, `lamp`, `alarm`,
//!   `numericDisplay`, `setpoint` (matches the TS-side `HMIElementType`).
//! - `HmiTagSource` values are lowercased to `auto`, `manual`.
//! - A trailing newline is emitted after the closing `</Project>` tag.
//!
//! # CSV (DOPSoft tag table)
//!
//! Header: `Name,Type,PLC_Reference,Address,Comment` (one row, CRLF terminated).
//! Each subsequent row contains: `Name` = `label`, `Type` = element type,
//! `PLC_Reference` = `plcRef`, `Address` = `address` (empty if None),
//! `Comment` = empty string. CRLF line terminator. RFC 4180 escaping.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::io::AsyncWriteExt;

use crate::error::AppError;
use crate::models::hmi::{HmiElementType, HmiTable, HmiTag, HmiTagSource};
use crate::models::project::Project;

// ---------------------------------------------------------------------------
// Local mirror of the TS `IOPoint` shape
// ---------------------------------------------------------------------------

/// DPA-ISPSoft v1.0 IoTable deserialization uses a local mirror of the TS
/// `IOPoint` shape to avoid coupling to the project's internal I/O model.
/// The canonical Rust model lives in the frontend types only; the on-disk
/// `.dpa` `io_table` field is `serde_json::Value`, so we deserialize it
/// lazily here into this minimal struct.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct IoPointExport {
    address: String,
    #[serde(rename = "type")]
    point_type: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    default_value: Option<String>,
    #[serde(default)]
    comment: Option<String>,
}

// ---------------------------------------------------------------------------
// Public Tauri commands
// ---------------------------------------------------------------------------

/// Write the project as a DPA-ISPSoft v1.0 XML file.
///
/// `project` is the full `Project` payload from the frontend; `path` is the
/// absolute destination path. The path is validated, the parent directory
/// is created if missing, and the file is written atomically.
#[tauri::command]
pub async fn export_xml(project: Project, path: String) -> Result<(), AppError> {
    let p = validate_export_path(&path, "xml")?;
    let xml = build_xml(&project);

    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(AppError::Io)?;
        }
    }

    let bytes = xml.into_bytes();
    write_bytes(&p, &bytes).await?;
    Ok(())
}

/// Write the project's HMI tag table as a DOPSoft-compatible CSV file.
///
/// If the project has no HMI table or the tag list is empty, a header-only
/// CSV is written (still a valid CSV).
#[tauri::command]
pub async fn export_csv(project: Project, path: String) -> Result<(), AppError> {
    let p = validate_export_path(&path, "csv")?;
    let csv = build_csv(&project);

    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(AppError::Io)?;
        }
    }

    let bytes = csv.into_bytes();
    write_bytes(&p, &bytes).await?;
    Ok(())
}

/// Copy the given IL string to the system clipboard.
///
/// Empty / whitespace-only strings are rejected.
#[tauri::command]
pub fn copy_il_to_clipboard(il: String, app: AppHandle) -> Result<(), AppError> {
    validate_il(&il)?;
    app.clipboard()
        .write_text(il)
        .map_err(|e| AppError::Other(format!("clipboard write failed: {e}")))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Write `bytes` to `path` atomically via a sibling `.tmp` file, then rename.
async fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("out")
    ));
    {
        let mut f = tokio::fs::File::create(&tmp).await.map_err(AppError::Io)?;
        f.write_all(bytes).await.map_err(AppError::Io)?;
        f.flush().await.map_err(AppError::Io)?;
    }
    tokio::fs::rename(&tmp, path).await.map_err(AppError::Io)?;
    Ok(())
}

/// Validate a user-supplied export path. Rejects empty / whitespace / traversal,
/// requires the extension to match `expected_ext` (case-insensitive), and
/// appends the extension if missing entirely. A path that has a *different*
/// extension is rejected outright.
fn validate_export_path(path: &str, expected_ext: &str) -> Result<PathBuf, AppError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidPath("export path is empty".into()));
    }

    let candidate = PathBuf::from(trimmed);
    for component in candidate.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err(AppError::InvalidPath(format!(
                "export path contains traversal: {path}"
            )));
        }
    }

    match candidate.extension().and_then(|e| e.to_str()) {
        // Wrong extension → reject.
        Some(ext) if !ext.eq_ignore_ascii_case(expected_ext) => Err(AppError::InvalidExtension(
            format!("expected .{} extension: {path}", expected_ext),
        )),
        // Right extension (or no extension) → normalize via ensure_extension.
        _ => Ok(ensure_extension(&candidate, expected_ext)),
    }
}

/// Ensure `path` ends in the given extension. If the extension is missing or
/// differs (case-insensitive), it is added/replaced.
fn ensure_extension(path: &Path, ext: &str) -> PathBuf {
    match path.extension().and_then(|e| e.to_str()) {
        Some(existing) if existing.eq_ignore_ascii_case(ext) => path.to_path_buf(),
        _ => {
            let mut p = path.to_path_buf();
            p.set_extension(ext);
            p
        }
    }
}

/// Validate an IL string. Empty / whitespace-only inputs are rejected.
fn validate_il(il: &str) -> Result<&str, AppError> {
    if il.trim().is_empty() {
        return Err(AppError::Other("IL is empty".into()));
    }
    Ok(il)
}

// ----- escaping helpers ---------------------------------------------------

/// XML-escape the five predefined entities.
fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

/// Neutralize CDATA terminators for safe embedding inside a
/// `<![CDATA[ ... ]]>` section. Every `]]>` in `s` is replaced with the
/// standard split idiom `]]]]><![CDATA[>` (terminate the section early,
/// immediately reopen a fresh one), so attacker-controlled text cannot
/// close the CDATA block and inject raw markup into the exported XML.
fn cdata_escape(s: &str) -> String {
    s.replace("]]>", "]]]]><![CDATA[>")
}

/// RFC 4180 CSV field escape: wrap in `"` and double any internal `"`
/// when the field contains `,`, `"`, `\n`, or `\r`.
fn csv_escape(s: &str) -> String {
    let needs_quoting = s
        .chars()
        .any(|c| c == ',' || c == '"' || c == '\n' || c == '\r');
    if !needs_quoting {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        if c == '"' {
            out.push('"');
            out.push('"');
        } else {
            out.push(c);
        }
    }
    out.push('"');
    out
}

// ----- type → string helpers ----------------------------------------------

/// Map a `HmiElementType` to its lowercase XML/CSV string form.
fn hmi_element_type_str(t: HmiElementType) -> &'static str {
    match t {
        HmiElementType::Button => "button",
        HmiElementType::Lamp => "lamp",
        HmiElementType::Alarm => "alarm",
        HmiElementType::NumericDisplay => "numericDisplay",
        HmiElementType::Setpoint => "setpoint",
    }
}

/// Map a `HmiTagSource` to its lowercase XML string form.
fn hmi_tag_source_str(s: HmiTagSource) -> &'static str {
    match s {
        HmiTagSource::Auto => "auto",
        HmiTagSource::Manual => "manual",
    }
}

/// Map the TS-side `IOPointType` string to its lowercase XML form.
/// Unknown values fall through as-is (e.g. raw lowercase from a previous export).
fn io_point_type_str(t: &str) -> String {
    match t {
        "Input" => "input".to_string(),
        "Output" => "output".to_string(),
        "Relay" => "relay".to_string(),
        "Timer" => "timer".to_string(),
        "Counter" => "counter".to_string(),
        other => other.to_lowercase(),
    }
}

// ----- safe I/O table deserialization ------------------------------------

/// Try to deserialize the `io_table` JSON value into a `Vec<IoPointExport>`.
/// On any failure (missing field, wrong type, malformed JSON), return an
/// empty vec — we never panic and we never propagate the error, since the
/// caller wants a best-effort IoTable in the XML.
fn parse_io_table(value: &serde_json::Value) -> Vec<IoPointExport> {
    serde_json::from_value::<Vec<IoPointExport>>(value.clone()).unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Pure builders (testable without an `AppHandle` or filesystem)
// ---------------------------------------------------------------------------

/// Build the DPA-ISPSoft v1.0 XML document for the given project. Pure
/// function: no I/O, no async, no AppHandle.
pub fn build_xml(project: &Project) -> String {
    let name = xml_escape(&project.name);
    let model = xml_escape(project.meta.model.as_deref().unwrap_or(""));
    let created_at = rfc3339_z(&project.created_at);
    let updated_at = rfc3339_z(&project.updated_at);
    let version = project.version;

    let io_points = project
        .io_table
        .as_ref()
        .map(parse_io_table)
        .unwrap_or_default();

    let st_code = project
        .generated
        .as_ref()
        .and_then(|g| g.get("st").and_then(|v| v.as_str()))
        .unwrap_or("");

    let hmi_table_xml = match &project.hmi_table {
        Some(t) => build_hmi_table_xml(t),
        None => String::new(),
    };

    let mut out = String::with_capacity(256);
    out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    out.push_str(
        "<!-- DPA-ISPSoft v1.0 - Delta DVP project export by Delta PLC AI Generator (DPA) -->\n",
    );
    out.push_str(&format!(
        "<Project name=\"{name}\" model=\"{model}\" createdAt=\"{created_at}\" updatedAt=\"{updated_at}\" version=\"{version}\">\n"
    ));

    // IoTable
    if io_points.is_empty() {
        out.push_str("  <IoTable></IoTable>\n");
    } else {
        out.push_str("  <IoTable>\n");
        for p in &io_points {
            let addr = xml_escape(&p.address);
            let ptype = xml_escape(&io_point_type_str(&p.point_type));
            let label = xml_escape(&p.label);
            let default = xml_escape(p.default_value.as_deref().unwrap_or(""));
            let comment = xml_escape(p.comment.as_deref().unwrap_or(""));
            out.push_str(&format!(
                "    <Point address=\"{addr}\" type=\"{ptype}\" label=\"{label}\" defaultValue=\"{default}\" comment=\"{comment}\"/>\n"
            ));
        }
        out.push_str("  </IoTable>\n");
    }

    // Program (ST inside CDATA — NOT escaped, but CDATA terminators in the
    // payload are split so hostile ST content cannot close the section early).
    out.push_str("  <Program language=\"ST\"><![CDATA[");
    out.push_str(&cdata_escape(st_code));
    out.push_str("]]></Program>\n");

    // HmiTable
    if hmi_table_xml.is_empty() {
        out.push_str("  <HmiTable></HmiTable>\n");
    } else {
        out.push_str("  <HmiTable>\n");
        out.push_str(&hmi_table_xml);
        out.push_str("  </HmiTable>\n");
    }

    out.push_str("</Project>\n");
    out
}

/// Format a `DateTime<Utc>` as RFC 3339 with the `Z` suffix (e.g.
/// `2026-01-01T00:00:00Z`) instead of chrono's default `+00:00`.
fn rfc3339_z(dt: &chrono::DateTime<chrono::Utc>) -> String {
    dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn build_hmi_table_xml(table: &HmiTable) -> String {
    let mut s = String::with_capacity(64);
    for tag in &table.tags {
        s.push_str(&format!("    {}\n", hmi_tag_xml(tag)));
    }
    s
}

fn hmi_tag_xml(tag: &HmiTag) -> String {
    // `address` is free-form user/LLM input (models/hmi.rs) and lands in an
    // XML attribute, so it must be escaped like every other field. A `None`
    // address still serializes as the empty string.
    let address = xml_escape(tag.address.as_deref().unwrap_or(""));
    let label = xml_escape(&tag.label);
    let plc_ref = xml_escape(&tag.plc_ref);
    let etype = hmi_element_type_str(tag.element_type);
    let source = hmi_tag_source_str(tag.source);
    format!(
        "<Tag address=\"{address}\" type=\"{etype}\" label=\"{label}\" plcRef=\"{plc_ref}\" source=\"{source}\"/>"
    )
}

/// Build the DOPSoft-compatible CSV for the given project. Pure function.
/// If the project has no HMI table or the tag list is empty, the output is
/// exactly the header line terminated with `\r\n`.
pub fn build_csv(project: &Project) -> String {
    let mut out = String::with_capacity(128);
    out.push_str("Name,Type,PLC_Reference,Address,Comment\r\n");

    if let Some(table) = &project.hmi_table {
        for tag in &table.tags {
            let name = csv_escape(&tag.label);
            let etype = csv_escape(hmi_element_type_str(tag.element_type));
            let plc_ref = csv_escape(&tag.plc_ref);
            let address = csv_escape(tag.address.as_deref().unwrap_or(""));
            out.push_str(&format!("{name},{etype},{plc_ref},{address},\r\n"));
        }
    }

    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::hmi::HmiElementType;

    // ----- escape helpers ------------------------------------------------

    #[test]
    fn xml_escape_handles_all_five_chars() {
        assert_eq!(xml_escape("&"), "&amp;");
        assert_eq!(xml_escape("<"), "&lt;");
        assert_eq!(xml_escape(">"), "&gt;");
        assert_eq!(xml_escape("\""), "&quot;");
        assert_eq!(xml_escape("'"), "&apos;");
    }

    #[test]
    fn xml_escape_passthrough_for_safe_string() {
        let s = "Hello World 123 - plain ASCII, no special chars.";
        assert_eq!(xml_escape(s), s);
    }

    #[test]
    fn xml_escape_handles_combined_specials() {
        assert_eq!(
            xml_escape("<a href=\"x\">'&'</a>"),
            "&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;"
        );
    }

    #[test]
    fn csv_escape_passthrough_for_safe_string() {
        let s = "Hello World";
        assert_eq!(csv_escape(s), s);
    }

    #[test]
    fn csv_escape_wraps_when_comma_present() {
        assert_eq!(csv_escape("a,b"), "\"a,b\"");
    }

    #[test]
    fn csv_escape_doubles_internal_quote() {
        assert_eq!(csv_escape("she said \"hi\""), "\"she said \"\"hi\"\"\"");
    }

    #[test]
    fn csv_escape_wraps_on_newline() {
        assert_eq!(csv_escape("a\nb"), "\"a\nb\"");
    }

    // ----- validate_export_path / ensure_extension -----------------------

    #[test]
    fn validate_export_path_accepts_xml() {
        let p = validate_export_path("C:\\tmp\\out.xml", "xml").expect("valid");
        assert_eq!(p.extension().and_then(|e| e.to_str()), Some("xml"));
    }

    #[test]
    fn validate_export_path_rejects_empty() {
        let err = validate_export_path("", "xml").expect_err("empty rejected");
        assert!(matches!(err, AppError::InvalidPath(_)));
    }

    #[test]
    fn validate_export_path_rejects_whitespace() {
        let err = validate_export_path("   \t  ", "xml").expect_err("whitespace rejected");
        assert!(matches!(err, AppError::InvalidPath(_)));
    }

    #[test]
    fn validate_export_path_rejects_traversal() {
        let err = validate_export_path("/tmp/../escape.xml", "xml").expect_err("traversal");
        assert!(matches!(err, AppError::InvalidPath(_)));
    }

    #[test]
    fn validate_export_path_rejects_wrong_extension() {
        let err = validate_export_path("out.txt", "xml").expect_err("wrong ext");
        assert!(matches!(err, AppError::InvalidExtension(_)));
    }

    #[test]
    fn validate_export_path_appends_missing_extension() {
        let p = validate_export_path("out", "xml").expect("append");
        assert_eq!(p.extension().and_then(|e| e.to_str()), Some("xml"));
        let p = validate_export_path("out", "csv").expect("append");
        assert_eq!(p.extension().and_then(|e| e.to_str()), Some("csv"));
    }

    #[test]
    fn ensure_extension_case_insensitive() {
        // Already has the right extension (uppercase) — must NOT be replaced.
        let p = ensure_extension(Path::new("/tmp/out.XML"), "xml");
        assert_eq!(p, PathBuf::from("/tmp/out.XML"));
        let p = ensure_extension(Path::new("/tmp/out.CSV"), "csv");
        assert_eq!(p, PathBuf::from("/tmp/out.CSV"));
    }

    // ----- validate_il --------------------------------------------------

    #[test]
    fn validate_il_rejects_empty() {
        let err = validate_il("").expect_err("empty");
        assert!(matches!(err, AppError::Other(_)));
    }

    #[test]
    fn validate_il_rejects_whitespace() {
        let err = validate_il("   \n\t  ").expect_err("whitespace");
        assert!(matches!(err, AppError::Other(_)));
    }

    #[test]
    fn validate_il_accepts_non_empty() {
        let r = validate_il("LD X0\nOUT Y0").expect("ok");
        assert_eq!(r, "LD X0\nOUT Y0");
    }

    // ----- build_xml ----------------------------------------------------

    fn ts(s: &str) -> chrono::DateTime<chrono::Utc> {
        chrono::DateTime::parse_from_rfc3339(s)
            .expect("valid RFC3339")
            .with_timezone(&chrono::Utc)
    }

    fn project_minimal() -> Project {
        let mut p = Project::new("Pump".into());
        p.created_at = ts("2026-01-01T00:00:00Z");
        p.updated_at = ts("2026-02-01T00:00:00Z");
        p.meta.model = Some("DVP-SS2".into());
        p
    }

    #[test]
    fn build_xml_minimal_project() {
        let p = project_minimal();
        let xml = build_xml(&p);

        assert!(xml.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(xml.contains("<!-- DPA-ISPSoft v1.0"));
        assert!(xml.contains("<Project name=\"Pump\" model=\"DVP-SS2\""));
        assert!(xml.contains("createdAt=\"2026-01-01T00:00:00Z\""));
        assert!(xml.contains("updatedAt=\"2026-02-01T00:00:00Z\""));
        assert!(xml.contains("version=\"3\""));
        assert!(xml.contains("<IoTable></IoTable>"));
        assert!(xml.contains("<Program language=\"ST\"><![CDATA[]]></Program>"));
        assert!(xml.contains("<HmiTable></HmiTable>"));
        assert!(xml.ends_with("</Project>\n"));
    }

    #[test]
    fn build_xml_with_st_code() {
        let mut p = project_minimal();
        p.generated = Some(serde_json::json!({
            "st": "Y0 := X0;",
            "il": "",
            "generated_at": "2026-06-06T12:00:00Z"
        }));
        let xml = build_xml(&p);
        assert!(xml.contains("<Program language=\"ST\"><![CDATA[Y0 := X0;]]></Program>"));
        // ST must NOT be XML-escaped inside CDATA.
        assert!(!xml.contains("&lt;") || xml.matches("&lt;").count() == 0);
    }

    #[test]
    fn build_xml_with_special_chars_in_label() {
        let mut p = project_minimal();
        p.hmi_table = Some(HmiTable {
            tags: vec![HmiTag {
                address: Some("M10".into()),
                element_type: HmiElementType::Button,
                label: "<script>".into(),
                plc_ref: "X0".into(),
                source: HmiTagSource::Auto,
            }],
            reserved_m_range: Some((10, 10)),
            model: Some("DVP-SS2".into()),
        });
        let xml = build_xml(&p);
        // The label must be escaped to &lt;script&gt;
        assert!(xml.contains("label=\"&lt;script&gt;\""));
        assert!(!xml.contains("label=\"<script>\""));
    }

    #[test]
    fn build_xml_with_empty_io_table() {
        let mut p = project_minimal();
        p.io_table = Some(serde_json::json!([]));
        let xml = build_xml(&p);
        assert!(xml.contains("<IoTable></IoTable>"));
        // No <Point> child element.
        assert!(!xml.contains("<Point "));
    }

    #[test]
    fn build_xml_with_missing_io_table() {
        let p = project_minimal();
        // p.io_table is None by default for a fresh project
        let xml = build_xml(&p);
        assert!(xml.contains("<IoTable></IoTable>"));
    }

    #[test]
    fn build_xml_with_missing_hmi_table() {
        let p = project_minimal();
        let xml = build_xml(&p);
        assert!(xml.contains("<HmiTable></HmiTable>"));
    }

    #[test]
    fn build_xml_with_hmi_tags() {
        let mut p = project_minimal();
        p.hmi_table = Some(HmiTable {
            tags: vec![
                HmiTag {
                    address: Some("M100".into()),
                    element_type: HmiElementType::Button,
                    label: "Start".into(),
                    plc_ref: "X0".into(),
                    source: HmiTagSource::Auto,
                },
                HmiTag {
                    address: Some("M101".into()),
                    element_type: HmiElementType::NumericDisplay,
                    label: "Counter".into(),
                    plc_ref: "D0".into(),
                    source: HmiTagSource::Manual,
                },
            ],
            reserved_m_range: Some((100, 119)),
            model: Some("DVP-SS2".into()),
        });
        let xml = build_xml(&p);
        assert!(xml.contains("type=\"button\""));
        assert!(xml.contains("type=\"numericDisplay\""));
        assert!(xml.contains("source=\"auto\""));
        assert!(xml.contains("source=\"manual\""));
        assert!(xml.contains("label=\"Start\""));
        assert!(xml.contains("label=\"Counter\""));
        assert!(xml.contains("plcRef=\"D0\""));
    }

    #[test]
    fn build_xml_with_io_table_points() {
        let mut p = project_minimal();
        p.io_table = Some(serde_json::json!([
            {
                "address": "X0",
                "type": "Input",
                "label": "Start",
                "defaultValue": "0",
                "comment": "push to start"
            },
            {
                "address": "Y0",
                "type": "Output",
                "label": "Motor",
                "defaultValue": "",
                "comment": ""
            }
        ]));
        let xml = build_xml(&p);
        assert!(xml.contains("<Point address=\"X0\" type=\"input\""));
        assert!(xml.contains("<Point address=\"Y0\" type=\"output\""));
        assert!(xml.contains("label=\"Start\""));
        assert!(xml.contains("label=\"Motor\""));
        assert!(xml.contains("comment=\"push to start\""));
    }

    #[test]
    fn build_xml_with_malformed_io_table_falls_back_to_empty() {
        let mut p = project_minimal();
        p.io_table = Some(serde_json::json!({ "this": "is not an array" }));
        let xml = build_xml(&p);
        // Falls back to empty IoTable without panicking.
        assert!(xml.contains("<IoTable></IoTable>"));
    }

    #[test]
    fn build_xml_ends_with_newline() {
        let p = project_minimal();
        let xml = build_xml(&p);
        assert!(xml.ends_with('\n'));
    }

    // ----- build_csv ----------------------------------------------------

    #[test]
    fn build_csv_empty_hmi_table() {
        let p = project_minimal();
        let csv = build_csv(&p);
        assert_eq!(csv, "Name,Type,PLC_Reference,Address,Comment\r\n");
    }

    #[test]
    fn build_csv_with_hmi_tags() {
        let mut p = project_minimal();
        p.hmi_table = Some(HmiTable {
            tags: vec![
                HmiTag {
                    address: Some("M100".into()),
                    element_type: HmiElementType::Button,
                    label: "Start".into(),
                    plc_ref: "X0".into(),
                    source: HmiTagSource::Auto,
                },
                HmiTag {
                    address: None,
                    element_type: HmiElementType::Lamp,
                    label: "Running".into(),
                    plc_ref: "M10".into(),
                    source: HmiTagSource::Manual,
                },
            ],
            reserved_m_range: Some((100, 119)),
            model: Some("DVP-SS2".into()),
        });
        let csv = build_csv(&p);
        let lines: Vec<&str> = csv.split("\r\n").collect();
        assert_eq!(lines[0], "Name,Type,PLC_Reference,Address,Comment");
        assert_eq!(lines[1], "Start,button,X0,M100,");
        assert_eq!(lines[2], "Running,lamp,M10,,");
        // Ends with trailing CRLF
        assert!(csv.ends_with("\r\n"));
    }

    #[test]
    fn build_csv_escapes_special_chars() {
        let mut p = project_minimal();
        p.hmi_table = Some(HmiTable {
            tags: vec![HmiTag {
                address: Some("M5".into()),
                element_type: HmiElementType::Button,
                label: "Hello, \"World\"".into(),
                plc_ref: "X0".into(),
                source: HmiTagSource::Auto,
            }],
            reserved_m_range: Some((5, 5)),
            model: None,
        });
        let csv = build_csv(&p);
        // The label contains `,` and `"` — both must be CSV-escaped.
        assert!(csv.contains("\"Hello, \"\"World\"\"\""));
    }

    #[test]
    fn build_csv_uses_crlf_line_terminator() {
        let mut p = project_minimal();
        p.hmi_table = Some(HmiTable {
            tags: vec![HmiTag {
                address: Some("M5".into()),
                element_type: HmiElementType::Button,
                label: "x".into(),
                plc_ref: "X0".into(),
                source: HmiTagSource::Auto,
            }],
            reserved_m_range: Some((5, 5)),
            model: None,
        });
        let csv = build_csv(&p);
        // Every line (header + data) must be CRLF-terminated.
        assert!(csv.contains("Name,Type,PLC_Reference,Address,Comment\r\n"));
        assert!(csv.contains("x,button,X0,M5,\r\n"));
    }

    // ----- type helpers -------------------------------------------------

    #[test]
    fn hmi_element_type_str_lowercases_all_variants() {
        assert_eq!(hmi_element_type_str(HmiElementType::Button), "button");
        assert_eq!(hmi_element_type_str(HmiElementType::Lamp), "lamp");
        assert_eq!(hmi_element_type_str(HmiElementType::Alarm), "alarm");
        assert_eq!(
            hmi_element_type_str(HmiElementType::NumericDisplay),
            "numericDisplay"
        );
        assert_eq!(hmi_element_type_str(HmiElementType::Setpoint), "setpoint");
    }

    #[test]
    fn hmi_tag_source_str_lowercases_all_variants() {
        assert_eq!(hmi_tag_source_str(HmiTagSource::Auto), "auto");
        assert_eq!(hmi_tag_source_str(HmiTagSource::Manual), "manual");
    }

    #[test]
    fn io_point_type_str_known_values_lowercased() {
        assert_eq!(io_point_type_str("Input"), "input");
        assert_eq!(io_point_type_str("Output"), "output");
        assert_eq!(io_point_type_str("Relay"), "relay");
        assert_eq!(io_point_type_str("Timer"), "timer");
        assert_eq!(io_point_type_str("Counter"), "counter");
    }

    #[test]
    fn io_point_type_str_unknown_passes_through_lowercased() {
        assert_eq!(io_point_type_str("Unknown"), "unknown");
        assert_eq!(io_point_type_str(""), "");
    }

    // ----- M10.6.4: XXE prevention --------------------------------------

    /// `build_xml` writes via string interpolation — there is no XML
    /// *parser* in the pipeline, so XXE is not structurally possible.
    /// This test pins that property: every payload field that ends up
    /// in the output (project name, IO label/comment, HMI tag label)
    /// must be XML-escaped, so a hostile `<!DOCTYPE foo [<!ENTITY xxe>]>`
    /// supplied by the user comes out as inert escaped text, not a
    /// real DOCTYPE declaration the downstream ISPSoft parser would
    /// resolve.
    ///
    /// Note on "PWNED": the literal token survives in the output as
    /// inert text inside an attribute value (`&quot;PWNED&quot;`).
    /// That is HARMLESS — a conforming XML parser sees it as a string,
    /// not a resolved entity. What matters is that no parser-interpretable
    /// construct (`<!DOCTYPE`, `<!ENTITY`, a second `<?xml ...?>` prolog)
    /// appears as raw markup.
    #[test]
    fn build_xml_neutralises_doctype_and_entity_in_project_name() {
        let mut p = project_minimal();
        // Adversarial payload from the M10.6.6 §1B test vector.
        p.name = "<?xml version=\"1.0\"?><!DOCTYPE foo [<!ENTITY xxe \"PWNED\">]><foo>&xxe;</foo>"
            .into();
        let xml = build_xml(&p);

        // Exactly one XML prolog (the one we emit at the top of the file).
        assert_eq!(
            xml.matches("<?xml").count(),
            1,
            "extra <?xml prolog injected via project name: {xml}"
        );

        // No literal DOCTYPE declaration anywhere in the output. The
        // payload's `<!DOCTYPE` must appear only in the escaped form
        // `&lt;!DOCTYPE`.
        assert!(
            !xml.contains("<!DOCTYPE"),
            "raw DOCTYPE survived in XML output: {xml}"
        );
        assert!(
            !xml.contains("<!ENTITY"),
            "raw ENTITY survived in XML output: {xml}"
        );

        // The escaped forms ARE present (proves the field round-trips,
        // just defanged).
        assert!(xml.contains("&lt;?xml"));
        assert!(xml.contains("&lt;!DOCTYPE"));
        assert!(xml.contains("&lt;!ENTITY"));

        // The `&xxe;` entity reference must be defanged into `&amp;xxe;`
        // — a downstream parser will not attempt to resolve it.
        assert!(xml.contains("&amp;xxe;"));
        assert!(!xml.contains(">&xxe;<"));
    }

    #[test]
    fn build_xml_neutralises_doctype_in_io_label_and_comment() {
        let mut p = project_minimal();
        p.io_table = Some(serde_json::json!([{
            "address": "X0",
            "type": "Input",
            "label": "<!DOCTYPE x [<!ENTITY pwn \"PWNED\">]>",
            "defaultValue": "",
            "comment": "<![CDATA[CDATA_BREAKOUT]]>"
        }]));
        let xml = build_xml(&p);

        // No real DOCTYPE / ENTITY / nested CDATA opener survives as
        // raw markup.
        assert!(
            !xml.contains("<!DOCTYPE"),
            "raw DOCTYPE leaked via IO label: {xml}"
        );
        assert!(
            !xml.contains("<!ENTITY"),
            "raw ENTITY leaked via IO label: {xml}"
        );
        assert!(
            !xml.contains("<![CDATA[CDATA_BREAKOUT"),
            "raw CDATA opener leaked via IO comment: {xml}"
        );

        // The escaped forms are present — fields round-trip, just defanged.
        assert!(xml.contains("label=\"&lt;!DOCTYPE"));
        assert!(xml.contains("comment=\"&lt;![CDATA["));
    }

    #[test]
    fn build_xml_neutralises_doctype_in_hmi_label_and_plc_ref() {
        let mut p = project_minimal();
        p.hmi_table = Some(HmiTable {
            tags: vec![HmiTag {
                address: Some("M10".into()),
                element_type: HmiElementType::Button,
                label: "<!DOCTYPE x [<!ENTITY pwn \"PWNED\">]>".into(),
                plc_ref: "<!ENTITY plcref \"PWNED\">".into(),
                source: HmiTagSource::Auto,
            }],
            reserved_m_range: Some((10, 10)),
            model: Some("DVP-SS2".into()),
        });
        let xml = build_xml(&p);
        assert!(
            !xml.contains("<!DOCTYPE"),
            "raw DOCTYPE leaked via HMI label: {xml}"
        );
        assert!(
            !xml.contains("<!ENTITY"),
            "raw ENTITY leaked via HMI label: {xml}"
        );
        assert!(xml.contains("label=\"&lt;!DOCTYPE"));
        assert!(xml.contains("plcRef=\"&lt;!ENTITY"));
    }

    // ----- H5: CDATA breakout & attribute injection ---------------------

    #[test]
    fn cdata_escape_neutralises_terminator() {
        assert_eq!(cdata_escape("a]]>b"), "a]]]]><![CDATA[>b");
    }

    #[test]
    fn cdata_escape_passthrough_for_safe_string() {
        let s = "Y0 := X0;\nIF x THEN\nEND_IF;";
        assert_eq!(cdata_escape(s), s);
    }

    /// A `]]>` inside the generated ST must not terminate the `<Program>`
    /// CDATA section early — otherwise everything after it is parsed as
    /// raw XML markup (injection vector). Each terminator is split into
    /// the idiom `]]]]><![CDATA[>`; a conforming parser reads the split
    /// back as the original text losslessly.
    #[test]
    fn build_xml_splits_cdata_terminator_in_st_code() {
        let mut p = project_minimal();
        // Two `]]>` terminators plus injected markup that must stay inert
        // inside the CDATA section.
        p.generated = Some(serde_json::json!({
            "st": "a := arr[i]]>;\n</Program><Injected attr=\"pwn\"/>\nb]]>;",
            "il": "",
            "generated_at": "2026-06-06T12:00:00Z"
        }));
        let xml = build_xml(&p);

        // Both terminators are split with the standard idiom…
        assert!(
            xml.contains("<Program language=\"ST\"><![CDATA[a := arr[i]]]]><![CDATA[>;"),
            "first terminator not split: {xml}"
        );
        assert!(
            xml.contains("b]]]]><![CDATA[>;"),
            "second terminator not split: {xml}"
        );

        // …so the CDATA sections stay balanced: 3 openers (initial + 2
        // re-openers) and 3 closers (one per split + the genuine closer).
        assert_eq!(xml.matches("<![CDATA[").count(), 3);
        assert_eq!(xml.matches("]]>").count(), 3);

        // The last closer in the document is our genuine one, immediately
        // followed by `</Program>` — the injected `</Program>` never ends
        // up outside a CDATA section.
        let closer = xml.rfind("]]>").expect("genuine closer present");
        assert!(xml[closer + 3..].starts_with("</Program>"));

        // The payload round-trips verbatim as inert character data.
        assert!(xml.contains("<Injected attr=\"pwn\"/>"));
    }

    /// `HmiTag.address` is free-form input interpolated straight into an
    /// XML attribute — every hostile character must be entity-escaped so
    /// the attribute delimiter cannot be broken out of.
    #[test]
    fn build_xml_escapes_hostile_hmi_address_attribute() {
        let mut p = project_minimal();
        p.hmi_table = Some(HmiTable {
            tags: vec![HmiTag {
                address: Some("<!DOCTYPE d [<!ENTITY a \"PWNED\">]>&\"'".into()),
                element_type: HmiElementType::Button,
                label: "Start".into(),
                plc_ref: "X0".into(),
                source: HmiTagSource::Auto,
            }],
            reserved_m_range: Some((100, 119)),
            model: Some("DVP-SS2".into()),
        });
        let xml = build_xml(&p);

        // No parser-interpretable construct survives as raw markup…
        assert!(
            !xml.contains("<!DOCTYPE"),
            "raw DOCTYPE leaked via HMI address: {xml}"
        );
        assert!(
            !xml.contains("<!ENTITY"),
            "raw ENTITY leaked via HMI address: {xml}"
        );

        // …and the full hostile payload comes out escaped, keeping the
        // attribute well-formed.
        assert!(
            xml.contains(
                "address=\"&lt;!DOCTYPE d [&lt;!ENTITY a &quot;PWNED&quot;&gt;]&gt;&amp;&quot;&apos;\""
            ),
            "hostile address not fully escaped: {xml}"
        );
    }

    /// Regression: benign DVP addresses must export byte-for-byte unchanged.
    #[test]
    fn build_xml_keeps_benign_hmi_addresses_unchanged() {
        let mut p = project_minimal();
        p.hmi_table = Some(HmiTable {
            tags: vec![
                HmiTag {
                    address: Some("X0".into()),
                    element_type: HmiElementType::Button,
                    label: "Start".into(),
                    plc_ref: "X0".into(),
                    source: HmiTagSource::Auto,
                },
                HmiTag {
                    address: Some("M100".into()),
                    element_type: HmiElementType::Lamp,
                    label: "Running".into(),
                    plc_ref: "Y0".into(),
                    source: HmiTagSource::Manual,
                },
            ],
            reserved_m_range: Some((100, 119)),
            model: Some("DVP-SS2".into()),
        });
        let xml = build_xml(&p);
        assert!(xml.contains("address=\"X0\" type=\"button\""));
        assert!(xml.contains("address=\"M100\" type=\"lamp\""));
    }
}
