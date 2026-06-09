import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { basicSetup } from "codemirror";
import { defaultKeymap, historyKeymap, indentWithTab, toggleComment } from "@codemirror/commands";
import { Compartment, EditorState, Extension, Prec, RangeSetBuilder, StateField } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, keymap } from "@codemirror/view";
import { css } from "@codemirror/lang-css";
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
import { highlightSelectionMatches } from "@codemirror/search";
import { c as legacyC, csharp, kotlin } from "@codemirror/legacy-modes/mode/clike";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { ChevronDown, ChevronUp, FilePlus2, FolderOpen, Replace, Save, SaveAll, Search, List, Settings2, X, WrapText } from "lucide-react";
import { CSSProperties, MouseEvent, WheelEvent, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

type FilePayload = {
  path: string;
  name: string;
  content: string;
  encoding: string;
  line_ending: LineEnding;
  modified_ms?: number | null;
  size?: number;
};

type FileState = {
  modified_ms?: number | null;
  size: number;
};

type DocumentTab = {
  id: string;
  name: string;
  path: string | null;
  content: string;
  savedContent: string;
  encoding: string;
  savedEncoding: string;
  lineEnding: LineEnding;
  savedLineEnding: LineEnding;
  diskModifiedMs: number | null;
  diskSize: number | null;
  language: string;
  history: string[];
};

type SearchMatch = {
  start: number;
  end: number;
};

type ReplaceScope = "all" | "selection";
type StartupPolicy = "new" | "restore";
type LineEnding = "LF" | "CRLF" | "CR";
type EncodingAction = "reopen" | "save";

type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
};

type TabContextMenuState = {
  tabId: string;
  x: number;
  y: number;
} | null;

type LineMenuState = {
  x: number;
  y: number;
} | null;

type SessionPayload = {
  tabs: DocumentTab[];
  activeId: string;
};

type HighlightRange = SearchMatch & {
  kind: "search" | "word";
  current?: boolean;
};

type CodeMirrorEditorHandle = {
  focus: () => void;
  setSelectionRange: (start: number, end: number) => void;
  getSelectionRange: () => { start: number; end: number };
  scrollToOffset: (offset: number) => void;
};

type CodeMirrorEditorProps = {
  content: string;
  wordWrap: boolean;
  matches: SearchMatch[];
  currentMatchIndex: number;
  lineHighlights: SearchMatch[];
  fontStyle: CSSProperties;
  language: LanguageDefinition;
  onChange: (content: string) => void;
  onCursorChange: (cursor: number) => void;
  onCurrentMatchReset: () => void;
  onLineHighlightsClear: () => void;
  onOpenSearchWidget: (mode: "search" | "replace") => void;
  onZoomWheel: (event: WheelEvent<HTMLDivElement>) => void;
};

type CommentTokens = {
  line?: string;
  blockStart?: string;
  blockEnd?: string;
};

type LanguageDefinition = {
  name: string;
  extensions: string[];
  keywords: string[];
  comment: CommentTokens;
  regexEnabled?: boolean;
  regex?: string;
  keywordStyles?: Record<string, CSSProperties>;
  stringDelimiters?: string[];
  isCustom?: boolean;
  type?: "code" | "markup" | "css" | "json" | "markdown";
};

type CustomKeywordGroup = {
  keywords?: string;
  keyword1?: string;
  "关键词1"?: string;
  color?: string;
  keywordColor?: string;
  "关键词1颜色"?: string;
  style?: string;
  fontStyle?: string;
  "关键词1字体样式"?: string;
};

type CustomLanguageConfig = {
  name?: string;
  languageName?: string;
  "语言名"?: string;
  extensions?: string[] | string;
  extension?: string;
  "关联后缀"?: string[] | string;
  regexEnabled?: boolean;
  enableRegex?: boolean;
  "是否启用正则匹配"?: boolean;
  regex?: string;
  regexPattern?: string;
  "正则匹配规则"?: string;
  lineComment?: string;
  "行注释符"?: string;
  blockStart?: string;
  blockCommentStart?: string;
  "块注释开始符"?: string;
  blockEnd?: string;
  blockCommentEnd?: string;
  "块注释结束符"?: string;
  keywords?: string[] | string | CustomKeywordGroup[];
  keywordGroups?: CustomKeywordGroup[];
  "关键词列表"?: CustomKeywordGroup[];
};

type CustomLanguageForm = {
  name: string;
  extensions: string;
  keywords: string;
  lineComment: string;
  blockStart: string;
  blockEnd: string;
};

type FontChoice = {
  family: string;
  size: string;
};

type LanguageFontChoice = {
  family: string;
  size: string;
};

const untitledName = "未命名";

