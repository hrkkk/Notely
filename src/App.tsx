import { listen } from "@tauri-apps/api/event";
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
  MoreHorizontal,
  Settings2,
  X,
  WrapText
} from "lucide-react";
import {
  CSSProperties,
  MouseEvent,
  Suspense,
  WheelEvent,
  lazy,
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
  openCustomLanguagesConfig as fetchCustomLanguagesConfig,
  openFileDialog,
  openFileWithEncoding,
  openFilesByPath as fetchFilesByPath,
  readCustomLanguagesConfig,
  renameFile,
  revealInFileManager,
  saveFileDialog,
  setWindowTitle,
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
  CodeMirrorEditorHandle,
  DocumentTab,
  EncodingAction,
  FilePayload,
  FileState,
  FontChoice,
  LanguageDefinition,
  LanguageFontChoice,
  LineEnding,
  LineMenuState,
  MoreMenuState,
  ReplaceScope,
  SearchMatch,
  SearchOptions,
  StartupPolicy,
  TabContextMenuState
} from "./types";
import { createId } from "./utils/id";
import { buildLineStarts, getLineIndexAtOffset, lineAndColumnFromStarts } from "./utils/text";
import appIcon from "../src-tauri/icons/icon.png";

const CodeMirrorEditor = lazy(() => import("./editor/CodeMirrorEditor"));

