use std::{
    borrow::Cow,
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use encoding_rs::{GBK, WINDOWS_1252};
use serde::Serialize;
use tauri::{Emitter, Manager};

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("File is not valid UTF-8 text")]
    InvalidUtf8,
    #[error("Unsupported encoding: {0}")]
    UnsupportedEncoding(String),
    #[error("Unable to decode or encode file as {0}")]
    Codec(String),
    #[error("File operation failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("Unable to locate application directory")]
    MissingAppDir,
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[derive(Serialize)]
struct FileState {
    modified_ms: Option<u64>,
    size: u64,
}

#[derive(Serialize)]
struct FilePayload {
    path: String,
    name: String,
    content: String,
    encoding: String,
    line_ending: String,
    modified_ms: Option<u64>,
    size: u64,
}

fn file_payload(path: PathBuf, content: String, encoding: String, line_ending: String) -> FilePayload {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Untitled")
        .to_string();

    let state = file_state_from_path(&path).unwrap_or(FileState {
        modified_ms: None,
        size: 0,
    });

    FilePayload {
        path: path.to_string_lossy().into_owned(),
        name,
        content,
        encoding,
        line_ending,
        modified_ms: state.modified_ms,
        size: state.size,
    }
}

fn file_state_from_path(path: &Path) -> Result<FileState, AppError> {
    let metadata = fs::metadata(path)?;
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);

    Ok(FileState {
        modified_ms,
        size: metadata.len(),
    })
}

fn startup_file_paths() -> Vec<String> {
    std::env::args_os()
        .skip(1)
        .filter_map(|argument| {
            let path = PathBuf::from(argument);
            path.is_file().then(|| path.to_string_lossy().into_owned())
        })
        .collect()
}

fn custom_languages_config_path() -> Result<PathBuf, AppError> {
    let exe = std::env::current_exe()?;
    let Some(parent) = exe.parent() else {
        return Err(AppError::MissingAppDir);
    };
    Ok(parent.join("custom-languages.json"))
}

fn ensure_custom_languages_config() -> Result<PathBuf, AppError> {
    let path = custom_languages_config_path()?;
    if !path.exists() {
        let template = r##"// Custom language that matches CMakeLists.txt by file name.
// Keep regexEnabled true because CMakeLists.txt uses the .txt extension.
[
  {
    "name": "CMake",
    "extensions": "cmake",
    "regexEnabled": true,
    "regexPattern": "^CMakeLists\\.txt$|.*\\.cmake$",
    "lineComment": "#",
    "keywordGroups": [
      {
        "keywords": "cmake_minimum_required project add_executable add_library target_link_libraries target_include_directories target_compile_definitions target_compile_options set option include find_package if elseif else endif foreach endforeach function endfunction macro endmacro message install",
        "color": "#8f3fb0"
      },
      {
        "keywords": "ON OFF TRUE FALSE YES NO",
        "color": "#b25f00"
      }
    ]
  },
  {
    "name": "MyLanguage",
    "extensions": "my mylang",
    "regexEnabled": false,
    "regexPattern": "^example\\.my$",
    "lineComment": "//",
    "blockStart": "/*",
    "blockEnd": "*/",
    "keywordGroups": [
      {
        "keywords": "if else function return",
        "color": "#8f3fb0"
      },
      {
        "keywords": "true false null",
        "color": "#b25f00"
      }
    ]
  }
]
"##;
        fs::write(&path, template.as_bytes())?;
    }
    Ok(path)
}

fn detect_line_ending(content: &str) -> String {
    let bytes = content.as_bytes();
    let mut crlf = 0;
    let mut lf = 0;
    let mut cr = 0;
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'\r' if bytes.get(index + 1) == Some(&b'\n') => {
                crlf += 1;
                index += 2;
            }
            b'\r' => {
                cr += 1;
                index += 1;
            }
            b'\n' => {
                lf += 1;
                index += 1;
            }
            _ => index += 1,
        }
    }

    if crlf >= lf && crlf >= cr && crlf > 0 {
        "CRLF".to_string()
    } else if cr > lf && cr > 0 {
        "CR".to_string()
    } else {
        "LF".to_string()
    }
}

fn normalize_line_endings(content: &str) -> String {
    content.replace("\r\n", "\n").replace('\r', "\n")
}

fn apply_line_ending(content: &str, line_ending: &str) -> String {
    let normalized = normalize_line_endings(content);
    match line_ending {
        "CRLF" => normalized.replace('\n', "\r\n"),
        "CR" => normalized.replace('\n', "\r"),
        _ => normalized,
    }
}

