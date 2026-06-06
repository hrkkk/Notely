import { invoke } from "@tauri-apps/api/core";
import {
  FilePlus2,
  FolderOpen,
  Save,
  SaveAll,
  Search,
  X,
  WrapText
} from "lucide-react";
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type FilePayload = {
  path: string;
  name: string;
  content: string;
};

type DocumentTab = {
  id: string;
  name: string;
  path: string | null;
  content: string;
  savedContent: string;
  language: string;
};

const untitledName = "未命名";

const languageByExtension: Record<string, string> = {
  c: "C",
  cpp: "C++",
  cs: "C#",
  css: "CSS",
  go: "Go",
  h: "C/C++ Header",
  hpp: "C++ Header",
  html: "HTML",
  java: "Java",
  js: "JavaScript",
  json: "JSON",
  jsx: "React JSX",
  kt: "Kotlin",
  lua: "Lua",
  md: "Markdown",
  php: "PHP",
  py: "Python",
  rb: "Ruby",
  rs: "Rust",
  sh: "Shell",
  sql: "SQL",
  ts: "TypeScript",
  tsx: "React TSX",
  txt: "Text",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML"
};

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || untitledName;
}

function detectLanguage(name: string) {
  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  return (extension && languageByExtension[extension]) || "Plain Text";
}

function createEmptyTab(): DocumentTab {
  return {
    id: createId(),
    name: untitledName,
    path: null,
    content: "",
    savedContent: "",
    language: "Plain Text"
  };
}

