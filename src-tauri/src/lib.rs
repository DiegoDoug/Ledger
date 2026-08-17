//! Ledger's native command surface.
//!
//! Deliberately small: every command here either (a) reports a path/version
//! that carries no risk to expose, or (b) reads/writes the *exact* file path
//! the user just chose through a native OS dialog on the JS side. There is no
//! command that accepts an arbitrary path from application logic, and no
//! command that lists, walks, or globs the filesystem — the frontend cannot
//! discover paths it wasn't handed by the user.
//!
//! Ledger's actual data (the ledger document itself) is not touched by any
//! of this — it stays in the WebView's IndexedDB store, exactly as it does
//! in the browser build. See docs/adr/0001-desktop-delivery-architecture.md
//! for why.

use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

/// Guards against a malicious or accidentally huge file being read fully into
/// memory. Mirrors the browser build's `MAX_IMPORT_BYTES` (10 MB) with some
/// headroom, since desktop backups are not constrained by a browser file
/// input in the same way.
const MAX_READ_BYTES: u64 = 25 * 1024 * 1024;

fn app_data_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Could not resolve the application data directory.".to_string())?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Could not create the data directory: {e}"))?;
    Ok(dir)
}

#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app_data_directory(&app)?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_data_directory(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app_data_directory(&app)?;
    app.opener()
        .open_path(dir.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|e| format!("Could not open the data directory: {e}"))
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Writes `contents` to `path`. `path` must be a location the user just
/// picked via the dialog plugin's native save dialog — this command performs
/// no picking, prompting, or path discovery of its own.
#[tauri::command]
fn save_text_file(path: String, contents: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("No destination was chosen.".into());
    }
    std::fs::write(&path, contents).map_err(|e| format!("Could not write the file: {e}"))
}

/// Reads `path` back as UTF-8 text. `path` must be a location the user just
/// picked via the dialog plugin's native open dialog.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("No file was chosen.".into());
    }
    let metadata =
        std::fs::metadata(&path).map_err(|e| format!("Could not read the file: {e}"))?;
    if metadata.len() > MAX_READ_BYTES {
        return Err(format!(
            "That file is larger than the {} MB limit.",
            MAX_READ_BYTES / (1024 * 1024)
        ));
    }
    std::fs::read_to_string(&path)
        .map_err(|_| "That file is not valid UTF-8 text.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_app_data_dir,
            open_data_directory,
            get_app_version,
            save_text_file,
            read_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Ledger desktop application");
}