fn decode_utf16(bytes: &[u8], little_endian: bool) -> Result<String, AppError> {
    let bytes = if little_endian && bytes.starts_with(&[0xff, 0xfe]) {
        &bytes[2..]
    } else if !little_endian && bytes.starts_with(&[0xfe, 0xff]) {
        &bytes[2..]
    } else {
        bytes
    };

    if bytes.len() % 2 != 0 {
        return Err(AppError::Codec(if little_endian { "UTF-16 LE" } else { "UTF-16 BE" }.to_string()));
    }

    let units = bytes.chunks_exact(2).map(|chunk| {
        if little_endian {
            u16::from_le_bytes([chunk[0], chunk[1]])
        } else {
            u16::from_be_bytes([chunk[0], chunk[1]])
        }
    });

    String::from_utf16(&units.collect::<Vec<_>>())
        .map_err(|_| AppError::Codec(if little_endian { "UTF-16 LE" } else { "UTF-16 BE" }.to_string()))
}

fn decode_with_encoding(bytes: &[u8], encoding: &str) -> Result<String, AppError> {
    match encoding {
        "UTF-8" => String::from_utf8(bytes.to_vec()).map_err(|_| AppError::InvalidUtf8),
        "UTF-8 BOM" => {
            let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
            String::from_utf8(bytes.to_vec()).map_err(|_| AppError::InvalidUtf8)
        }
        "UTF-16 LE" => decode_utf16(bytes, true),
        "UTF-16 BE" => decode_utf16(bytes, false),
        "GBK" => {
            let (decoded, _, had_errors) = GBK.decode(bytes);
            if had_errors {
                Err(AppError::Codec("GBK".to_string()))
            } else {
                Ok(decoded.into_owned())
            }
        }
        "Windows-1252" => {
            let (decoded, _, _) = WINDOWS_1252.decode(bytes);
            Ok(decoded.into_owned())
        }
        value => Err(AppError::UnsupportedEncoding(value.to_string())),
    }
}

fn detect_encoding(bytes: &[u8]) -> (String, String) {
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        return ("UTF-8 BOM".to_string(), decode_with_encoding(bytes, "UTF-8 BOM").unwrap_or_default());
    }
    if bytes.starts_with(&[0xff, 0xfe]) {
        return ("UTF-16 LE".to_string(), decode_with_encoding(bytes, "UTF-16 LE").unwrap_or_default());
    }
    if bytes.starts_with(&[0xfe, 0xff]) {
        return ("UTF-16 BE".to_string(), decode_with_encoding(bytes, "UTF-16 BE").unwrap_or_default());
    }
    if let Ok(content) = String::from_utf8(bytes.to_vec()) {
        return ("UTF-8".to_string(), content);
    }

    let even_nulls = bytes.iter().step_by(2).filter(|value| **value == 0).count();
    let odd_nulls = bytes.iter().skip(1).step_by(2).filter(|value| **value == 0).count();
    if odd_nulls > bytes.len() / 8 {
        if let Ok(content) = decode_utf16(bytes, true) {
            return ("UTF-16 LE".to_string(), content);
        }
    }
    if even_nulls > bytes.len() / 8 {
        if let Ok(content) = decode_utf16(bytes, false) {
            return ("UTF-16 BE".to_string(), content);
        }
    }

    let (gbk, _, gbk_errors) = GBK.decode(bytes);
    if !gbk_errors {
        return ("GBK".to_string(), gbk.into_owned());
    }

    let (decoded, _, _) = WINDOWS_1252.decode(bytes);
    ("Windows-1252".to_string(), decoded.into_owned())
}

fn read_text_file(path: PathBuf, encoding: Option<String>) -> Result<FilePayload, AppError> {
    let bytes = fs::read(&path)?;
    let (encoding, content) = match encoding {
        Some(encoding) => {
            let content = decode_with_encoding(&bytes, &encoding)?;
            (encoding, content)
        }
        None => detect_encoding(&bytes),
    };
    let line_ending = detect_line_ending(&content);
    Ok(file_payload(path, normalize_line_endings(&content), encoding, line_ending))
}

