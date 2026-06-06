use std::{fs, path::PathBuf};

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("文件不是有效的 UTF-8 文本")]
    InvalidUtf8,
    #[error("文件操作失败：{0}")]
    Io(#[from] std::io::Error),
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
struct FilePayload {
    path: String,
    name: String,
    content: String,
}

fn file_payload(path: PathBuf, content: String) -> FilePayload {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("未命名")
        .to_string();

    FilePayload {
        path: path.to_string_lossy().into_owned(),
        name,
        content,
    }
}

#[tauri::command]
fn open_file_dialog() -> Result<Option<FilePayload>, AppError> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("打开文本文件")
        .pick_file()
    else {
        return Ok(None);
    };

    let bytes = fs::read(&path)?;
    let content = String::from_utf8(bytes).map_err(|_| AppError::InvalidUtf8)?;
    Ok(Some(file_payload(path, content)))
}

#[tauri::command]
fn save_file_dialog(default_path: Option<String>, content: String) -> Result<Option<FilePayload>, AppError> {
    let mut dialog = rfd::FileDialog::new().set_title("保存文本文件");
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

    fs::write(&path, content.as_bytes())?;
    Ok(Some(file_payload(path, content)))
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), AppError> {
    fs::write(path, content.as_bytes())?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            save_file_dialog,
            write_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