const fontSettingsKey = "notely.fontSettings";
const languageFontSettingsKey = "notely.languageFontSettings";
const startupPolicyKey = "notely.startupPolicy";
const sessionKey = "notely.session";
const maxStoredSessionContentLength = 1_000_000;
const minEditorZoom = 50;
const maxEditorZoom = 200;
const editorZoomStep = 10;
const fallbackFontFamilies = [
  "Cascadia Mono",
  "Cascadia Code",
  "JetBrains Mono",
  "Fira Code",
  "Fira Mono",
  "Consolas",
  "Courier New",
  "Lucida Console",
  "Source Code Pro",
  "Roboto Mono",
  "Inconsolata",
  "Menlo",
  "Monaco",
  "Microsoft YaHei UI",
  "Microsoft YaHei",
  "Microsoft JhengHei UI",
  "SimSun",
  "SimHei",
  "DengXian",
  "Segoe UI",
  "Arial",
  "Tahoma"
];
const fontSizes = ["12", "13", "14", "15", "16", "18", "20", "22"];
const encodingOptions = ["UTF-8", "UTF-8 BOM", "UTF-16 LE", "UTF-16 BE", "GBK", "Windows-1252"];
const lineEndingOptions: Array<{ value: LineEnding; label: string; detail: string }> = [
  { value: "LF", label: "LF", detail: "\\n" },
  { value: "CRLF", label: "CRLF", detail: "\\r\\n" },
  { value: "CR", label: "CR", detail: "\\r" }
];
const defaultFontChoice: FontChoice = {
  family: "Cascadia Mono",
  size: "14"
};

const builtInLanguages: LanguageDefinition[] = [
  {
    name: "Plain Text",
    extensions: ["txt", "log"],
    keywords: [],
    comment: {}
  },
  {
    name: "JavaScript",
    extensions: ["js", "jsx", "mjs", "cjs"],
    keywords: "await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async true false null undefined".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "TypeScript",
    extensions: ["ts", "tsx"],
    keywords: "abstract any as asserts async await boolean break case catch class const constructor continue debugger declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new null number object of private protected public readonly require return set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "Python",
    extensions: ["py", "pyw"],
    keywords: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self".split(" "),
    comment: { line: "#", blockStart: '"""', blockEnd: '"""' },
    stringDelimiters: ["'", '"']
  },
  {
    name: "Java",
    extensions: ["java"],
    keywords: "abstract assert boolean break byte case catch char class const continue default do double else enum exports extends final finally float for goto if implements import instanceof int interface long module native new null package private protected public requires return short static strictfp super switch synchronized this throw throws transient true try var void volatile while".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "C",
    extensions: ["c"],
    keywords: "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "C++",
    extensions: ["cpp", "cc", "cxx", "hpp", "hxx", "h"],
    keywords: "alignas alignof and asm auto bool break case catch char class const constexpr const_cast continue decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public register reinterpret_cast return short signed sizeof static static_assert static_cast struct switch template this throw true try typedef typeid typename union unsigned using virtual void volatile while".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "C#",
    extensions: ["cs"],
    keywords: "abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while var async await".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "Rust",
    extensions: ["rs"],
    keywords: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "Go",
    extensions: ["go"],
    keywords: "break case chan const continue default defer else fallthrough for func go goto if import interface map nil package range return select struct switch type var true false iota".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "Shell",
    extensions: ["sh", "bash", "zsh", "ps1"],
    keywords: "if then else elif fi for while until do done case esac function in select break continue return export local readonly true false".split(" "),
    comment: { line: "#" },
    stringDelimiters: ["'", '"', "`"]
  },
  {
    name: "SQL",
    extensions: ["sql"],
    keywords: "select from where insert update delete create alter drop table view index into values set join left right inner outer full on group by order having limit offset union all distinct as and or not null is like in exists between case when then else end primary key foreign references constraint".split(" "),
    comment: { line: "--", blockStart: "/*", blockEnd: "*/" },
    stringDelimiters: ["'"]
  },
  {
    name: "HTML",
    extensions: ["html", "htm", "xml", "svg"],
    keywords: [],
    comment: { blockStart: "<!--", blockEnd: "-->" },
    type: "markup"
  },
  {
    name: "CSS",
    extensions: ["css", "scss", "less"],
    keywords: "absolute relative fixed sticky static block inline inline-block flex grid none auto inherit initial unset important media supports keyframes from to root hover focus active visited before after".split(" "),
    comment: { blockStart: "/*", blockEnd: "*/" },
    type: "css"
  },
  {
    name: "JSON",
    extensions: ["json"],
    keywords: "true false null".split(" "),
    comment: {},
    type: "json"
  },
  {
    name: "YAML",
    extensions: ["yaml", "yml"],
    keywords: "true false null yes no on off".split(" "),
    comment: { line: "#" }
  },
  {
    name: "Markdown",
    extensions: ["md", "markdown"],
    keywords: [],
    comment: { blockStart: "<!--", blockEnd: "-->" },
    type: "markdown"
  },
  {
    name: "Ruby",
    extensions: ["rb"],
    keywords: "BEGIN END alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield".split(" "),
    comment: { line: "#" }
  },
  {
    name: "PHP",
    extensions: ["php"],
    keywords: "abstract and array as break callable case catch class clone const continue declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list namespace new null or print private protected public require require_once return static switch throw trait try unset use var while xor yield true false".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  },
  {
    name: "Lua",
    extensions: ["lua"],
    keywords: "and break do else elseif end false for function goto if in local nil not or repeat return then true until while".split(" "),
    comment: { line: "--", blockStart: "--[[", blockEnd: "]]" }
  },
  {
    name: "Kotlin",
    extensions: ["kt", "kts"],
    keywords: "as break class continue do else false for fun if in interface is null object package return super this throw true try typealias val var when while by catch constructor delegate dynamic field file finally get import init param property receiver set setparam where actual abstract annotation companion const crossinline data enum expect external final infix inline inner internal lateinit noinline open operator out override private protected public reified sealed suspend tailrec vararg".split(" "),
    comment: { line: "//", blockStart: "/*", blockEnd: "*/" }
  }
];

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || untitledName;
}

