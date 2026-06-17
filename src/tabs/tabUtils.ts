import { untitledName, sessionKey, maxStoredSessionContentLength } from "../constants";
import { createId } from "../utils/id";
import { loadStartupPolicy } from "../storage/settings";
import { detectLanguage } from "../languages/detect";
import type { DocumentTab, FilePayload, FileState, LanguageDefinition, SessionPayload } from "../types";

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
          tabTitle: tab.tabTitle || undefined,
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

export {
  isTabDirty,
  fileStateFromPayload,
  hasFileStateChanged,
  createEmptyTab,
  createTabFromFile,
  loadInitialSession,
  saveSession
};