export default function App() {
  const [initialSession] = useState(() => loadInitialSession());
  const [tabs, setTabs] = useState<DocumentTab[]>(() => initialSession.tabs);
  const [activeId, setActiveId] = useState(() => initialSession.activeId);
  const [status, setStatus] = useState("就绪");
  const [customLanguages, setCustomLanguages] = useState<LanguageDefinition[]>([]);
  const [globalFont, setGlobalFont] = useState<FontChoice>(() => loadFontChoice());
  const [languageFonts, setLanguageFonts] = useState<Record<string, LanguageFontChoice>>(() => loadLanguageFontChoices());
  const [selectedFontLanguage, setSelectedFontLanguage] = useState("Plain Text");
  const [startupPolicy, setStartupPolicy] = useState<StartupPolicy>(() => loadStartupPolicy());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"editor" | "languages">("editor");
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [isEncodingPickerOpen, setIsEncodingPickerOpen] = useState(false);
  const [encodingAction, setEncodingAction] = useState<EncodingAction>("reopen");
  const [isLineEndingPickerOpen, setIsLineEndingPickerOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const [query, setQuery] = useState("");
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    regex: false
  });
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [isSearchWidgetOpen, setIsSearchWidgetOpen] = useState(false);
  const [searchWidgetMode, setSearchWidgetMode] = useState<"search" | "replace">("search");
  const [isSearchResultsOpen, setIsSearchResultsOpen] = useState(false);
  const [replaceText, setReplaceText] = useState("");
  const [replaceScope, setReplaceScope] = useState<ReplaceScope>("all");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [lineHighlights, setLineHighlights] = useState<SearchMatch[]>([]);
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenuState>(null);
  const [lineMenu, setLineMenu] = useState<LineMenuState>(null);
  const [moreMenu, setMoreMenu] = useState<MoreMenuState>(null);
  const [systemFonts, setSystemFonts] = useState<string[]>(fallbackFontFamilies);
  const [wordWrap, setWordWrap] = useState(true);
  const [displayOptions, setDisplayOptions] = useState({
    showSpaces: false,
    showLineBreaks: false,
    showTabs: false,
    showIndentGuides: false
  });
  const [languageReloadFeedback, setLanguageReloadFeedback] = useState("");
  const [editorZoom, setEditorZoom] = useState(100);
  const [cursor, setCursor] = useState(0);
  const editorRef = useRef<CodeMirrorEditorHandle | null>(null);
  const languagePickerRef = useRef<HTMLDivElement | null>(null);
  const encodingPickerRef = useRef<HTMLDivElement | null>(null);
  const lineEndingPickerRef = useRef<HTMLDivElement | null>(null);
  const hasUnsavedTabsRef = useRef(false);
  const startupFilesLoadedRef = useRef(false);
  const externalChangeNotifiedRef = useRef(new Set<string>());
  const searchRunRef = useRef(0);

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const isDirty = isTabDirty(activeTab);
  const hasUnsavedTabs = tabs.some(isTabDirty);
  const languageOptions = useMemo(() => [...customLanguages, ...builtInLanguages], [customLanguages]);
  const filteredLanguageOptions = useMemo(() => {
    const value = languageSearch.trim().toLowerCase();
    if (!value) {
      return languageOptions;
    }

    return languageOptions.filter((language) => {
      return (
        language.name.toLowerCase().includes(value) ||
        language.extensions.some((extension) => extension.toLowerCase().includes(value.replace(/^\./, "")))
      );
    });
  }, [languageOptions, languageSearch]);
  const activeLanguage = useMemo(
    () => getLanguageDefinition(activeTab.language, customLanguages),
    [activeTab.language, customLanguages]
  );
  const activeFont = useMemo(() => {
    const languageFont = languageFonts[activeTab.language];
    return {
      family: languageFont?.family && languageFont.family !== "default" ? languageFont.family : globalFont.family,
      size: languageFont?.size && languageFont.size !== "default" ? languageFont.size : globalFont.size
    };
  }, [activeTab.language, globalFont, languageFonts]);
  const fontFamilies = useMemo(() => Array.from(new Set([...systemFonts, activeFont.family, globalFont.family].filter(Boolean))).sort((first, second) => first.localeCompare(second)), [activeFont.family, globalFont.family, systemFonts]);
  const effectiveFontSize = useMemo(() => Number(activeFont.size) * (editorZoom / 100), [activeFont.size, editorZoom]);
  const editorFontStyle = useMemo<CSSProperties>(() => ({
    "--editor-font-family": `"${activeFont.family}", "Cascadia Mono", "JetBrains Mono", Consolas, monospace`,
    "--editor-font-size": `${effectiveFontSize}px`
  } as CSSProperties), [activeFont.family, effectiveFontSize]);

  const updateActiveTab = useCallback((changes: Partial<DocumentTab>) => {
    setTabs((current) =>
      current.map((tab) => (tab.id === activeId ? { ...tab, ...changes } : tab))
    );
  }, [activeId]);

  const updateActiveContent = useCallback((content: string) => {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== activeId || tab.content === content) {
          return tab;
        }

        return {
          ...tab,
          content,
          history: [...tab.history.slice(-99), tab.content]
        };
      })
    );
  }, [activeId]);

  const addNewTab = useCallback(() => {
    const tab = createEmptyTab();
    setTabs((current) => [...current, tab]);
    setActiveId(tab.id);
    setStatus("新建文档");
  }, []);

  const openFilesFromPayloads = useCallback((files: FilePayload[]) => {
    if (!files.length) {
      return;
    }

    const nextTabs = files.map((file) => createTabFromFile(file, customLanguages));
    setTabs((current) => {
      const existingPaths = new Set(current.map((tab) => tab.path).filter(Boolean));
      const uniqueTabs = nextTabs.filter((tab) => !existingPaths.has(tab.path));
      if (!uniqueTabs.length) {
        const existing = current.find((tab) => tab.path === files[0].path);
        if (existing) {
          setActiveId(existing.id);
          setStatus(`已切换到 ${existing.name}`);
        }
        return current;
      }

      const onlyBlank =
        current.length === 1 &&
        current[0].path === null &&
        current[0].content.length === 0 &&
        current[0].savedContent.length === 0;
      setActiveId(uniqueTabs[0].id);
      setStatus(uniqueTabs.length === 1 ? `已打开 ${uniqueTabs[0].name}` : `已打开 ${uniqueTabs.length} 个文件`);
      return onlyBlank ? uniqueTabs : [...current, ...uniqueTabs];
    });
  }, [customLanguages]);

  const openFilesByPath = useCallback(async (paths: string[]) => {
    const uniquePaths = Array.from(new Set(paths)).filter(Boolean);
    if (!uniquePaths.length) {
      return;
    }

    try {
      const files = await fetchFilesByPath(uniquePaths);
      openFilesFromPayloads(files);
    } catch (error) {
      setStatus(`Open failed: ${String(error)}`);
    }
  }, [openFilesFromPayloads]);

  const openFile = useCallback(async () => {
    try {
      const file = await openFileDialog();
      if (!file) {
        setStatus("已取消打开");
        return;
      }

      const existing = tabs.find((tab) => tab.path === file.path);
      if (existing) {
        setActiveId(existing.id);
        setStatus(`已切换到 ${existing.name}`);
        return;
      }

      const tab: DocumentTab = {
        id: createId(),
        name: file.name,
        path: file.path,
        content: file.content,
        savedContent: file.content,
        encoding: file.encoding,
        savedEncoding: file.encoding,
        lineEnding: file.line_ending,
        savedLineEnding: file.line_ending,
        ...fileStateFromPayload(file),
        language: detectLanguage(file.name, customLanguages),
        history: []
      };
      setTabs((current) => {
        const onlyBlank =
          current.length === 1 &&
          current[0].path === null &&
          current[0].content.length === 0 &&
          current[0].savedContent.length === 0;
        return onlyBlank ? [tab] : [...current, tab];
      });
      setActiveId(tab.id);
      setStatus(`已打开 ${file.name}`);
    } catch (error) {
      setStatus(`打开失败：${String(error)}`);
    }
  }, [customLanguages, tabs]);

  const saveTabAs = useCallback(async (tab: DocumentTab) => {
    try {
      const file = await saveFileDialog(
        tab.path ?? tab.name,
        tab.content,
        tab.encoding,
        tab.lineEnding
      );
      if (!file) {
        setStatus("已取消保存");
        return false;
      }
      setTabs((current) => current.map((item) => item.id === tab.id ? {
        ...item,
        name: file.name,
        path: file.path,
        content: file.content,
        savedContent: file.content,
        encoding: file.encoding,
        savedEncoding: file.encoding,
        lineEnding: file.line_ending,
        savedLineEnding: file.line_ending,
        ...fileStateFromPayload(file),
        language: detectLanguage(file.name, customLanguages),
        history: []
      } : item));
      setStatus(`已保存 ${file.name}`);
      return true;
    } catch (error) {
      setStatus(`保存失败：${String(error)}`);
      return false;
    }
  }, [customLanguages]);

  const saveAs = useCallback(() => saveTabAs(activeTab), [activeTab, saveTabAs]);

  const save = useCallback(async () => {
    if (!activeTab.path) {
      return saveAs();
    }

    try {
      const state = await getFileState(activeTab.path);
      if (hasFileStateChanged(activeTab, state)) {
        const shouldOverwrite = window.confirm(`"${activeTab.name}" has changed on disk. Overwrite it with the current editor content?`);
        if (!shouldOverwrite) {
          setStatus("Save canceled");
          return false;
        }
      }

      const file = await writeFile(
        activeTab.path,
        activeTab.content,
        activeTab.encoding,
        activeTab.lineEnding
      );
      updateActiveTab({
        content: file.content,
        savedContent: file.content,
        encoding: file.encoding,
        savedEncoding: file.encoding,
        lineEnding: file.line_ending,
        savedLineEnding: file.line_ending,
        ...fileStateFromPayload(file)
      });
      setStatus(`已保存 ${activeTab.name}`);
      return true;
    } catch (error) {
      setStatus(`保存失败：${String(error)}`);
      return false;
    }
  }, [activeTab, saveAs, updateActiveTab]);

  const reopenWithEncoding = useCallback(async (encoding: string) => {
    if (!activeTab.path) {
      setStatus("Current tab has no file path");
      return;
    }

    if (isTabDirty(activeTab)) {
      const shouldReopen = window.confirm(`"${activeTab.name}" has unsaved changes. Reopen from disk anyway?`);
      if (!shouldReopen) {
        return;
      }
    }

    try {
      const file = await openFileWithEncoding(activeTab.path, encoding);
      updateActiveTab({
        content: file.content,
        savedContent: file.content,
        encoding: file.encoding,
        savedEncoding: file.encoding,
        lineEnding: file.line_ending,
        savedLineEnding: file.line_ending,
        ...fileStateFromPayload(file),
        history: []
      });
      setStatus(`Reopened ${activeTab.name} as ${file.encoding}`);
    } catch (error) {
      setStatus(`Reopen failed: ${String(error)}`);
    }
  }, [activeTab, updateActiveTab]);

  const saveWithEncoding = useCallback(async (encoding: string) => {
    updateActiveTab({ encoding });
    const targetTab = { ...activeTab, encoding };
    if (!targetTab.path) {
      try {
        const file = await saveFileDialog(
          targetTab.name,
          targetTab.content,
          targetTab.encoding,
          targetTab.lineEnding
        );
        if (!file) {
          setStatus("Save canceled");
          return;
        }
        updateActiveTab({
          name: file.name,
          path: file.path,
          content: file.content,
          savedContent: file.content,
          encoding: file.encoding,
          savedEncoding: file.encoding,
          lineEnding: file.line_ending,
          savedLineEnding: file.line_ending,
          ...fileStateFromPayload(file),
          language: detectLanguage(file.name, customLanguages),
          history: []
        });
        setStatus(`Saved ${file.name} as ${file.encoding}`);
      } catch (error) {
        setStatus(`Save failed: ${String(error)}`);
      }
      return;
    }

    try {
      const state = await getFileState(targetTab.path);
      if (hasFileStateChanged(targetTab, state)) {
        const shouldOverwrite = window.confirm(`"${targetTab.name}" has changed on disk. Overwrite it with the current editor content?`);
        if (!shouldOverwrite) {
          setStatus("Save canceled");
          return;
        }
      }

      const file = await writeFile(
        targetTab.path,
        targetTab.content,
        targetTab.encoding,
        targetTab.lineEnding
      );
      updateActiveTab({
        content: file.content,
        savedContent: file.content,
        encoding: file.encoding,
        savedEncoding: file.encoding,
        lineEnding: file.line_ending,
        savedLineEnding: file.line_ending,
        ...fileStateFromPayload(file)
      });
      setStatus(`Saved ${targetTab.name} as ${file.encoding}`);
    } catch (error) {
      setStatus(`Save failed: ${String(error)}`);
    }
  }, [activeTab, customLanguages, updateActiveTab]);

  const switchLineEnding = useCallback((lineEnding: LineEnding) => {
    updateActiveTab({ lineEnding });
    setStatus(`Line endings set to ${lineEnding}`);
  }, [updateActiveTab]);

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      const closing = current.find((tab) => tab.id === id);
      if (closing && isTabDirty(closing)) {
        const shouldClose = window.confirm(`"${closing.name}" 尚未保存，确定关闭吗？`);
        if (!shouldClose) {
          return current;
        }
      }

      if (current.length === 1) {
        const blank = createEmptyTab();
        setActiveId(blank.id);
        return [blank];
      }

      const index = current.findIndex((tab) => tab.id === id);
      const next = current.filter((tab) => tab.id !== id);
      if (id === activeId) {
        setActiveId(next[Math.max(0, index - 1)].id);
      }
      return next;
    });
  }, [activeId]);

  const closeOtherTabs = useCallback((id: string) => {
    setTabs((current) => {
      const target = current.find((tab) => tab.id === id);
      if (!target) {
        return current;
      }
      const dirtyOthers = current.filter((tab) => tab.id !== id && isTabDirty(tab));
      if (dirtyOthers.length && !window.confirm(`有 ${dirtyOthers.length} 个其他标签页尚未保存，确定关闭吗？`)) {
        return current;
      }
      setActiveId(id);
      return [target];
    });
  }, []);

  const closeSavedTabs = useCallback(() => {
    setTabs((current) => {
      const next = current.filter(isTabDirty);
      if (!next.length) {
        const blank = createEmptyTab();
        setActiveId(blank.id);
        return [blank];
      }
      if (!next.some((tab) => tab.id === activeId)) {
        setActiveId(next[0].id);
      }
      return next;
    });
  }, [activeId]);

  const closeAllTabs = useCallback(() => {
    if (tabs.some(isTabDirty) && !window.confirm("还有未保存的标签页，确定全部关闭吗？")) {
      return;
    }
    const blank = createEmptyTab();
    setTabs([blank]);
    setActiveId(blank.id);
  }, [tabs]);

  const copyText = useCallback(async (text: string, message: string) => {
    if (!text) {
      setStatus("当前标签页没有文件路径");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus(message);
    } catch (error) {
      setStatus(`复制失败：${String(error)}`);
    }
  }, []);

  const revealTabInFileManager = useCallback(async (tab: DocumentTab) => {
    if (!tab.path) {
      setStatus("当前标签页没有文件路径");
      return;
    }
    try {
      await revealInFileManager(tab.path);
      setStatus("已在文件资源管理器中打开");
    } catch (error) {
      setStatus(`打开失败：${String(error)}`);
    }
  }, []);

  const renameTab = useCallback((tab: DocumentTab) => {
    const nextTitle = window.prompt("重命名标签页", tab.tabTitle ?? tab.name);
    if (nextTitle === null) {
      return;
    }
    const title = nextTitle.trim();
    if (!title) {
      setStatus("标签页名称不能为空");
      return;
    }
    setTabs((current) => current.map((item) => item.id === tab.id ? { ...item, tabTitle: title } : item));
    setStatus(`标签页已重命名为 ${title}`);
  }, []);

  const renameTabFile = useCallback(async (tab: DocumentTab) => {
    if (!tab.path) {
      setStatus("当前标签页没有文件路径");
      return;
    }
    const nextName = window.prompt("重命名文件", tab.name);
    if (nextName === null) {
      return;
    }
    const name = nextName.trim();
    if (!name) {
      setStatus("文件名不能为空");
      return;
    }
    try {
      const file = await renameFile(tab.path, name);
      setTabs((current) => current.map((item) => item.id === tab.id ? {
        ...item,
        name: file.name,
        tabTitle: file.name,
        path: file.path,
        ...fileStateFromPayload(file),
        language: detectLanguage(file.name, customLanguages)
      } : item));
      setStatus(`文件已重命名为 ${file.name}`);
    } catch (error) {
      setStatus(`重命名失败：${String(error)}`);
    }
  }, [customLanguages]);

  const undo = useCallback(() => {
    let restoredCursor = 0;
    let didUndo = false;

    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== activeId || tab.history.length === 0) {
          return tab;
        }

        const previous = tab.history[tab.history.length - 1];
        restoredCursor = Math.min(cursor, previous.length);
        didUndo = true;
        return {
          ...tab,
          content: previous,
          history: tab.history.slice(0, -1)
        };
      })
    );

    if (!didUndo) {
      setStatus("没有可撤销的操作");
      editorRef.current?.focus();
      return;
    }

    setCursor(restoredCursor);
    setCurrentMatchIndex(-1);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(restoredCursor, restoredCursor);
    });
    setStatus("已撤销");
  }, [activeId, cursor]);

  const reloadCustomLanguages = useCallback(async (showFeedback = false) => {
    if (showFeedback) {
      setLanguageReloadFeedback("正在重新加载...");
    }
    try {
      const raw = await readCustomLanguagesConfig();
      const next = parseCustomLanguages(raw);
      setCustomLanguages(next);
      setTabs((current) => current.map((tab) => tab.path ? {
        ...tab,
        language: detectLanguage(tab.name, next)
      } : tab));
      if (showFeedback) {
        setLanguageReloadFeedback(`已重新加载 ${next.length} 个自定义语言`);
        window.setTimeout(() => setLanguageReloadFeedback(""), 2400);
      }
      setStatus(`已加载 ${next.length} 个自定义语言`);
    } catch (error) {
      if (showFeedback) {
        setLanguageReloadFeedback(`重新加载配置失败：${String(error)}`);
      }
      setStatus(`加载自定义语言失败：${String(error)}`);
    }
  }, []);

  const openCustomLanguagesConfig = useCallback(async () => {
    try {
      const file = await fetchCustomLanguagesConfig();
      const existing = tabs.find((tab) => tab.path === file.path);
      setIsSettingsOpen(false);
      if (existing) {
        setActiveId(existing.id);
        setStatus(`已切换到 ${existing.name}`);
        return;
      }

      const tab: DocumentTab = {
        id: createId(),
        name: file.name,
        path: file.path,
        content: file.content,
        savedContent: file.content,
        encoding: file.encoding,
        savedEncoding: file.encoding,
        lineEnding: file.line_ending,
        savedLineEnding: file.line_ending,
        ...fileStateFromPayload(file),
        language: detectLanguage(file.name, customLanguages),
        history: []
      };
      setTabs((current) => [...current, tab]);
      setActiveId(tab.id);
      setStatus(`已打开自定义语言配置 ${file.name}`);
    } catch (error) {
      setStatus(`打开自定义语言配置失败：${String(error)}`);
    }
  }, [customLanguages, tabs]);

  const updateGlobalFont = useCallback((changes: Partial<FontChoice>) => {
    setGlobalFont((current) => {
      const next = { ...current, ...changes };
      saveFontChoice(next);
      return next;
    });
  }, []);

  const updateStartupPolicy = useCallback((policy: StartupPolicy) => {
    setStartupPolicy(policy);
    saveStartupPolicy(policy);
  }, []);

  const updateLanguageFont = useCallback((language: string, changes: Partial<LanguageFontChoice>) => {
    setLanguageFonts((current) => {
      const nextChoice = {
        family: current[language]?.family ?? "default",
        size: current[language]?.size ?? "default",
        ...changes
      };
      const next = {
        ...current,
        [language]: nextChoice
      };
      saveLanguageFontChoices(next);
      return next;
    });
  }, []);

  const getSelectedText = useCallback(() => {
    const selection = editorRef.current?.getSelectionRange();
    if (!selection || selection.start === selection.end) {
      return "";
    }
    return activeTab.content.slice(selection.start, selection.end);
  }, [activeTab.content]);

  const closeSearchWidget = useCallback(() => {
    setIsSearchWidgetOpen(false);
    setQuery("");
    setReplaceText("");
    setMatches([]);
    setCurrentMatchIndex(-1);
    setSearchError("");
    setIsSearching(false);
    editorRef.current?.focus();
  }, []);

  const openSearchWidget = useCallback((mode: "search" | "replace") => {
    const selectedText = getSelectedText().trim();
    if (selectedText) {
      setQuery(selectedText);
      setCurrentMatchIndex(-1);
    }

    setSearchWidgetMode(mode);
    setIsSearchWidgetOpen(true);
    requestAnimationFrame(() => {
      document.getElementById(mode === "replace" ? "replace-input" : "search-input")?.focus();
    });
  }, [getSelectedText]);

  const toggleLineComment = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const comment = activeLanguage.comment;
    const selection = editor.getSelectionRange();
    const start = selection.start;
    const end = selection.end;
    const hasSelection = start !== end;
    const selectedText = activeTab.content.slice(start, end);

    if (comment.line) {
      const range = hasSelection
        ? getSelectedLineRange(activeTab.content, start, end)
        : getCurrentLineRange(activeTab.content, start);
      const segment = activeTab.content.slice(range.start, range.end);
      const lines = segment.split("\n");
      const uncomment = lines
        .filter((line) => line.trim().length > 0)
        .every((line) => line.slice(line.match(/^\s*/)?.[0].length ?? 0).startsWith(comment.line ?? ""));
      const nextSegment = lines
        .map((line) => {
          if (!line.trim()) {
            return line;
          }

          const indent = line.match(/^\s*/)?.[0] ?? "";
          if (uncomment) {
            const offset = indent.length;
            const afterComment = line.slice(offset + comment.line!.length);
            return `${indent}${afterComment.startsWith(" ") ? afterComment.slice(1) : afterComment}`;
          }
          return `${indent}${comment.line} ${line.slice(indent.length)}`;
        })
        .join("\n");
      const nextContent = `${activeTab.content.slice(0, range.start)}${nextSegment}${activeTab.content.slice(range.end)}`;

      updateActiveContent(nextContent);
      const nextCursor = Math.min(range.start + nextSegment.length, nextContent.length);
      requestAnimationFrame(() => {
        editor.focus();
        if (hasSelection) {
          editor.setSelectionRange(range.start, range.start + nextSegment.length);
        } else {
          editor.setSelectionRange(nextCursor, nextCursor);
        }
      });
      setCursor(hasSelection ? range.start : nextCursor);
      setStatus(uncomment ? "已取消注释" : "已添加注释");
      return;
    }

    if (comment.blockStart && comment.blockEnd) {
      const hasWrappedComment =
        selectedText.startsWith(comment.blockStart) && selectedText.endsWith(comment.blockEnd);
      const nextSelectedText = hasWrappedComment
        ? selectedText.slice(comment.blockStart.length, selectedText.length - comment.blockEnd.length)
        : `${comment.blockStart}${selectedText}${comment.blockEnd}`;
      const nextContent = `${activeTab.content.slice(0, start)}${nextSelectedText}${activeTab.content.slice(end)}`;

      updateActiveContent(nextContent);
      requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(start, start + nextSelectedText.length);
      });
      setCursor(start + nextSelectedText.length);
      setStatus(hasWrappedComment ? "已取消块注释" : "已添加块注释");
      return;
    }

    setStatus(`${activeLanguage.name} 未配置注释符`);
  }, [activeLanguage, activeTab.content, updateActiveContent]);

  const lineStarts = useMemo(() => buildLineStarts(activeTab.content), [activeTab.content]);

  useEffect(() => {
    const runId = searchRunRef.current + 1;
    searchRunRef.current = runId;
    setCurrentMatchIndex(-1);

    if (!query) {
      setMatches([]);
      setIsSearching(false);
      setSearchError("");
      return;
    }

    try {
      if (searchOptions.regex || searchOptions.wholeWord) {
        createSearchRegex(query, searchOptions);
      }
    } catch (error) {
      setMatches([]);
      setIsSearching(false);
      setSearchError(String(error));
      return;
    }

    let timer = 0;
    let position = 0;
    const collected: SearchMatch[] = [];
    const chunkSize = 256 * 1024;
    const overlap = searchOptions.regex ? 1024 : Math.max(0, query.length - 1);

    setMatches([]);
    setSearchError("");
    setIsSearching(true);

    const scanChunk = () => {
      if (searchRunRef.current !== runId) {
        return;
      }

      const started = performance.now();
      while (position < activeTab.content.length && performance.now() - started < 12) {
        const start = position;
        const end = Math.min(activeTab.content.length, start + chunkSize);
        const scanEnd = Math.min(activeTab.content.length, end + overlap);
        const chunkMatches = findMatchesInRange(activeTab.content, query, searchOptions, start, scanEnd)
          .filter((match) => match.start >= start && match.start < end);
        collected.push(...chunkMatches);
        position = end;
      }

      setMatches([...collected]);
      if (position < activeTab.content.length) {
        timer = window.setTimeout(scanChunk, 0);
        return;
      }

      setIsSearching(false);
    };

    timer = window.setTimeout(scanChunk, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab.content, query, searchOptions]);

  const visibleMatchIndex = useMemo(() => {
    if (!matches.length) {
      return -1;
    }
    if (currentMatchIndex >= 0) {
      return currentMatchIndex;
    }
    const selection = editorRef.current?.getSelectionRange();
    if (!selection || selection.start === selection.end) {
      return -1;
    }
    return matches.findIndex((match) => match.start === selection.start && match.end === selection.end);
  }, [currentMatchIndex, cursor, matches]);

  const selectMatch = useCallback((index: number) => {
    const match = matches[index];
    if (!match) {
      return;
    }

    const editor = editorRef.current;
    editor?.setSelectionRange(match.start, match.end);
    editor?.scrollToOffset(match.start);
    setCursor(match.end);
    setCurrentMatchIndex(index);
    setStatus(`匹配 ${index + 1}/${matches.length}`);
  }, [lineStarts, matches]);

  const findNext = useCallback(() => {
    if (!query) {
      editorRef.current?.focus();
      return;
    }

    if (!matches.length) {
      if (isSearching) {
        setStatus("Searching...");
        return;
      }
      setStatus("没有匹配结果");
      return;
    }

    const selectionEnd = editorRef.current?.getSelectionRange().end ?? cursor;
    const nextIndex =
      currentMatchIndex >= 0
        ? (currentMatchIndex + 1) % matches.length
        : matches.findIndex((match) => match.start >= selectionEnd);
    selectMatch(nextIndex === -1 ? 0 : nextIndex);
  }, [currentMatchIndex, cursor, isSearching, matches, query, selectMatch]);

  const findPrevious = useCallback(() => {
    if (!query) {
      editorRef.current?.focus();
      return;
    }

    if (!matches.length) {
      if (isSearching) {
        setStatus("Searching...");
        return;
      }
      setStatus("没有匹配结果");
      return;
    }

    const selectionStart = editorRef.current?.getSelectionRange().start ?? cursor;
    const previousIndex =
      currentMatchIndex >= 0
        ? (currentMatchIndex - 1 + matches.length) % matches.length
        : findPreviousMatchIndex(matches, selectionStart);
    selectMatch(previousIndex === -1 ? matches.length - 1 : previousIndex);
  }, [currentMatchIndex, cursor, isSearching, matches, query, selectMatch]);

  const replaceMatches = useCallback(() => {
    if (!query) {
      editorRef.current?.focus();
      return;
    }

    if (isSearching) {
      setStatus("Search is still running");
      return;
    }

    if (!matches.length) {
      setStatus("没有匹配结果");
      return;
    }

    const editor = editorRef.current;
    const selection = editor?.getSelectionRange();
    const range =
      replaceScope === "selection" && selection && selection.start !== selection.end
        ? getSelectedLineRange(activeTab.content, selection.start, selection.end)
        : { start: 0, end: activeTab.content.length };
    const scopedMatches = matches.filter(
      (match) => match.start >= range.start && match.end <= range.end
    );

    if (!scopedMatches.length) {
      setStatus(replaceScope === "selection" ? "选中行内没有匹配结果" : "没有匹配结果");
      editor?.focus();
      return;
    }

    let nextContent = "";
    let position = 0;
    for (const match of scopedMatches) {
      nextContent += activeTab.content.slice(position, match.start);
      nextContent += replaceText;
      position = match.end;
    }
    nextContent += activeTab.content.slice(position);

    updateActiveContent(nextContent);
    const nextCursor = scopedMatches[0].start + replaceText.length;
    setCursor(nextCursor);
    setCurrentMatchIndex(-1);
    requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(nextCursor, nextCursor);
    });
    setStatus(`已替换 ${scopedMatches.length} 处`);
  }, [activeTab.content, isSearching, matches, query, replaceScope, replaceText, updateActiveContent]);

  const jumpToLine = useCallback(() => {
    const totalLines = lineStarts.length;
    const currentLine = lineAndColumnFromStarts(activeTab.content, cursor, lineStarts).line;
    const input = window.prompt(`跳转到行号（1-${totalLines}）`, String(currentLine));
    if (input === null) {
      editorRef.current?.focus();
      return;
    }

    const requestedLine = Number.parseInt(input.trim(), 10);
    if (!Number.isFinite(requestedLine) || requestedLine < 1) {
      setStatus("请输入有效行号");
      editorRef.current?.focus();
      return;
    }

    const targetLine = Math.min(requestedLine, totalLines);
    const targetCursor = lineStarts[targetLine - 1] ?? 0;

    editorRef.current?.setSelectionRange(targetCursor, targetCursor);
    editorRef.current?.scrollToOffset(targetCursor);
    setCursor(targetCursor);
    setStatus(`已跳转到第 ${targetLine} 行`);
  }, [activeTab.content, cursor, lineStarts]);

  const handleEditorWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setEditorZoom((current) => {
      const next = Math.min(maxEditorZoom, Math.max(minEditorZoom, current + direction * editorZoomStep));
      return next === current ? current : next;
    });
  }, []);

  const getMatchedSelectedLineRanges = useCallback(() => {
    const selection = editorRef.current?.getSelectionRange();
    if (!selection || selection.start === selection.end) {
      return [getSelectedLineRange(activeTab.content, cursor, cursor)];
    }

    const selectedText = activeTab.content.slice(selection.start, selection.end);
    if (!selectedText) {
      return [getSelectedLineRange(activeTab.content, selection.start, selection.end)];
    }

    const exactMatches: SearchMatch[] = [];
    let index = activeTab.content.indexOf(selectedText);
    while (index !== -1) {
      exactMatches.push({ start: index, end: index + selectedText.length });
      index = activeTab.content.indexOf(selectedText, index + Math.max(selectedText.length, 1));
    }

    const ranges = (exactMatches.length ? exactMatches : [{ start: selection.start, end: selection.end }])
      .map((match) => getSelectedLineRange(activeTab.content, match.start, match.end))
      .sort((first, second) => first.start - second.start || first.end - second.end);

    return ranges.filter((range, rangeIndex) => {
      const previous = ranges[rangeIndex - 1];
      return !previous || previous.start !== range.start || previous.end !== range.end;
    });
  }, [activeTab.content, cursor]);

  const updateContentWithSelection = useCallback((content: string, start: number, end = start) => {
    updateActiveContent(content);
    setCursor(end);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(start, end);
    });
  }, [updateActiveContent]);

  const copyLines = useCallback(async (mode: "random" | "odd" | "even") => {
    const lines = activeTab.content.split("\n");
    let selected: string[] = [];
    if (mode === "random") {
      const input = window.prompt("随机复制多少行？", "1");
      if (input === null) return;
      const count = Math.max(0, Math.min(lines.length, Number.parseInt(input, 10) || 0));
      selected = [...lines].sort(() => Math.random() - 0.5).slice(0, count);
    } else {
      selected = lines.filter((_, index) => mode === "odd" ? index % 2 === 0 : index % 2 === 1);
    }
    await copyText(selected.join("\n"), `已复制 ${selected.length} 行`);
  }, [activeTab.content, copyText]);

  const highlightSelectedLines = useCallback(() => {
    const ranges = getMatchedSelectedLineRanges();
    setLineHighlights(ranges);
    if (ranges.length) {
      editorRef.current?.scrollToOffset(ranges[0].start);
    }
    setStatus(`已高亮 ${ranges.length} 个匹配行`);
  }, [getMatchedSelectedLineRanges]);

  const copySelectedLines = useCallback(async () => {
    const ranges = getMatchedSelectedLineRanges();
    await copyText(ranges.map((range) => activeTab.content.slice(range.start, range.end)).join("\n"), `已复制 ${ranges.length} 个匹配行`);
  }, [activeTab.content, copyText, getMatchedSelectedLineRanges]);

  const deleteSelectedLines = useCallback(() => {
    const ranges = getMatchedSelectedLineRanges();
    let next = activeTab.content;
    [...ranges].reverse().forEach((range) => {
      const removeEnd = next[range.end] === "\n" ? range.end + 1 : range.end;
      next = `${next.slice(0, range.start)}${next.slice(removeEnd)}`;
    });
    updateContentWithSelection(next, Math.min(ranges[0]?.start ?? 0, next.length));
    setStatus(`已删除 ${ranges.length} 个匹配行`);
  }, [activeTab.content, getMatchedSelectedLineRanges, updateContentWithSelection]);

  const deleteEmptyLines = useCallback(() => {
    const lines = activeTab.content.split("\n");
    const nextLines = lines.filter((line) => line.trim().length > 0);
    const removed = lines.length - nextLines.length;
    const next = nextLines.join("\n");
    updateContentWithSelection(next, Math.min(cursor, next.length));
    setStatus(removed ? `已删除 ${removed} 个空行` : "没有空行可删除");
  }, [activeTab.content, cursor, updateContentWithSelection]);

  const trimSelectedLineEdges = useCallback((edge: "start" | "end") => {
    const ranges = getMatchedSelectedLineRanges();
    let next = activeTab.content;
    [...ranges].reverse().forEach((range) => {
      const segment = next.slice(range.start, range.end);
      const trimmed = segment
        .split("\n")
        .map((line) => edge === "start" ? line.replace(/^\s+/, "") : line.replace(/\s+$/, ""))
        .join("\n");
      next = `${next.slice(0, range.start)}${trimmed}${next.slice(range.end)}`;
    });
    updateContentWithSelection(next, Math.min(ranges[0]?.start ?? 0, next.length));
    setStatus(edge === "start" ? "已删除行首空格" : "已删除行尾空格");
  }, [activeTab.content, getMatchedSelectedLineRanges, updateContentWithSelection]);

  const keepSelectedLines = useCallback(() => {
    const ranges = getMatchedSelectedLineRanges();
    const selected = ranges.map((range) => activeTab.content.slice(range.start, range.end)).join("\n");
    updateContentWithSelection(selected, 0, selected.length);
    setStatus(`已保留 ${ranges.length} 个匹配行`);
  }, [activeTab.content, getMatchedSelectedLineRanges, updateContentWithSelection]);

  const stats = useMemo(() => {
    const lines = lineStarts.length;
    const words = activeTab.content.trim() ? activeTab.content.trim().split(/\s+/).length : 0;
    return {
      lines,
      words,
      chars: activeTab.content.length,
      ...lineAndColumnFromStarts(activeTab.content, cursor, lineStarts)
    };
  }, [activeTab.content, cursor, lineStarts]);

  const searchResults = useMemo(() => {
    return matches.slice(0, 1000).map((match, index) => {
      const lineIndex = getLineIndexAtOffset(lineStarts, match.start);
      const lineStart = lineStarts[lineIndex] ?? 0;
      const lineEnd = lineIndex + 1 < lineStarts.length
        ? Math.max(lineStart, lineStarts[lineIndex + 1] - 1)
        : activeTab.content.length;
      const lineText = activeTab.content.slice(lineStart, lineEnd).trim() || "(empty line)";
      return {
        index,
        line: lineIndex + 1,
        column: match.start - lineStart + 1,
        text: lineText.length > 180 ? `${lineText.slice(0, 180)}...` : lineText
      };
    });
  }, [activeTab.content, lineStarts, matches]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }
    let canceled = false;
    const timer = window.setTimeout(() => {
      void listSystemFonts()
        .then((fonts) => {
          if (!canceled && fonts.length) {
            setSystemFonts(fonts);
          }
        })
        .catch(() => {
          if (!canceled) {
            setSystemFonts(fallbackFontFamilies);
          }
        });
    }, 0);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    const closeMenus = () => {
      setTabContextMenu(null);
      setLineMenu(null);
      setMoreMenu(null);
    };
    window.addEventListener("click", closeMenus);
    window.addEventListener("scroll", closeMenus, true);
    return () => {
      window.removeEventListener("click", closeMenus);
      window.removeEventListener("scroll", closeMenus, true);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey)) {
        return;
      }

      const key = event.key.toLowerCase();
      const target = event.target instanceof Element ? event.target : null;
      const isCodeMirrorEvent = Boolean(target?.closest(".cm-editor"));
      if (isCodeMirrorEvent && (key === "z" || key === "/")) {
        return;
      }
      if (key === "n") {
        event.preventDefault();
        addNewTab();
      }
      if (key === "o") {
        event.preventDefault();
        void openFile();
      }
      if (key === "s" && event.shiftKey) {
        event.preventDefault();
        void saveAs();
      } else if (key === "s") {
        event.preventDefault();
        void save();
      }
      if (key === "f") {
        event.preventDefault();
        openSearchWidget("search");
      }
      if (key === "g") {
        event.preventDefault();
        jumpToLine();
      }
      if (key === "r") {
        event.preventDefault();
        openSearchWidget("replace");
      }
      if (key === "z") {
        event.preventDefault();
        undo();
      }
      if (key === "/") {
        event.preventDefault();
        toggleLineComment();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addNewTab, jumpToLine, openFile, openSearchWidget, save, saveAs, toggleLineComment, undo]);

  useEffect(() => {
    hasUnsavedTabsRef.current = hasUnsavedTabs;
  }, [hasUnsavedTabs]);

  useEffect(() => {
    saveSession(tabs, activeId);
  }, [activeId, tabs]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadCustomLanguages();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [reloadCustomLanguages]);

  useEffect(() => {
    if (startupFilesLoadedRef.current) {
      return;
    }

    startupFilesLoadedRef.current = true;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(async () => {
        try {
          const files = await getStartupFiles();
          openFilesFromPayloads(files);
        } catch (error) {
          setStatus(`Startup file open failed: ${String(error)}`);
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [openFilesFromPayloads]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        void openFilesByPath(event.payload.paths);
      }
    }).then((value) => {
      unlisten = value;
    });

    return () => unlisten?.();
  }, [openFilesByPath]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<string[]>("open-files", (event) => {
      void openFilesByPath(event.payload);
    }).then((value) => {
      unlisten = value;
    });

    return () => unlisten?.();
  }, [openFilesByPath]);

  useEffect(() => {
    if (!activeTab.path) {
      return;
    }

    const checkExternalChange = async () => {
      try {
        const state = await getFileState(activeTab.path!);
        const key = `${activeTab.path}:${activeTab.diskModifiedMs ?? "missing"}:${activeTab.diskSize ?? "missing"}`;
        if (hasFileStateChanged(activeTab, state)) {
          if (!externalChangeNotifiedRef.current.has(key)) {
            externalChangeNotifiedRef.current.add(key);
            setStatus(`"${activeTab.name}" changed on disk`);
          }
        } else {
          externalChangeNotifiedRef.current.delete(key);
        }
      } catch {
        // Save-time checks still handle actionable errors; keep background polling quiet.
      }
    };

    const timer = window.setInterval(checkExternalChange, 4000);
    void checkExternalChange();
    return () => window.clearInterval(timer);
  }, [activeTab.diskModifiedMs, activeTab.diskSize, activeTab.name, activeTab.path]);

  useEffect(() => {
    if (!isLanguagePickerOpen && !isEncodingPickerOpen && !isLineEndingPickerOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && languagePickerRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Node && encodingPickerRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Node && lineEndingPickerRef.current?.contains(target)) {
        return;
      }

      setIsLanguagePickerOpen(false);
      setIsEncodingPickerOpen(false);
      setIsLineEndingPickerOpen(false);
      setLanguageSearch("");
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [isEncodingPickerOpen, isLanguagePickerOpen, isLineEndingPickerOpen]);

  useEffect(() => {
    const title = activeTab?.name ? `${isDirty ? "• " : ""}${activeTab.name}` : "Notely";
    document.title = title;
    void getCurrentWindow().setTitle(title);
    void setWindowTitle(title);
  }, [activeTab?.name, isDirty]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void appWindow.onCloseRequested((event) => {
      if (!hasUnsavedTabsRef.current) {
        return;
      }

      const shouldClose = window.confirm("还有未保存的文件，确定关闭应用吗？");
      event.preventDefault();
      if (shouldClose) {
        void appWindow.destroy();
      }
    }).then((handler) => {
      unlisten = handler;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="window-title">
          <img className="app-mark" src={appIcon} alt="" aria-hidden="true" />
          <span title={activeTab.path ?? activeTab.name}>{activeTab.name}</span>
        </div>
        <div className="toolbar" aria-label="文件操作">
          <button title="新建" onClick={addNewTab}>
            <FilePlus2 size={17} />
          </button>
          <button title="打开" onClick={() => void openFile()}>
            <FolderOpen size={17} />
          </button>
          <button title="保存" onClick={() => void save()} disabled={!isDirty && Boolean(activeTab.path)}>
            <Save size={17} />
          </button>
          <button title="另存为" onClick={() => void saveAs()}>
            <SaveAll size={17} />
          </button>
          <button
            title="行操作"
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              setTabContextMenu(null);
              setMoreMenu(null);
              setLineMenu({ x: rect.left, y: rect.bottom + 6 });
            }}
          >
            <List size={17} />
          </button>
          <button
            title="显示更多"
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              setTabContextMenu(null);
              setLineMenu(null);
              setMoreMenu({ x: rect.left, y: rect.bottom + 6 });
            }}
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
        <div className="searchbar">
          <Search size={15} />
          <input
            id="topbar-search-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentMatchIndex(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "ArrowDown") {
                event.preventDefault();
                findNext();
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                findPrevious();
              }
            }}
            placeholder="查找"
          />
          <button
            className={searchOptions.caseSensitive ? "search-option is-active" : "search-option"}
            title="Match case"
            onClick={() => setSearchOptions((current) => ({ ...current, caseSensitive: !current.caseSensitive }))}
          >
            Aa
          </button>
          <button
            className={searchOptions.regex ? "search-option is-active" : "search-option"}
            title="Use regular expression"
            onClick={() => setSearchOptions((current) => ({ ...current, regex: !current.regex }))}
          >
            .*
          </button>
          <button
            className={searchOptions.wholeWord ? "search-option is-active" : "search-option"}
            title="Match whole word"
            onClick={() => setSearchOptions((current) => ({ ...current, wholeWord: !current.wholeWord }))}
          >
            W
          </button>
          <button
            className={isSearchResultsOpen ? "search-option is-active" : "search-option"}
            title="Search results"
            onClick={() => setIsSearchResultsOpen((value) => !value)}
          >
            <List size={14} />
          </button>
          <button title="上一个匹配" onClick={findPrevious} disabled={!matches.length || Boolean(searchError)}>
            <ChevronUp size={15} />
          </button>
          <button title="下一个匹配" onClick={findNext} disabled={!matches.length || Boolean(searchError)}>
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="replacebar">
          <Replace size={15} />
          <input
            id="topbar-replace-input"
            value={replaceText}
            onChange={(event) => setReplaceText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                replaceMatches();
              }
            }}
            placeholder="替换为"
          />
          <select
            value={replaceScope}
            onChange={(event) => setReplaceScope(event.target.value as ReplaceScope)}
            title="替换范围"
          >
            <option value="all">全局</option>
            <option value="selection">选中行</option>
          </select>
          <button title="执行替换" onClick={replaceMatches} disabled={!query || !matches.length || isSearching || Boolean(searchError)}>
            替换
          </button>
        </div>
        <span
          className="app-version-badge"
          aria-label="当前软件版本"
          title="当前软件版本"
        >
          v.1.0
        </span>
        <button
          className={wordWrap ? "toggle is-active" : "toggle"}
          title="自动换行"
          onClick={() => setWordWrap((value) => !value)}
        >
          <WrapText size={17} />
        </button>
        <button
          className={isSettingsOpen ? "toggle is-active" : "toggle"}
          title="设置"
          onClick={() => setIsSettingsOpen((value) => !value)}
        >
          <Settings2 size={17} />
        </button>
      </header>

      <nav
        className="tabstrip"
        aria-label="打开的文档"
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) {
            addNewTab();
          }
        }}
      >
        {tabs.map((tab) => {
          const dirty = isTabDirty(tab);
          return (
            <button
              key={tab.id}
              className={tab.id === activeId ? "tab is-active" : "tab"}
              onClick={() => setActiveId(tab.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setActiveId(tab.id);
                setTabContextMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
              }}
              title={tab.path ? `${tab.tabTitle ?? tab.name}\n${tab.path}` : (tab.tabTitle ?? tab.name)}
            >
              <span className="tab-name">{dirty ? "• " : ""}{tab.tabTitle ?? tab.name}</span>
              <span
                className="tab-close"
                role="button"
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
                title="关闭"
              >
                <X size={13} />
              </span>
            </button>
          );
        })}
      </nav>

      <section className={wordWrap ? "editor-wrap is-wrapping" : "editor-wrap"}>
          <div className="editor-pane">
            <Suspense fallback={<div className="editor-loading" aria-label="正在加载编辑器" />}>
              <CodeMirrorEditor
                ref={editorRef}
                content={activeTab.content}
                wordWrap={wordWrap}
                displayOptions={displayOptions}
                matches={matches}
                currentMatchIndex={currentMatchIndex}
                lineHighlights={lineHighlights}
                fontStyle={editorFontStyle}
                language={activeLanguage}
                onChange={updateActiveContent}
                onCursorChange={setCursor}
                onCurrentMatchReset={() => setCurrentMatchIndex(-1)}
                onLineHighlightsClear={() => setLineHighlights([])}
                onOpenSearchWidget={openSearchWidget}
                onZoomWheel={handleEditorWheel}
              />
            </Suspense>
            {isSearchWidgetOpen ? (
              <section className="search-widget" aria-label="Search and replace">
                <div className="search-widget-row">
                  <Search size={15} />
                  <input
                    id="search-input"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setCurrentMatchIndex(-1);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.shiftKey ? findPrevious() : findNext();
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        findNext();
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        findPrevious();
                      }
                      if (event.key === "Escape") {
                        closeSearchWidget();
                      }
                    }}
                    placeholder="Find"
                  />
                  <span className="search-count">
                    {searchError
                      ? "搜索表达式无效"
                      : isSearching
                        ? `搜索中 ${matches.length}`
                        : matches.length
                          ? `匹配 ${matches.length} (${Math.max(visibleMatchIndex + 1, 1)}/${matches.length})`
                          : "匹配 0"}
                  </span>
                  <button
                    className={searchOptions.caseSensitive ? "search-option is-active" : "search-option"}
                    title="Match case"
                    onClick={() => setSearchOptions((current) => ({ ...current, caseSensitive: !current.caseSensitive }))}
                  >
                    Aa
                  </button>
                  <button
                    className={searchOptions.regex ? "search-option is-active" : "search-option"}
                    title="Use regular expression"
                    onClick={() => setSearchOptions((current) => ({ ...current, regex: !current.regex }))}
                  >
                    .*
                  </button>
                  <button
                    className={searchOptions.wholeWord ? "search-option is-active" : "search-option"}
                    title="Match whole word"
                    onClick={() => setSearchOptions((current) => ({ ...current, wholeWord: !current.wholeWord }))}
                  >
                    W
                  </button>
                  <button
                    className={isSearchResultsOpen ? "search-option is-active" : "search-option"}
                    title="Search results"
                    onClick={() => setIsSearchResultsOpen((value) => !value)}
                  >
                    <List size={14} />
                  </button>
                  <button title="Previous match" onClick={findPrevious} disabled={!matches.length || Boolean(searchError)}>
                    <ChevronUp size={15} />
                  </button>
                  <button title="Next match" onClick={findNext} disabled={!matches.length || Boolean(searchError)}>
                    <ChevronDown size={15} />
                  </button>
                  <button title="Close" onClick={closeSearchWidget}>
                    <X size={15} />
                  </button>
                </div>
                {searchWidgetMode === "replace" ? (
                  <div className="search-widget-row replace-row">
                    <Replace size={15} />
                    <input
                      id="replace-input"
                      value={replaceText}
                      onChange={(event) => setReplaceText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          replaceMatches();
                        }
                        if (event.key === "Escape") {
                          closeSearchWidget();
                        }
                      }}
                      placeholder="Replace"
                    />
                    <select
                      value={replaceScope}
                      onChange={(event) => setReplaceScope(event.target.value as ReplaceScope)}
                      title="Replace scope"
                    >
                      <option value="all">All</option>
                      <option value="selection">Selection</option>
                    </select>
                    <button title="Replace" onClick={replaceMatches} disabled={!query || !matches.length || isSearching || Boolean(searchError)}>
                      Replace
                    </button>
                  </div>
                ) : null}
                {isSearchResultsOpen ? (
                  <div className="search-widget-results">
                    {searchError ? (
                      <p className="search-results-empty">{searchError}</p>
                    ) : searchResults.length > 0 ? (
                      <div className="search-results-list">
                        {searchResults.map((result) => (
                          <button
                            key={`${result.index}-${result.line}-${result.column}`}
                            className={result.index === currentMatchIndex ? "is-active" : undefined}
                            onClick={() => selectMatch(result.index)}
                          >
                            <span>
                              Line {result.line}, Col {result.column}
                            </span>
                            <small>{result.text}</small>
                          </button>
                        ))}
                        {matches.length > searchResults.length ? (
                          <p className="search-results-empty">Showing first {searchResults.length} results</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="search-results-empty">{query ? "No results" : "Enter a search term"}</p>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
     </section>

     {tabContextMenu ? (() => {
       const tab = tabs.find((item) => item.id === tabContextMenu.tabId);
       if (!tab) {
         return null;
       }
       return (
         <div
           className="context-menu"
           style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
           onClick={(event) => event.stopPropagation()}
           onPointerDown={(event) => event.stopPropagation()}
         >
           <button onClick={() => { closeTab(tab.id); setTabContextMenu(null); }}>关闭</button>
           <button onClick={() => { closeOtherTabs(tab.id); setTabContextMenu(null); }}>关闭其他</button>
           <button onClick={() => { closeSavedTabs(); setTabContextMenu(null); }}>关闭已保存</button>
           <button onClick={() => { closeAllTabs(); setTabContextMenu(null); }}>全部关闭</button>
           <div className="context-menu-separator" />
           <button onClick={() => { renameTab(tab); setTabContextMenu(null); }}>重命名标签页</button>
           <button disabled={!tab.path} onClick={() => { void renameTabFile(tab); setTabContextMenu(null); }}>重命名文件</button>
           <div className="context-menu-separator" />
           <button onClick={() => { void saveTabAs(tab); setTabContextMenu(null); }}>另存为</button>
           <button disabled={!tab.path} onClick={() => { void copyText(tab.path ?? "", "已复制文件路径"); setTabContextMenu(null); }}>复制文件路径</button>
           <button disabled={!tab.path} onClick={() => { void revealTabInFileManager(tab); setTabContextMenu(null); }}>在文件资源管理器中打开</button>
         </div>
       );
     })() : null}

     {lineMenu ? (
       <div
         className="context-menu"
         style={{ left: lineMenu.x, top: lineMenu.y }}
         onClick={(event) => event.stopPropagation()}
         onPointerDown={(event) => event.stopPropagation()}
       >
         <button onClick={() => { void copyLines("random"); setLineMenu(null); }}>随机复制N行</button>
         <button onClick={() => { void copyLines("odd"); setLineMenu(null); }}>复制奇数行</button>
         <button onClick={() => { void copyLines("even"); setLineMenu(null); }}>复制偶数行</button>
         <button onClick={() => { deleteEmptyLines(); setLineMenu(null); }}>删除空行</button>
         {editorRef.current?.getSelectionRange().start !== editorRef.current?.getSelectionRange().end ? (
           <>
             <div className="context-menu-separator" />
             <button onClick={() => { highlightSelectedLines(); setLineMenu(null); }}>高亮所在行</button>
             <button onClick={() => { void copySelectedLines(); setLineMenu(null); }}>复制所在行</button>
             <button onClick={() => { deleteSelectedLines(); setLineMenu(null); }}>删除所在行</button>
             <button onClick={() => { keepSelectedLines(); setLineMenu(null); }}>删除所在行之外的行</button>
             <button onClick={() => { trimSelectedLineEdges("start"); setLineMenu(null); }}>删除行首空格</button>
             <button onClick={() => { trimSelectedLineEdges("end"); setLineMenu(null); }}>删除行尾空格</button>
           </>
         ) : null}
       </div>
     ) : null}

     {moreMenu ? (
       <div
         className="context-menu context-menu-checks"
         style={{ left: moreMenu.x, top: moreMenu.y }}
         onClick={(event) => event.stopPropagation()}
         onPointerDown={(event) => event.stopPropagation()}
       >
         <button onClick={() => setDisplayOptions((current) => ({ ...current, showSpaces: !current.showSpaces }))}>
           <span>{displayOptions.showSpaces ? "✓" : ""}</span>显示空格
         </button>
         <button onClick={() => setDisplayOptions((current) => ({ ...current, showLineBreaks: !current.showLineBreaks }))}>
           <span>{displayOptions.showLineBreaks ? "✓" : ""}</span>显示换行符
         </button>
         <button onClick={() => setDisplayOptions((current) => ({ ...current, showTabs: !current.showTabs }))}>
           <span>{displayOptions.showTabs ? "✓" : ""}</span>显示制表符
         </button>
         <button onClick={() => setDisplayOptions((current) => ({ ...current, showIndentGuides: !current.showIndentGuides }))}>
           <span>{displayOptions.showIndentGuides ? "✓" : ""}</span>显示对齐线
         </button>
       </div>
     ) : null}

     {false ? (
        <aside className="search-results-panel" aria-label="Search results">
          <div className="search-results-header">
            <strong>Search Results</strong>
            <small>
              {searchError
                ? "Invalid pattern"
                : isSearching
                  ? `Searching... ${matches.length}`
                  : `${matches.length} matches`}
            </small>
          </div>
          {searchError ? (
            <p className="search-results-empty">{searchError}</p>
          ) : searchResults.length > 0 ? (
            <div className="search-results-list">
              {searchResults.map((result) => (
                <button
                  key={`${result.index}-${result.line}-${result.column}`}
                  className={result.index === currentMatchIndex ? "is-active" : undefined}
                  onClick={() => selectMatch(result.index)}
                >
                  <span>
                    Line {result.line}, Col {result.column}
                  </span>
                  <small>{result.text}</small>
                </button>
              ))}
              {matches.length > searchResults.length ? (
                <p className="search-results-empty">Showing first {searchResults.length} results</p>
              ) : null}
            </div>
          ) : (
            <p className="search-results-empty">{query ? "No results" : "Enter a search term"}</p>
          )}
        </aside>
      ) : null}

      {isSettingsOpen ? (
        <div className="settings-overlay" onPointerDown={() => setIsSettingsOpen(false)}>
          <section
            className="settings-page"
            aria-label="设置"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <aside className="settings-nav">
              <button
                className={settingsSection === "editor" ? "is-active" : undefined}
                onClick={() => setSettingsSection("editor")}
              >
                编辑器
              </button>
              <button
                className={settingsSection === "languages" ? "is-active" : undefined}
                onClick={() => setSettingsSection("languages")}
              >
                语言
              </button>
            </aside>
            <div className="settings-content">
              {settingsSection === "editor" ? (
                <div className="settings-group">
                  <h2>编辑器</h2>
                  <label className="setting-row">
                    <span>
                      <strong>自动换行</strong>
                      <small>控制长行是否在编辑区内换行显示。</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={wordWrap}
                      onChange={(event) => setWordWrap(event.target.checked)}
                    />
                  </label>
                  <label className="setting-row">
                    <span>
                      <strong>启动时</strong>
                      <small>控制打开应用后显示新文件，还是恢复上次关闭时的标签页。</small>
                    </span>
                    <select
                      value={startupPolicy}
                      onChange={(event) => updateStartupPolicy(event.target.value as StartupPolicy)}
                    >
                      <option value="new">打开新文件</option>
                      <option value="restore">恢复上次文件</option>
                    </select>
                  </label>
                  <label className="setting-row">
                    <span>
                      <strong>全局字体</strong>
                      <small>所有语言默认使用的编辑器字体。</small>
                    </span>
                    <select
                      value={globalFont.family}
                      onChange={(event) => updateGlobalFont({ family: event.target.value })}
                    >
                      {fontFamilies.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="setting-row">
                    <span>
                      <strong>全局字号</strong>
                      <small>所有语言默认使用的编辑器字号。</small>
                    </span>
                    <select
                      value={globalFont.size}
                      onChange={(event) => updateGlobalFont({ size: event.target.value })}
                    >
                      {fontSizes.map((size) => (
                        <option key={size} value={size}>
                          {size}px
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <div className="settings-group">
                  <h2>语言</h2>
                  <label className="setting-row">
                    <span>
                      <strong>指定语言</strong>
                      <small>为某一种语言单独配置字体和字号。</small>
                    </span>
                    <select
                      value={selectedFontLanguage}
                      onChange={(event) => setSelectedFontLanguage(event.target.value)}
                    >
                      {builtInLanguages.map((language) => (
                        <option key={language.name} value={language.name}>
                          {language.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="setting-row">
                    <span>
                      <strong>指定语言字体</strong>
                      <small>default 表示继承全局字体。</small>
                    </span>
                    <select
                      value={languageFonts[selectedFontLanguage]?.family ?? "default"}
                      onChange={(event) =>
                        updateLanguageFont(selectedFontLanguage, { family: event.target.value })
                      }
                    >
                      <option value="default">default</option>
                      {fontFamilies.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="setting-row">
                    <span>
                      <strong>指定语言字号</strong>
                      <small>default 表示继承全局字号。</small>
                    </span>
                    <select
                      value={languageFonts[selectedFontLanguage]?.size ?? "default"}
                      onChange={(event) =>
                        updateLanguageFont(selectedFontLanguage, { size: event.target.value })
                      }
                    >
                      <option value="default">default</option>
                      {fontSizes.map((size) => (
                        <option key={size} value={size}>
                          {size}px
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      <footer className="statusbar">
        <span>{status}</span>
        <span>行 {stats.line}, 列 {stats.column}</span>
        <span>{stats.lines} 行</span>
        <span className="status-words">{stats.words} 词</span>
        <span className="status-chars">{stats.chars} 字符</span>
        <span className="status-zoom" title="按住 Ctrl 并滚动鼠标滚轮可调整文本显示比例">{editorZoom}%</span>
        <div className="status-language status-line-ending" ref={lineEndingPickerRef}>
          <button
            onClick={() => {
              setIsLineEndingPickerOpen((value) => !value);
              setIsEncodingPickerOpen(false);
              setIsLanguagePickerOpen(false);
            }}
          >
            {activeTab.lineEnding}
          </button>
          {isLineEndingPickerOpen ? (
            <div className="language-picker line-ending-picker" role="listbox">
              <div className="language-picker-list">
                {lineEndingOptions.map((lineEnding) => (
                  <button
                    key={lineEnding.value}
                    className={lineEnding.value === activeTab.lineEnding ? "is-active" : undefined}
                    onClick={() => {
                      switchLineEnding(lineEnding.value);
                      setIsLineEndingPickerOpen(false);
                    }}
                  >
                    <span>{lineEnding.label}</span>
                    <small>{lineEnding.detail}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="status-language status-encoding" ref={encodingPickerRef}>
          <button
            onClick={() => {
              setIsEncodingPickerOpen((value) => !value);
              setIsLanguagePickerOpen(false);
              setIsLineEndingPickerOpen(false);
            }}
          >
            {activeTab.encoding}
          </button>
          {isEncodingPickerOpen ? (
            <div className="language-picker encoding-picker" role="listbox">
              <div className="encoding-mode">
                <button
                  className={encodingAction === "reopen" ? "is-active" : undefined}
                  onClick={() => setEncodingAction("reopen")}
                >
                  Reopen
                </button>
                <button
                  className={encodingAction === "save" ? "is-active" : undefined}
                  onClick={() => setEncodingAction("save")}
                >
                  Save
                </button>
              </div>
              <div className="language-picker-list">
                {encodingOptions.map((encoding) => (
                  <button
                    key={encoding}
                    className={encoding === activeTab.encoding ? "is-active" : undefined}
                    onClick={() => {
                      if (encodingAction === "reopen") {
                        void reopenWithEncoding(encoding);
                      } else {
                        void saveWithEncoding(encoding);
                      }
                      setIsEncodingPickerOpen(false);
                    }}
                  >
                    <span>{encoding}</span>
                    <small>{encodingAction === "reopen" ? "Reopen from disk with this encoding" : "Save file with this encoding"}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="status-language status-current-language" ref={languagePickerRef}>
          <button
            onClick={() => {
              setIsLanguagePickerOpen((value) => !value);
              setIsEncodingPickerOpen(false);
              setIsLineEndingPickerOpen(false);
              setLanguageSearch("");
            }}
          >
            {activeTab.language}
          </button>
          {isLanguagePickerOpen ? (
            <div className="language-picker" role="listbox">
              <input
                value={languageSearch}
                onChange={(event) => setLanguageSearch(event.target.value)}
                placeholder="搜索语言或扩展名"
                autoFocus
              />
              <div className="language-picker-list">
                {filteredLanguageOptions.length > 0 ? (
                  filteredLanguageOptions.map((language) => (
                    <button
                      key={language.name}
                      className={language.name === activeTab.language ? "is-active" : undefined}
                      onClick={() => {
                        updateActiveTab({ language: language.name });
                        setIsLanguagePickerOpen(false);
                        setLanguageSearch("");
                      }}
                    >
                      <span className="language-picker-name">
                        <span>{language.name}</span>
                        {language.isCustom ? <em>自定义语言</em> : null}
                      </span>
                      <small>{language.extensions.map((extension) => `.${extension}`).join(" ") || "无扩展名"}</small>
                    </button>
                  ))
                ) : (
                  <span className="language-picker-empty">没有匹配的语言</span>
                )}
              </div>
              <div className="language-picker-actions">
                <button
                  onClick={() => {
                    setIsLanguagePickerOpen(false);
                    void openCustomLanguagesConfig();
                  }}
                >
                  打开配置文件
                </button>
                <button onClick={() => void reloadCustomLanguages(true)}>
                  重新应用配置文件
                </button>
                {languageReloadFeedback ? <span>{languageReloadFeedback}</span> : null}
              </div>
            </div>
          ) : null}
        </div>
      </footer>
    </main>
  );
}