function getExtension(name: string) {
  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  return extension || "";
}

function normalizeWords(value: string) {
  return value
    .split(/[\s,]+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function normalizeExtensions(value: string) {
  return normalizeWords(value).map((extension) => extension.replace(/^\./, "").toLowerCase());
}

function normalizeExtensionValue(value: string[] | string | undefined) {
  if (!value) {
    return [];
  }
  return Array.isArray(value)
    ? value.flatMap((extension) => normalizeExtensions(extension))
    : normalizeExtensions(value);
}

function keywordStyleFromText(_value: string | undefined, color: string | undefined): CSSProperties {
  return {
    color: color || undefined
  };
}

function normalizeKeywordGroups(value: CustomLanguageConfig) {
  const groups = (value.keywordGroups ?? value["关键词列表"] ?? []) as CustomKeywordGroup[];
  const keywordStyles: Record<string, CSSProperties> = {};
  const keywords: string[] = [];

  if (Array.isArray(groups)) {
    groups.forEach((group) => {
      const keywordText = group.keywords ?? group.keyword1 ?? group["关键词1"] ?? "";
      const color = group.color ?? group.keywordColor ?? group["关键词1颜色"];
      const style = keywordStyleFromText(group.style ?? group.fontStyle ?? group["关键词1字体样式"], color);
      normalizeWords(keywordText).forEach((keyword) => {
        keywords.push(keyword);
        keywordStyles[keyword.toLowerCase()] = style;
      });
    });
  }

  if (typeof value.keywords === "string") {
    keywords.push(...normalizeWords(value.keywords));
  } else if (Array.isArray(value.keywords)) {
    if (value.keywords.every((item) => typeof item === "string")) {
      keywords.push(...(value.keywords as string[]).flatMap((item) => normalizeWords(item)));
    } else {
      (value.keywords as CustomKeywordGroup[]).forEach((group) => {
        const keywordText = group.keywords ?? group.keyword1 ?? group["关键词1"] ?? "";
        const color = group.color ?? group.keywordColor ?? group["关键词1颜色"];
        const style = keywordStyleFromText(group.style ?? group.fontStyle ?? group["关键词1字体样式"], color);
        normalizeWords(keywordText).forEach((keyword) => {
          keywords.push(keyword);
          keywordStyles[keyword.toLowerCase()] = style;
        });
      });
    }
  }

  return {
    keywords: Array.from(new Set(keywords)),
    keywordStyles
  };
}

function stripJsonComments(value: string) {
  let result = "";
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if (current === "\"" || current === "'") {
      inString = true;
      quote = current;
      result += current;
      continue;
    }

    if (current === "/" && next === "/") {
      while (index < value.length && value[index] !== "\n") {
        index += 1;
      }
      result += "\n";
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < value.length && !(value[index] === "*" && value[index + 1] === "/")) {
        index += 1;
      }
      index += 1;
      continue;
    }

    result += current;
  }

  return result;
}