function lineAndColumn(content: string, cursor: number) {
  const beforeCursor = content.slice(0, cursor);
  const lines = beforeCursor.split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

export default function App() {
  const [tabs, setTabs] = useState<DocumentTab[]>(() => [createEmptyTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [status, setStatus] = useState("就绪");
  const [query, setQuery] = useState("");
  const [wordWrap, setWordWrap] = useState(true);
  const [cursor, setCursor] = useState(0);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumbersRef = useRef<HTMLPreElement | null>(null);

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const isDirty = activeTab.content !== activeTab.savedContent;

  const updateActiveTab = useCallback((changes: Partial<DocumentTab>) => {
    setTabs((current) =>
      current.map((tab) => (tab.id === activeId ? { ...tab, ...changes } : tab))
    );
  }, [activeId]);

  const addNewTab = useCallback(() => {
    const tab = createEmptyTab();
    setTabs((current) => [...current, tab]);
    setActiveId(tab.id);
    setStatus("新建文档");
  }, []);

  const openFile = useCallback(async () => {
    try {
      const file = await invoke<FilePayload | null>("open_file_dialog");
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
        language: detectLanguage(file.name)
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
  }, [tabs]);

  const saveAs = useCallback(async () => {
    try {
      const file = await invoke<FilePayload | null>("save_file_dialog", {
        defaultPath: activeTab.path ?? activeTab.name,
        content: activeTab.content
      });
      if (!file) {
        setStatus("已取消保存");
        return false;
      }
      updateActiveTab({
        name: file.name,
        path: file.path,
        content: file.content,
        savedContent: file.content,
        language: detectLanguage(file.name)
      });
      setStatus(`已保存 ${file.name}`);
      return true;
    } catch (error) {
      setStatus(`保存失败：${String(error)}`);
      return false;
    }
  }, [activeTab, updateActiveTab]);

  const save = useCallback(async () => {
    if (!activeTab.path) {
      return saveAs();
    }

    try {
      await invoke("write_file", {
        path: activeTab.path,
        content: activeTab.content
      });
      updateActiveTab({ savedContent: activeTab.content });
      setStatus(`已保存 ${activeTab.name}`);
      return true;
    } catch (error) {
      setStatus(`保存失败：${String(error)}`);
      return false;
    }
  }, [activeTab, saveAs, updateActiveTab]);

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      const closing = current.find((tab) => tab.id === id);
      if (closing && closing.content !== closing.savedContent) {
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

  const findNext = useCallback(() => {
    if (!query.trim()) {
      editorRef.current?.focus();
      return;
    }

    const text = activeTab.content.toLowerCase();
    const needle = query.toLowerCase();
    const start = Math.max(editorRef.current?.selectionEnd ?? 0, 0);
    const foundAt = text.indexOf(needle, start);
    const wrappedAt = foundAt === -1 ? text.indexOf(needle, 0) : foundAt;

    if (wrappedAt === -1) {
      setStatus("没有匹配结果");
      return;
    }

    editorRef.current?.focus();
    editorRef.current?.setSelectionRange(wrappedAt, wrappedAt + query.length);
    setCursor(wrappedAt + query.length);
    setStatus(`找到第 ${wrappedAt + 1} 个字符`);
  }, [activeTab.content, query]);

  const stats = useMemo(() => {
    const lines = activeTab.content.length ? activeTab.content.split("\n").length : 1;
    const words = activeTab.content.trim() ? activeTab.content.trim().split(/\s+/).length : 0;
    return {
      lines,
      words,
      chars: activeTab.content.length,
      ...lineAndColumn(activeTab.content, cursor)
    };
  }, [activeTab.content, cursor]);

  const lineNumbers = useMemo(() => {
    return Array.from({ length: stats.lines }, (_, index) => index + 1).join("\n");
  }, [stats.lines]);

  const onEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const next = `${activeTab.content.slice(0, start)}  ${activeTab.content.slice(end)}`;
      updateActiveTab({ content: next });
      requestAnimationFrame(() => {
        target.selectionStart = start + 2;
        target.selectionEnd = start + 2;
        setCursor(start + 2);
      });
    }
  };

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      const key = event.key.toLowerCase();
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
        document.getElementById("search-input")?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addNewTab, openFile, save, saveAs]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="window-title">
          <span className="app-mark">N</span>
          <span>Notepad</span>
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
        </div>
        <div className="searchbar">
          <Search size={15} />
          <input
            id="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                findNext();
              }
            }}
            placeholder="查找"
          />
        </div>
        <button
          className={wordWrap ? "toggle is-active" : "toggle"}
          title="自动换行"
          onClick={() => setWordWrap((value) => !value)}
        >
          <WrapText size={17} />
        </button>
      </header>

      <nav className="tabstrip" aria-label="打开的文档">
        {tabs.map((tab) => {
          const dirty = tab.content !== tab.savedContent;
          return (
            <button
              key={tab.id}
              className={tab.id === activeId ? "tab is-active" : "tab"}
              onClick={() => setActiveId(tab.id)}
              title={tab.path ?? tab.name}
            >
              <span className="tab-name">{dirty ? "• " : ""}{tab.name}</span>
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

      <section className="editor-wrap">
        <pre ref={lineNumbersRef} className="line-numbers" aria-hidden="true">{lineNumbers}</pre>
        <textarea
          ref={editorRef}
          value={activeTab.content}
          spellCheck={false}
          wrap={wordWrap ? "soft" : "off"}
          onChange={(event) => {
            updateActiveTab({ content: event.target.value });
            setCursor(event.target.selectionStart);
          }}
          onKeyDown={onEditorKeyDown}
          onClick={(event) => setCursor(event.currentTarget.selectionStart)}
          onKeyUp={(event) => setCursor(event.currentTarget.selectionStart)}
          onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
          onScroll={(event) => {
            if (lineNumbersRef.current) {
              lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
            }
          }}
          aria-label="文本编辑器"
        />
      </section>

      <footer className="statusbar">
        <span>{status}</span>
        <span>{activeTab.language}</span>
        <span>行 {stats.line}, 列 {stats.column}</span>
        <span>{stats.lines} 行</span>
        <span>{stats.words} 词</span>
        <span>{stats.chars} 字符</span>
      </footer>
    </main>
  );
}
