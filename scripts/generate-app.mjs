import fs from "fs";
import path from "path";

const root = path.resolve("src");

const exportBlocks = {
  "utils/id.ts": "export { createId };",
  "utils/path.ts": "export { getNameFromPath, getExtension };",
  "utils/text.ts":
    "export { lineAndColumn, buildLineStarts, getLineIndexAtOffset, lineAndColumnFromStarts };",
  "constants/index.ts": `export {
  untitledName,
  fontSettingsKey,
  languageFontSettingsKey,
  startupPolicyKey,
  sessionKey,
  maxStoredSessionContentLength,
  minEditorZoom,
  maxEditorZoom,
  editorZoomStep,
  fallbackFontFamilies,
  fontSizes,
  encodingOptions,
  lineEndingOptions,
  defaultFontChoice
};`,
  "languages/builtIn.ts": "export { builtInLanguages };",
  "languages/parseCustom.ts": "export { parseCustomLanguages };",
  "languages/detect.ts": "export { detectLanguage, getLanguageDefinition };",
  "languages/extensions.ts": "export { getLanguageExtensions };",
  "storage/settings.ts": `export {
  loadFontChoice,
  loadLanguageFontChoices,
  saveFontChoice,
  saveLanguageFontChoices,
  loadStartupPolicy,
  saveStartupPolicy
};`,
  "tabs/tabUtils.ts": `export {
  isTabDirty,
  fileStateFromPayload,
  hasFileStateChanged,
  createEmptyTab,
  createTabFromFile,
  loadInitialSession,
  saveSession
};`,
  "search/matching.ts": `export {
  findMatches,
  createSearchRegex,
  findMatchesInRange,
  getSelectedLineRange,
  getCurrentLineRange,
  findPreviousMatchIndex
};`,
  "search/decorations.ts": "export { createSearchDecorations };"
};

for (const [rel, block] of Object.entries(exportBlocks)) {
  const file = path.join(root, rel);
  let content = fs.readFileSync(file, "utf8").trimEnd();
  if (!content.includes("export {")) {
    fs.writeFileSync(file, `${content}\n\n${block}\n`);
    console.log("exports added to", rel);
  }
}

const editorFile = path.join(root, "editor/CodeMirrorEditor.tsx");
let editor = fs.readFileSync(editorFile, "utf8");
if (!editor.includes("export default")) {
  editor = editor.replace(
    "const CodeMirrorEditor = forwardRef",
    "export default forwardRef"
  );
  fs.writeFileSync(editorFile, editor);
  console.log("export default added to CodeMirrorEditor");
}

const appImports = `import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ChevronDown,
  ChevronUp,
  FilePlus2,
  FolderOpen,
  Replace,
  Save,
  SaveAll,
  Search,
  List,
  Settings2,
  X,
  WrapText
} from "lucide-react";
import {
  CSSProperties,
  MouseEvent,
  WheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  getFileState,
  getStartupFiles,
  listSystemFonts,
  openCustomLanguagesConfig,
  openFileDialog,
  openFileWithEncoding,
  openFilesByPath,
  readCustomLanguagesConfig,
  relativePath,
  revealInFileManager,
  saveFileDialog,
  writeFile
} from "./api/files";
import {
  encodingOptions,
  fallbackFontFamilies,
  fontSizes,
  lineEndingOptions,
  maxEditorZoom,
  minEditorZoom,
  editorZoomStep
} from "./constants";
import CodeMirrorEditor from "./editor/CodeMirrorEditor";
import { builtInLanguages } from "./languages/builtIn";
import { detectLanguage, getLanguageDefinition } from "./languages/detect";
import { parseCustomLanguages } from "./languages/parseCustom";
import {
  createSearchRegex,
  findMatchesInRange,
  findPreviousMatchIndex,
  getCurrentLineRange,
  getSelectedLineRange
} from "./search/matching";
import {
  loadFontChoice,
  loadLanguageFontChoices,
  loadStartupPolicy,
  saveFontChoice,
  saveLanguageFontChoices,
  saveStartupPolicy
} from "./storage/settings";
import {
  createEmptyTab,
  createTabFromFile,
  fileStateFromPayload,
  hasFileStateChanged,
  isTabDirty,
  loadInitialSession,
  saveSession
} from "./tabs/tabUtils";
import type {
  DocumentTab,
  EncodingAction,
  FilePayload,
  FileState,
  FontChoice,
  LanguageDefinition,
  LanguageFontChoice,
  LineEnding,
  LineMenuState,
  ReplaceScope,
  SearchMatch,
  SearchOptions,
  StartupPolicy,
  TabContextMenuState
} from "./types";
import { createId } from "./utils/id";
import { buildLineStarts, getLineIndexAtOffset, lineAndColumnFromStarts } from "./utils/text";

`;