function parseCustomLanguages(raw: string): LanguageDefinition[] {
  try {
    const parsed = JSON.parse(stripJsonComments(raw)) as CustomLanguageConfig[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((language) => {
        const name = language.name ?? language.languageName ?? language["语言名"] ?? "";
        const extensions = normalizeExtensionValue(
          language.extensions ?? language.extension ?? language["关联后缀"]
        );
        const regex = language.regex ?? language.regexPattern ?? language["正则匹配规则"];
        const keywordConfig = normalizeKeywordGroups(language);
        return {
          name,
          extensions,
          keywords: keywordConfig.keywords,
          keywordStyles: keywordConfig.keywordStyles,
          isCustom: true,
          regexEnabled: language.regexEnabled ?? language.enableRegex ?? language["是否启用正则匹配"] ?? false,
          regex,
          comment: {
            line: language.lineComment ?? language["行注释符"] ?? undefined,
            blockStart: language.blockStart ?? language.blockCommentStart ?? language["块注释开始符"] ?? undefined,
            blockEnd: language.blockEnd ?? language.blockCommentEnd ?? language["块注释结束符"] ?? undefined
          }
        };
      })
      .filter((language) => language.name && (language.extensions.length > 0 || language.regex));
  } catch {
    return [];
  }
}

function loadFontChoice(): FontChoice {
  try {
    const raw = window.localStorage.getItem(fontSettingsKey);
    if (!raw) {
      return defaultFontChoice;
    }
    const parsed = JSON.parse(raw) as Partial<FontChoice>;
    return {
      family: parsed.family || defaultFontChoice.family,
      size: parsed.size && fontSizes.includes(parsed.size) ? parsed.size : defaultFontChoice.size
    };
  } catch {
    return defaultFontChoice;
  }
}

function loadLanguageFontChoices(): Record<string, LanguageFontChoice> {
  try {
    const raw = window.localStorage.getItem(languageFontSettingsKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, LanguageFontChoice>;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function saveFontChoice(choice: FontChoice) {
  window.localStorage.setItem(fontSettingsKey, JSON.stringify(choice));
}

function saveLanguageFontChoices(choices: Record<string, LanguageFontChoice>) {
  window.localStorage.setItem(languageFontSettingsKey, JSON.stringify(choices));
}

function loadStartupPolicy(): StartupPolicy {
  return window.localStorage.getItem(startupPolicyKey) === "restore" ? "restore" : "new";
}

function saveStartupPolicy(policy: StartupPolicy) {
  window.localStorage.setItem(startupPolicyKey, policy);
}

function isTabDirty(tab: DocumentTab) {
  return (
    tab.content !== tab.savedContent ||
    tab.encoding !== tab.savedEncoding ||
    tab.lineEnding !== tab.savedLineEnding
  );
}

function fileStateFromPayload(file: FilePayload) {
  return {
    diskModifiedMs: file.modified_ms ?? null,
    diskSize: file.size ?? null
  };
}

function hasFileStateChanged(tab: DocumentTab, state: FileState | null) {
  if (!state) {
    return true;
  }
  return tab.diskModifiedMs !== (state.modified_ms ?? null) || tab.diskSize !== state.size;
}

function isValidTab(value: DocumentTab) {
  return (
    value &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.content === "string" &&
    typeof value.savedContent === "string"
  );
}

function loadInitialSession(): SessionPayload {
  if (loadStartupPolicy() !== "restore") {
    const tab = createEmptyTab();
    return { tabs: [tab], activeId: tab.id };
  }

  try {
    const raw = window.localStorage.getItem(sessionKey);
    if (!raw) {
      throw new Error("empty session");
    }
    if (raw.length > maxStoredSessionContentLength) {
      window.localStorage.removeItem(sessionKey);
      throw new Error("session too large");
    }

    const parsed = JSON.parse(raw) as SessionPayload;
    const tabs = Array.isArray(parsed.tabs)
        ? parsed.tabs.filter(isValidTab).map((tab) => ({
          ...tab,
          path: tab.path ?? null,
          language: tab.language || "Plain Text",
          encoding: tab.encoding || "UTF-8",
          savedEncoding: tab.savedEncoding || tab.encoding || "UTF-8",
          lineEnding: tab.lineEnding || "LF",
          savedLineEnding: tab.savedLineEnding || tab.lineEnding || "LF",
          diskModifiedMs: tab.diskModifiedMs ?? null,
          diskSize: tab.diskSize ?? null,
          history: []
        }))
      : [];
    if (!tabs.length) {
      throw new Error("empty tabs");
    }

    return {
      tabs,
      activeId: tabs.some((tab) => tab.id === parsed.activeId) ? parsed.activeId : tabs[0].id
    };
  } catch {
    const tab = createEmptyTab();
    return { tabs: [tab], activeId: tab.id };
  }
}

function saveSession(tabs: DocumentTab[], activeId: string) {
  const payload: SessionPayload = {
    activeId,
    tabs: tabs.map((tab) => {
      const canStoreContent = !tab.path || tab.content.length <= maxStoredSessionContentLength / 4;
      return {
        ...tab,
        content: canStoreContent ? tab.content : "",
        savedContent: canStoreContent ? tab.savedContent : "",
        history: []
      };
    })
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length > maxStoredSessionContentLength) {
    window.localStorage.setItem(sessionKey, JSON.stringify({
      activeId,
      tabs: [createEmptyTab()]
    }));
    return;
  }
  window.localStorage.setItem(sessionKey, serialized);
}

function detectLanguage(name: string, customLanguages: LanguageDefinition[]) {
  const extension = getExtension(name);
  const regexLanguage = customLanguages.find((language) => {
    if (!language.regexEnabled || !language.regex) {
      return false;
    }
    try {
      return new RegExp(language.regex).test(name);
    } catch {
      return false;
    }
  });
  if (regexLanguage) {
    return regexLanguage.name;
  }

  const allLanguages = [...customLanguages, ...builtInLanguages];
  return allLanguages.find((language) => language.extensions.includes(extension))?.name ?? "Plain Text";
}

function getLanguageDefinition(name: string, customLanguages: LanguageDefinition[]) {
  return (
    customLanguages.find((language) => language.name === name) ??
    builtInLanguages.find((language) => language.name === name) ??
    builtInLanguages[0]
  );
}

type CustomLanguageState = {
  inBlockComment: boolean;
};

function getCommentLanguageData(comment: CommentTokens) {
  const commentTokens: { line?: string; block?: { open: string; close: string } } = {};
  if (comment.line) {
    commentTokens.line = comment.line;
  }
  if (comment.blockStart && comment.blockEnd) {
    commentTokens.block = { open: comment.blockStart, close: comment.blockEnd };
  }
  return Object.keys(commentTokens).length > 0 ? { commentTokens } : undefined;
}

function consumeUntilMatch(stream: StringStream, marker: string) {
  while (!stream.eol()) {
    if (stream.match(marker)) {
      return true;
    }
    stream.next();
  }
  return false;
}

function createCustomLanguageExtension(language: LanguageDefinition): Extension[] {
  const keywords = new Set(language.keywords.map((keyword) => keyword.toLowerCase()));
  const stringDelimiters = [...(language.stringDelimiters?.length ? language.stringDelimiters : ["'", '"'])]
    .filter(Boolean)
    .sort((first, second) => second.length - first.length);
  const lineComment = language.comment.line;
  const blockStart = language.comment.blockStart;
  const blockEnd = language.comment.blockEnd;

  const parser: StreamParser<CustomLanguageState> = {
    name: language.name,
    startState: () => ({ inBlockComment: false }),
    token: (stream, state) => {
      if (state.inBlockComment) {
        if (blockEnd && consumeUntilMatch(stream, blockEnd)) {
          state.inBlockComment = false;
        } else {
          stream.skipToEnd();
        }
        return "comment";
      }

      if (stream.eatSpace()) {
        return null;
      }

      if (lineComment && stream.match(lineComment)) {
        stream.skipToEnd();
        return "comment";
      }

      if (blockStart && blockEnd && stream.match(blockStart)) {
        if (!consumeUntilMatch(stream, blockEnd)) {
          state.inBlockComment = true;
        }
        return "comment";
      }

      for (const delimiter of stringDelimiters) {
        if (stream.match(delimiter)) {
          let escaped = false;
          while (!stream.eol()) {
            if (!escaped && stream.match(delimiter)) {
              break;
            }
            const next = stream.next();
            escaped = next === "\\" && !escaped;
            if (next !== "\\") {
              escaped = false;
            }
          }
          return "string";
        }
      }

      if (stream.match(/\d+(?:\.\d+)?/)) {
        return null;
      }

      if (stream.match(/[\p{L}_$][\p{L}\p{N}_$-]*/u)) {
        return keywords.has(stream.current().toLowerCase()) ? "keyword" : "variableName";
      }

      stream.next();
      return null;
    },
    languageData: getCommentLanguageData(language.comment)
  };

  return [StreamLanguage.define(parser)];
}

function getLanguageExtensions(language: LanguageDefinition): Extension[] {
  switch (language.name.toLowerCase()) {
    case "javascript":
      return [javascript({ jsx: true })];
    case "typescript":
      return [javascript({ jsx: true, typescript: true })];
    case "python":
      return [python()];
    case "java":
      return [java()];
    case "c":
      return [StreamLanguage.define(legacyC)];
    case "c++":
      return [cpp()];
    case "c#":
      return [StreamLanguage.define(csharp)];
    case "rust":
      return [rust()];
    case "go":
      return [go()];
    case "shell":
      return [StreamLanguage.define(shell)];
    case "sql":
      return [sql()];
    case "html":
      return [html()];
    case "css":
      return [css()];
    case "json":
      return [json()];
    case "yaml":
      return [yaml()];
    case "markdown":
      return [markdown()];
    case "ruby":
      return [StreamLanguage.define(ruby)];
    case "php":
      return [php()];
    case "lua":
      return [StreamLanguage.define(lua)];
    case "kotlin":
      return [StreamLanguage.define(kotlin)];
    default:
      return language.isCustom ? createCustomLanguageExtension(language) : [];
  }
}

function createEmptyTab(): DocumentTab {
  return {
    id: createId(),
    name: untitledName,
    path: null,
    content: "",
    savedContent: "",
    encoding: "UTF-8",
    savedEncoding: "UTF-8",
    lineEnding: "LF",
    savedLineEnding: "LF",
    diskModifiedMs: null,
    diskSize: null,
    language: "Plain Text",
    history: []
  };
}

function createTabFromFile(file: FilePayload, customLanguages: LanguageDefinition[]): DocumentTab {
  return {
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
}

function lineAndColumn(content: string, cursor: number) {
  const beforeCursor = content.slice(0, cursor);
  const lines = beforeCursor.split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function buildLineStarts(content: string) {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function getLineIndexAtOffset(lineStarts: number[], offset: number) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(0, high);
}

function lineAndColumnFromStarts(content: string, cursor: number, lineStarts: number[]) {
  const lineIndex = getLineIndexAtOffset(lineStarts, cursor);
  return {
    line: lineIndex + 1,
    column: cursor - lineStarts[lineIndex] + 1
  };
}

function findMatches(content: string, query: string): SearchMatch[] {
  if (!query) {
    return [];
  }

  const matches: SearchMatch[] = [];
  const text = content.toLowerCase();
  const needle = query.toLowerCase();
  let index = text.indexOf(needle);

  while (index !== -1) {
    matches.push({ start: index, end: index + query.length });
    index = text.indexOf(needle, index + Math.max(query.length, 1));
  }

  return matches;
}

function isIdentifierCharacter(value: string) {
  return /[\p{L}\p{N}_$]/u.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWholeWordMatch(content: string, start: number, end: number) {
  const before = start === 0 ? "" : content[start - 1];
  const after = end >= content.length ? "" : content[end];
  return !isIdentifierCharacter(before) && !isIdentifierCharacter(after);
}

function createSearchRegex(query: string, options: SearchOptions) {
  const source = options.regex ? query : escapeRegExp(query);
  return new RegExp(source, `g${options.caseSensitive ? "" : "i"}`);
}

function findMatchesInRange(content: string, query: string, options: SearchOptions, start: number, end: number) {
  if (!query || start >= end) {
    return [];
  }

  const matches: SearchMatch[] = [];
  const segment = content.slice(start, end);

  if (options.regex || options.wholeWord) {
    const regex = createSearchRegex(query, options);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(segment))) {
      const value = match[0];
      if (!value) {
        regex.lastIndex += 1;
        continue;
      }

      const absoluteStart = start + match.index;
      const absoluteEnd = absoluteStart + value.length;
      if (!options.wholeWord || isWholeWordMatch(content, absoluteStart, absoluteEnd)) {
        matches.push({ start: absoluteStart, end: absoluteEnd });
      }
    }
    return matches;
  }

  const haystack = options.caseSensitive ? segment : segment.toLowerCase();
  const needle = options.caseSensitive ? query : query.toLowerCase();
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    matches.push({ start: start + index, end: start + index + query.length });
    index = haystack.indexOf(needle, index + Math.max(query.length, 1));
  }

  return matches;
}

function getSelectedLineRange(content: string, start: number, end: number) {
  const selectionStart = Math.min(start, end);
  const selectionEnd = Math.max(start, end);
  const lineStart = selectionStart === 0 ? 0 : content.lastIndexOf("\n", selectionStart - 1) + 1;
  const effectiveEnd =
    selectionEnd > selectionStart && content[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd;
  const nextBreak = content.indexOf("\n", effectiveEnd);
  return {
    start: lineStart,
    end: nextBreak === -1 ? content.length : nextBreak
  };
}

function getCurrentLineRange(content: string, cursor: number) {
  const lineStart = cursor === 0 ? 0 : content.lastIndexOf("\n", cursor - 1) + 1;
  const nextBreak = content.indexOf("\n", cursor);
  return {
    start: lineStart,
    end: nextBreak === -1 ? content.length : nextBreak
  };
}

function findPreviousMatchIndex(matches: SearchMatch[], cursor: number) {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    if (matches[index].end <= cursor) {
      return index;
    }
  }
  return -1;
}

function createSearchDecorations(matches: SearchMatch[], currentMatchIndex: number, lineHighlights: SearchMatch[], content: string) {
  const builder = new RangeSetBuilder<Decoration>();
  const entries: Array<{ from: number; to: number; decoration: Decoration; line?: boolean }> = [];

  lineHighlights.forEach((range) => {
    const from = Math.max(0, Math.min(content.length, range.start));
    const line = content ? EditorState.create({ doc: content }).doc.lineAt(from) : null;
    if (line) {
      entries.push({
        from: line.from,
        to: line.from,
        line: true,
        decoration: Decoration.line({ class: "cm-line-highlight" })
      });
    }
  });

  matches
    .map((match, index) => ({
      ...match,
      kind: "search" as const,
      current: index === currentMatchIndex
    }))
    .filter((range) => range.start < range.end)
    .forEach((range) => {
      const from = Math.max(0, Math.min(content.length, range.start));
      const to = Math.max(from, Math.min(content.length, range.end));
      if (from === to) {
        return;
      }
      entries.push({
        from,
        to,
        decoration: Decoration.mark({
          class: range.current
            ? "cm-searchMatch cm-searchMatch-selected"
            : "cm-searchMatch"
        })
      });
    });

  let lastMarkEnd = -1;
  entries
    .sort((first, second) => first.from - second.from || first.to - second.to || Number(Boolean(second.line)) - Number(Boolean(first.line)))
    .forEach((entry) => {
      if (!entry.line) {
        if (entry.from < lastMarkEnd) {
          return;
        }
        lastMarkEnd = entry.to;
      }
      builder.add(entry.from, entry.to, entry.decoration);
    });

  return builder.finish();
}

const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(function CodeMirrorEditor({
  content,
  wordWrap,
  matches,
  currentMatchIndex,
  lineHighlights,
  fontStyle,
  language,
  onChange,
  onCursorChange,
  onCurrentMatchReset,
  onLineHighlightsClear,
  onOpenSearchWidget,
  onZoomWheel
}, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const contentRef = useRef(content);
  const wrapCompartmentRef = useRef(new Compartment());
  const decorationCompartmentRef = useRef(new Compartment());
  const languageCompartmentRef = useRef(new Compartment());
  const changeRef = useRef(onChange);
  const cursorRef = useRef(onCursorChange);
  const resetRef = useRef(onCurrentMatchReset);
  const clearLineHighlightsRef = useRef(onLineHighlightsClear);
  const openSearchRef = useRef(onOpenSearchWidget);

  useEffect(() => {
    changeRef.current = onChange;
    cursorRef.current = onCursorChange;
    resetRef.current = onCurrentMatchReset;
    clearLineHighlightsRef.current = onLineHighlightsClear;
    openSearchRef.current = onOpenSearchWidget;
  }, [onChange, onCurrentMatchReset, onCursorChange, onLineHighlightsClear, onOpenSearchWidget]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    setSelectionRange: (start, end) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      const safeStart = Math.max(0, Math.min(view.state.doc.length, start));
      const safeEnd = Math.max(0, Math.min(view.state.doc.length, end));
      view.dispatch({ selection: { anchor: safeStart, head: safeEnd }, scrollIntoView: true });
      cursorRef.current(safeEnd);
      view.focus();
    },
    getSelectionRange: () => {
      const selection = viewRef.current?.state.selection.main;
      return selection ? { start: selection.from, end: selection.to } : { start: 0, end: 0 };
    },
    scrollToOffset: (offset) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      const safeOffset = Math.max(0, Math.min(view.state.doc.length, offset));
      view.dispatch({ effects: EditorView.scrollIntoView(safeOffset, { y: "center" }) });
    }
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const searchDecorationField = StateField.define<DecorationSet>({
      create: (state) => createSearchDecorations(matches, currentMatchIndex, lineHighlights, state.doc.toString()),
      update: (decorations, transaction) => decorations.map(transaction.changes),
      provide: (field) => EditorView.decorations.from(field)
    });

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const nextContent = update.state.doc.toString();
        contentRef.current = nextContent;
        changeRef.current(nextContent);
        resetRef.current();
        clearLineHighlightsRef.current();
      }
      if (update.selectionSet || update.docChanged) {
        cursorRef.current(update.state.selection.main.head);
      }
    });

    const clearLineHighlightsOnDoubleClick = EditorView.domEventHandlers({
      dblclick: () => {
        clearLineHighlightsRef.current();
        return false;
      }
    });

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: contentRef.current,
        extensions: [
          Prec.highest(keymap.of([
            {
              key: "Mod-f",
              run: () => {
                openSearchRef.current("search");
                return true;
              }
            },
            {
              key: "Mod-r",
              run: () => {
                openSearchRef.current("replace");
                return true;
              }
            },
            {
              key: "Mod-/",
              run: toggleComment
            },
            {
              key: "Ctrl-/",
              run: toggleComment
            },
            indentWithTab
          ])),
          basicSetup,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          updateListener,
          clearLineHighlightsOnDoubleClick,
          highlightSelectionMatches({ wholeWords: true }),
          wrapCompartmentRef.current.of(wordWrap ? EditorView.lineWrapping : []),
          decorationCompartmentRef.current.of(searchDecorationField),
          languageCompartmentRef.current.of(getLanguageExtensions(language))
        ]
      })
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const current = view.state.doc.toString();
    if (current === content) {
      return;
    }
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
      selection: { anchor: Math.min(content.length, view.state.selection.main.head) }
    });
  }, [content]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: wrapCompartmentRef.current.reconfigure(wordWrap ? EditorView.lineWrapping : [])
    });
    requestAnimationFrame(() => view.requestMeasure());
  }, [wordWrap]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    requestAnimationFrame(() => view.requestMeasure());
  }, [fontStyle]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const field = StateField.define<DecorationSet>({
      create: (state) => createSearchDecorations(matches, currentMatchIndex, lineHighlights, state.doc.toString()),
      update: (decorations, transaction) => decorations.map(transaction.changes),
      provide: (field) => EditorView.decorations.from(field)
    });
    view.dispatch({ effects: decorationCompartmentRef.current.reconfigure(field) });
  }, [currentMatchIndex, lineHighlights, matches]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: languageCompartmentRef.current.reconfigure(getLanguageExtensions(language))
    });
  }, [language]);

  return <div ref={hostRef} className={wordWrap ? "cm-editor-host is-wrapping" : "cm-editor-host"} style={fontStyle} onWheel={onZoomWheel} />;
});

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
  const [systemFonts, setSystemFonts] = useState<string[]>(fallbackFontFamilies);
  const [wordWrap, setWordWrap] = useState(true);
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
  const languageOptions = useMemo(() => [...builtInLanguages, ...customLanguages], [customLanguages]);
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
          setStatus(`宸插垏鎹㈠埌 ${existing.name}`);
        }
        return current;
      }

      const onlyBlank =
        current.length === 1 &&
        current[0].path === null &&
        current[0].content.length === 0 &&
        current[0].savedContent.length === 0;
      setActiveId(uniqueTabs[0].id);
      setStatus(uniqueTabs.length === 1 ? `宸叉墦寮€ ${uniqueTabs[0].name}` : `Opened ${uniqueTabs.length} files`);
      return onlyBlank ? uniqueTabs : [...current, ...uniqueTabs];
    });
  }, [customLanguages]);

  const openFilesByPath = useCallback(async (paths: string[]) => {
    const uniquePaths = Array.from(new Set(paths)).filter(Boolean);
    if (!uniquePaths.length) {
      return;
    }

    try {
      const files = await invoke<FilePayload[]>("open_files_by_path", { paths: uniquePaths });
      openFilesFromPayloads(files);
    } catch (error) {
      setStatus(`Open failed: ${String(error)}`);
    }
  }, [openFilesFromPayloads]);

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
      const file = await invoke<FilePayload | null>("save_file_dialog", {
        defaultPath: tab.path ?? tab.name,
        content: tab.content,
        encoding: tab.encoding,
        lineEnding: tab.lineEnding
      });
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
      const state = await invoke<FileState | null>("get_file_state", { path: activeTab.path });
      if (hasFileStateChanged(activeTab, state)) {
        const shouldOverwrite = window.confirm(`"${activeTab.name}" has changed on disk. Overwrite it with the current editor content?`);
        if (!shouldOverwrite) {
          setStatus("Save canceled");
          return false;
        }
      }

      const file = await invoke<FilePayload>("write_file", {
        path: activeTab.path,
        content: activeTab.content,
        encoding: activeTab.encoding,
        lineEnding: activeTab.lineEnding
      });
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
      const file = await invoke<FilePayload>("open_file_with_encoding", {
        path: activeTab.path,
        encoding
      });
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
        const file = await invoke<FilePayload | null>("save_file_dialog", {
          defaultPath: targetTab.name,
          content: targetTab.content,
          encoding: targetTab.encoding,
          lineEnding: targetTab.lineEnding
        });
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
      const state = await invoke<FileState | null>("get_file_state", { path: targetTab.path });
      if (hasFileStateChanged(targetTab, state)) {
        const shouldOverwrite = window.confirm(`"${targetTab.name}" has changed on disk. Overwrite it with the current editor content?`);
        if (!shouldOverwrite) {
          setStatus("Save canceled");
          return;
        }
      }

      const file = await invoke<FilePayload>("write_file", {
        path: targetTab.path,
        content: targetTab.content,
        encoding: targetTab.encoding,
        lineEnding: targetTab.lineEnding
      });
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

  const copyRelativePath = useCallback(async (tab: DocumentTab) => {
    if (!tab.path) {
      setStatus("当前标签页没有文件路径");
      return;
    }
    try {
      const path = await invoke<string>("relative_path", { path: tab.path });
      await copyText(path, "已复制相对路径");
    } catch (error) {
      setStatus(`复制失败：${String(error)}`);
    }
  }, [copyText]);

  const revealTabInFileManager = useCallback(async (tab: DocumentTab) => {
    if (!tab.path) {
      setStatus("当前标签页没有文件路径");
      return;
    }
    try {
      await invoke("reveal_in_file_manager", { path: tab.path });
      setStatus("已在文件资源管理器中打开");
    } catch (error) {
      setStatus(`打开失败：${String(error)}`);
    }
  }, []);

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

  const reloadCustomLanguages = useCallback(async () => {
    try {
      const raw = await invoke<string>("read_custom_languages_config");
      const next = parseCustomLanguages(raw);
      setCustomLanguages(next);
      setStatus(`已加载 ${next.length} 个自定义语言`);
    } catch (error) {
      setStatus(`加载自定义语言失败：${String(error)}`);
    }
  }, []);

  const openCustomLanguagesConfig = useCallback(async () => {
    try {
      const file = await invoke<FilePayload>("open_custom_languages_config");
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
      void invoke<string[]>("list_system_fonts")
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
    const timer = window.setTimeout(async () => {
      try {
        const files = await invoke<FilePayload[]>("get_startup_files");
        openFilesFromPayloads(files);
      } catch (error) {
        setStatus(`Startup file open failed: ${String(error)}`);
      }
    }, 0);
    return () => window.clearTimeout(timer);
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
        const state = await invoke<FileState | null>("get_file_state", { path: activeTab.path });
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
          <span className="app-mark">N</span>
          <span>Notely</span>
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
              setLineMenu({ x: rect.left, y: rect.bottom + 6 });
            }}
          >
            <List size={17} />
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
              if (event.key === "Enter") {
                event.shiftKey ? findPrevious() : findNext();
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
              title={tab.path ? `${tab.name}\n${tab.path}` : tab.name}
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

      <section className={wordWrap ? "editor-wrap is-wrapping" : "editor-wrap"}>
          <div className="editor-pane">
            <CodeMirrorEditor
              ref={editorRef}
              content={activeTab.content}
              wordWrap={wordWrap}
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
           <button onClick={() => { void saveTabAs(tab); setTabContextMenu(null); }}>另存为</button>
           <button disabled={!tab.path} onClick={() => { void copyRelativePath(tab); setTabContextMenu(null); }}>复制相对路径</button>
           <button disabled={!tab.path} onClick={() => { void copyText(tab.path ?? "", "已复制绝对路径"); setTabContextMenu(null); }}>复制绝对路径</button>
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
         {editorRef.current?.getSelectionRange().start !== editorRef.current?.getSelectionRange().end ? (
           <>
             <div className="context-menu-separator" />
             <button onClick={() => { highlightSelectedLines(); setLineMenu(null); }}>高亮所在行</button>
             <button onClick={() => { void copySelectedLines(); setLineMenu(null); }}>复制所在行</button>
             <button onClick={() => { deleteSelectedLines(); setLineMenu(null); }}>删除所在行</button>
             <button onClick={() => { keepSelectedLines(); setLineMenu(null); }}>删除所在行之外的行</button>
           </>
         ) : null}
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
                  <div className="setting-actions">
                    <button className="primary-action" onClick={openCustomLanguagesConfig}>
                      打开自定义语言 JSON
                    </button>
                    <button className="secondary-action" onClick={() => void reloadCustomLanguages()}>
                      重新加载配置
                    </button>
                  </div>
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
                      <span>{language.name}</span>
                      <small>{language.extensions.map((extension) => `.${extension}`).join(" ") || "无扩展名"}</small>
                    </button>
                  ))
                ) : (
                  <span className="language-picker-empty">没有匹配的语言</span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </footer>
    </main>
  );
}
