use std::{fs, path::PathBuf};

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("文件不是有效的 UTF-8 文本")]
    InvalidUtf8,
    #[error("文件操作失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("无法定位应用目录")]
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
        let template = r##"[
  {
    "语言名": "MyLanguage",
    "关联后缀": "my mylang",
    "是否启用正则匹配": false,
    "正则匹配规则": "^example\\.my$",
    "行注释符": "//",
    "块注释开始符": "/*",
    "块注释结束符": "*/",
    "关键词列表": [
      {
        "关键词1": "if else function return",
        "关键词1颜色": "#8f3fb0",
        "关键词1字体样式": "加粗"
      },
      {
        "关键词1": "true false null",
        "关键词1颜色": "#b25f00",
        "关键词1字体样式": "斜体 下划线"
      }
    ]
  }
]
"##;
        fs::write(&path, template.as_bytes())?;
    }
    Ok(path)
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

#[tauri::command]
fn read_custom_languages_config() -> Result<String, AppError> {
    let path = ensure_custom_languages_config()?;
    Ok(fs::read_to_string(path)?)
}

#[tauri::command]
fn open_custom_languages_config() -> Result<FilePayload, AppError> {
    let path = ensure_custom_languages_config()?;
    let content = fs::read_to_string(&path)?;
    Ok(file_payload(path, content))
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            save_file_dialog,
            write_file,
            read_custom_languages_config,
            open_custom_languages_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
