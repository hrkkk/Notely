import type { FontChoice, LineEnding } from "../types";

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

export {
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
};