const backup = fs.readFileSync(path.join(root, "App.tsx.bak"), "utf8");
const lines = backup.split("\n");
const appBody = lines.slice(1311).join("\n");

let app = appImports + appBody;

const replacements = [
  [/await invoke<FilePayload \| null>\("open_file_dialog"\)/g, "await openFileDialog()"],
  [
    /await invoke<FilePayload\[\]>\("open_files_by_path", \{ paths: uniquePaths \}\)/g,
    "await openFilesByPath(uniquePaths)"
  ],
  [/await invoke<FilePayload\[\]>\("get_startup_files"\)/g, "await getStartupFiles()"],
  [
    /await invoke<FileState \| null>\("get_file_state", \{ path: activeTab\.path \}\)/g,
    "await getFileState(activeTab.path)"
  ],
  [
    /await invoke<FileState \| null>\("get_file_state", \{ path: targetTab\.path \}\)/g,
    "await getFileState(targetTab.path)"
  ],
  [
    /await invoke<FilePayload \| null>\("save_file_dialog", \{/g,
    "await saveFileDialog("
  ],
  [/await invoke<FilePayload>\("write_file", \{/g, "await writeFile("],
  [
    /await invoke<FilePayload>\("open_file_with_encoding", \{/g,
    "await openFileWithEncoding("
  ],
  [/await invoke<string>\("read_custom_languages_config"\)/g, "await readCustomLanguagesConfig()"],
  [
    /await invoke<FilePayload>\("open_custom_languages_config"\)/g,
    "await openCustomLanguagesConfig()"
  ],
  [
    /await invoke<string>\("relative_path", \{ path: tab\.path \}\)/g,
    "await relativePath(tab.path)"
  ],
  [
    /await invoke\("reveal_in_file_manager", \{ path: tab\.path \}\)/g,
    "await revealInFileManager(tab.path)"
  ],
  [/void invoke<string\[\]>\("list_system_fonts"\)/g, "void listSystemFonts()"]
];

for (const [pattern, replacement] of replacements) {
  app = app.replace(pattern, replacement);
}

// Fix saveFileDialog/writeFile/openFileWithEncoding call syntax: was object literal args
app = app.replace(
  /await saveFileDialog\(\n        defaultPath: ([^,]+),\n        content: ([^,]+),\n        encoding: ([^,]+),\n        lineEnding: ([^\n]+)\n      \}\)/g,
  "await saveFileDialog($1, $2, $3, $4)"
);
app = app.replace(
  /await writeFile\(\n        path: ([^,]+),\n        content: ([^,]+),\n        encoding: ([^,]+),\n        lineEnding: ([^\n]+)\n      \}\)/g,
  "await writeFile($1, $2, $3, $4)"
);
app = app.replace(
  /await openFileWithEncoding\(\n        path: ([^,]+),\n        encoding: ([^\n]+)\n      \}\)/g,
  "await openFileWithEncoding($1, $2)"
);

fs.writeFileSync(path.join(root, "App.tsx"), app);
console.log("generated App.tsx");
