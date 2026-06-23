import type { CSSProperties, WheelEvent } from "react";

export type LineEnding = "LF" | "CRLF" | "CR";

export type FilePayload = {
  path: string;
  name: string;
  content: string;
  encoding: string;
  line_ending: LineEnding;
  modified_ms?: number | null;
  size?: number;
};

export type FileState = {
  modified_ms?: number | null;
  size: number;
};

export type DocumentTab = {
  id: string;
  name: string;
  tabTitle?: string;
  path: string | null;
  isLoading?: boolean;
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
  viewState?: EditorViewState;
};

export type SearchMatch = {
  start: number;
  end: number;
};

export type ReplaceScope = "all" | "selection";
export type StartupPolicy = "new" | "restore";
export type EncodingAction = "reopen" | "save";

export type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
};

export type TabContextMenuState = {
  tabId: string;
  x: number;
  y: number;
} | null;

export type PopupMenuState = {
  x: number;
  y: number;
} | null;

export type LineMenuState = PopupMenuState;
export type MoreMenuState = PopupMenuState;

export type EditorDisplayOptions = {
  showSpaces: boolean;
  showLineBreaks: boolean;
  showTabs: boolean;
  showIndentGuides: boolean;
};

export type SessionPayload = {
  tabs: DocumentTab[];
  activeId: string;
};

export type HighlightRange = SearchMatch & {
  kind: "search" | "word";
  current?: boolean;
};

export type CodeMirrorEditorHandle = {
  focus: () => void;
  setSelectionRange: (start: number, end: number, focusEditor?: boolean) => void;
  getSelectionRange: () => { start: number; end: number };
  getViewState: () => EditorViewState;
  isOffsetVisible: (offset: number) => boolean;
  scrollToOffset: (offset: number) => void;
};

export type EditorViewState = {
  selectionStart: number;
  selectionEnd: number;
  scrollTop: number;
  scrollLeft: number;
};

export type CodeMirrorEditorProps = {
  documentId: string;
  content: string;
  viewState?: EditorViewState;
  wordWrap: boolean;
  displayOptions: EditorDisplayOptions;
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
  onJumpToLine: () => void;
  onViewStateChange: (state: EditorViewState) => void;
  onZoomWheel: (event: WheelEvent<HTMLDivElement>) => void;
};

export type CommentTokens = {
  line?: string;
  blockStart?: string;
  blockEnd?: string;
};

export type CustomRegexHighlight = {
  pattern: string;
  captureGroup?: number;
  color?: string;
  backgroundColor?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  borderColor?: string;
};

export type CustomKeywordStyle = CSSProperties & {
  prefixEnabled?: boolean;
};

export type LanguageDefinition = {
  name: string;
  extensions: string[];
  keywords: string[];
  comment: CommentTokens;
  regexEnabled?: boolean;
  regex?: string;
  regexHighlights?: CustomRegexHighlight[];
  keywordStyles?: Record<string, CustomKeywordStyle>;
  keywordPrefixEnabled?: Record<string, boolean>;
  stringDelimiters?: string[];
  isCustom?: boolean;
  type?: "code" | "markup" | "css" | "json" | "markdown";
};

export type CustomKeywordGroup = {
  keywords: string;
  color?: string;
  backgroundColor?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  borderColor?: string;
  prefixEnabled?: boolean;
};

export type CustomLanguageConfig = {
  name: string;
  extensions?: string[] | string;
  regexEnabled?: boolean;
  regexPattern?: string;
  lineComment?: string;
  blockStart?: string;
  blockEnd?: string;
  stringDelimiters?: string[];
  keywords?: string[] | string;
  keywordGroups?: CustomKeywordGroup[];
  regexHighlights?: CustomRegexHighlight[];
};

export type CustomLanguageForm = {
  name: string;
  extensions: string;
  keywords: string;
  lineComment: string;
  blockStart: string;
  blockEnd: string;
};

export type FontChoice = {
  family: string;
  size: string;
};

export type LanguageFontChoice = {
  family: string;
  size: string;
};
