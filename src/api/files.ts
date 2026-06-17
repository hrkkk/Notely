import { invoke } from "@tauri-apps/api/core";
import type { FilePayload, FileState } from "../types";

export async function setWindowTitle(title: string) {
  return invoke("set_window_title", { title });
}

export async function openFileDialog() {
  return invoke<FilePayload | null>("open_file_dialog");
}

export async function openFilesByPath(paths: string[]) {
  return invoke<FilePayload[]>("open_files_by_path", { paths });
}

export async function getStartupFiles() {
  return invoke<FilePayload[]>("get_startup_files");
}

export async function getFileState(path: string) {
  return invoke<FileState | null>("get_file_state", { path });
}

export async function saveFileDialog(
  defaultPath: string | null,
  content: string,
  encoding: string,
  lineEnding: string
) {
  return invoke<FilePayload | null>("save_file_dialog", {
    defaultPath,
    content,
    encoding,
    lineEnding
  });
}

export async function writeFile(
  path: string,
  content: string,
  encoding: string,
  lineEnding: string
) {
  return invoke<FilePayload>("write_file", { path, content, encoding, lineEnding });
}

export async function openFileWithEncoding(path: string, encoding: string) {
  return invoke<FilePayload>("open_file_with_encoding", { path, encoding });
}

export async function renameFile(path: string, newName: string) {
  return invoke<FilePayload>("rename_file", { path, newName });
}

export async function readCustomLanguagesConfig() {
  return invoke<string>("read_custom_languages_config");
}

export async function openCustomLanguagesConfig() {
  return invoke<FilePayload>("open_custom_languages_config");
}

export async function revealInFileManager(path: string) {
  return invoke("reveal_in_file_manager", { path });
}

export async function relativePath(path: string) {
  return invoke<string>("relative_path", { path });
}

export async function listSystemFonts() {
  return invoke<string[]>("list_system_fonts");
}