fn encode_content(content: &str, encoding: &str, line_ending: &str) -> Result<Vec<u8>, AppError> {
    let content = apply_line_ending(content, line_ending);
    match encoding {
        "UTF-8" => Ok(content.into_bytes()),
        "UTF-8 BOM" => {
            let mut bytes = vec![0xef, 0xbb, 0xbf];
            bytes.extend_from_slice(content.as_bytes());
            Ok(bytes)
        }
        "UTF-16 LE" => Ok(content.encode_utf16().flat_map(u16::to_le_bytes).collect()),
        "UTF-16 BE" => Ok(content.encode_utf16().flat_map(u16::to_be_bytes).collect()),
        "GBK" => {
            let (encoded, _, had_errors) = GBK.encode(&content);
            if had_errors {
                Err(AppError::Codec("GBK".to_string()))
            } else {
                Ok(match encoded {
                    Cow::Borrowed(value) => value.to_vec(),
                    Cow::Owned(value) => value,
                })
            }
        }
        "Windows-1252" => {
            let (encoded, _, had_errors) = WINDOWS_1252.encode(&content);
            if had_errors {
                Err(AppError::Codec("Windows-1252".to_string()))
            } else {
                Ok(match encoded {
                    Cow::Borrowed(value) => value.to_vec(),
                    Cow::Owned(value) => value,
                })
            }
        }
        value => Err(AppError::UnsupportedEncoding(value.to_string())),
    }
}

fn temporary_save_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("notely-save");
    path.with_file_name(format!(".{file_name}.notely.tmp"))
}

#[cfg(windows)]
fn replace_file(temp_path: &Path, target_path: &Path) -> Result<(), AppError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let temp: Vec<u16> = temp_path.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<u16> = target_path.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe {
        MoveFileExW(
            temp.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };

    if result == 0 {
        Err(AppError::Io(std::io::Error::last_os_error()))
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(temp_path: &Path, target_path: &Path) -> Result<(), AppError> {
    fs::rename(temp_path, target_path)?;
    Ok(())
}

fn write_file_atomic(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let temp_path = temporary_save_path(path);
    if temp_path.exists() {
        let _ = fs::remove_file(&temp_path);
    }

    {
        let mut file = File::create(&temp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }

    if let Err(error) = replace_file(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }

    Ok(())
}

#[tauri::command]
fn open_file_dialog() -> Result<Option<FilePayload>, AppError> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("Open text file")
        .pick_file()
    else {
        return Ok(None);
    };

    Ok(Some(read_text_file(path, None)?))
}

#[tauri::command]
fn open_file_with_encoding(path: String, encoding: String) -> Result<FilePayload, AppError> {
    read_text_file(PathBuf::from(path), Some(encoding))
}

#[tauri::command]
fn get_startup_files() -> Result<Vec<FilePayload>, AppError> {
    open_files_by_path(startup_file_paths())
}

#[tauri::command]
fn open_files_by_path(paths: Vec<String>) -> Result<Vec<FilePayload>, AppError> {
    paths
        .into_iter()
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .map(|path| read_text_file(path, None))
        .collect()
}

#[tauri::command]
fn get_file_state(path: String) -> Result<Option<FileState>, AppError> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(file_state_from_path(&path)?))
}

#[tauri::command]
fn save_file_dialog(
    default_path: Option<String>,
    content: String,
    encoding: String,
    line_ending: String,
) -> Result<Option<FilePayload>, AppError> {
    let mut dialog = rfd::FileDialog::new().set_title("Save text file");
    if let Some(path) = default_path {
        let path = PathBuf::from(path);
        if let Some(parent) = path.parent().filter(|value| !value.as_os_str().is_empty()) {
            dialog = dialog.set_directory(parent);
        }
        if let Some(name) = path.file_name().and_then(|value| value.to_str()) {
            dialog = dialog.set_file_name(name);
        }
    }

    let Some(path) = dialog.save_file() else {
        return Ok(None);
    };

    write_file_atomic(&path, &encode_content(&content, &encoding, &line_ending)?)?;
    Ok(Some(file_payload(path, content, encoding, line_ending)))
}

#[tauri::command]
fn write_file(path: String, content: String, encoding: String, line_ending: String) -> Result<FilePayload, AppError> {
    let path = PathBuf::from(path);
    write_file_atomic(&path, &encode_content(&content, &encoding, &line_ending)?)?;
    Ok(file_payload(path, content, encoding, line_ending))
}

#[tauri::command]
fn read_custom_languages_config() -> Result<String, AppError> {
    let path = ensure_custom_languages_config()?;
    Ok(fs::read_to_string(path)?)
}

#[tauri::command]
fn open_custom_languages_config() -> Result<FilePayload, AppError> {
    let path = ensure_custom_languages_config()?;
    read_text_file(path, None)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths: Vec<String> = argv
                .into_iter()
                .skip(1)
                .filter(|argument| PathBuf::from(argument).is_file())
                .collect();

            if !paths.is_empty() {
                let _ = app.emit("open-files", paths);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        }))
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            open_file_with_encoding,
            get_startup_files,
            open_files_by_path,
            get_file_state,
            save_file_dialog,
            write_file,
            read_custom_languages_config,
            open_custom_languages_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
