import fs from "fs";
import path from "path";

const root = path.resolve("src");
const src = fs.readFileSync(path.join(root, "App.tsx.bak"), "utf8");
const lines = src.split("\n");

function slice(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

function write(rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trim() + "\n");
  console.log("wrote", rel);
}

write("types/index.ts", slice(31, 196));

write(
  "constants/index.ts",
  `import type { FontChoice, LineEnding } from "../types";

${slice(198, 242)}`
);

write(
  "languages/builtIn.ts",
  `import type { LanguageDefinition } from "../types";

${slice(244, 378)}`
);

write(
  "utils/id.ts",
  slice(380, 382)
);

write(
  "utils/path.ts",
  `import { untitledName } from "../constants";

${slice(384, 391)}`
);

write(
  "utils/text.ts",
  slice(902, 938)
);

write(
  "languages/parseCustom.ts",
  `import type { CSSProperties } from "react";
import type { CustomKeywordGroup, CustomLanguageConfig, LanguageDefinition } from "../types";

${slice(393, 411)}

${slice(413, 547)}`
);

write(
  "storage/settings.ts",
  `import {
  defaultFontChoice,
  fontSettingsKey,
  fontSizes,
  languageFontSettingsKey,
  startupPolicyKey
} from "../constants";
import type { FontChoice, LanguageFontChoice, StartupPolicy } from "../types";

${slice(549, 592)}`
);

write(
  "tabs/tabUtils.ts",
  `import { untitledName, sessionKey, maxStoredSessionContentLength } from "../constants";
import { createId } from "../utils/id";
import { loadStartupPolicy } from "../storage/settings";
import { detectLanguage } from "../languages/detect";
import type { DocumentTab, FilePayload, FileState, LanguageDefinition, SessionPayload } from "../types";

${slice(594, 624)}

${slice(867, 900)}

${slice(626, 693)}`
);

write(
  "languages/detect.ts",
  `import { builtInLanguages } from "./builtIn";
import { getExtension } from "../utils/path";
import type { LanguageDefinition } from "../types";

${slice(695, 721)}`
);

write(
  "languages/extensions.ts",
  `import { css } from "@codemirror/lang-css";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage, StringStream, type StreamParser } from "@codemirror/language";
import { c as legacyC, csharp, kotlin } from "@codemirror/legacy-modes/mode/clike";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import type { Extension } from "@codemirror/state";
import type { CommentTokens, LanguageDefinition } from "../types";

${slice(723, 865)}`
);

write(
  "search/matching.ts",
  `import type { SearchMatch, SearchOptions } from "../types";

${slice(940, 1046)}`
);

write(
  "search/decorations.ts",
  `import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import type { SearchMatch } from "../types";

${slice(1048, 1103)}`
);

write(
  "api/files.ts",
  `import { invoke } from "@tauri-apps/api/core";
import type { FilePayload, FileState } from "../types";

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
`
);

const editorContent = slice(1105, 1310);
write(
  "editor/CodeMirrorEditor.tsx",
  `import { basicSetup } from "codemirror";
import { defaultKeymap, historyKeymap, indentWithTab, toggleComment } from "@codemirror/commands";
import { Compartment, EditorState, Extension, Prec, StateField } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { highlightSelectionMatches } from "@codemirror/search";
import { CSSProperties, WheelEvent, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { getLanguageExtensions } from "../languages/extensions";
import { createSearchDecorations } from "../search/decorations";
import type { CodeMirrorEditorHandle, CodeMirrorEditorProps } from "../types";

${editorContent}`
);

console.log("split complete");
