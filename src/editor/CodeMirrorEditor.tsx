import { basicSetup } from "codemirror";
import { defaultKeymap, historyKeymap, indentWithTab, toggleComment } from "@codemirror/commands";
import { Compartment, EditorState, Extension, Prec, StateField, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, WidgetType, ViewPlugin, ViewUpdate, keymap } from "@codemirror/view";
import { highlightSelectionMatches } from "@codemirror/search";
import { indentUnit } from "@codemirror/language";
import { CSSProperties, WheelEvent, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { getLanguageExtensions } from "../languages/extensions";
import { createSearchDecorations } from "../search/decorations";
import type { CodeMirrorEditorHandle, CodeMirrorEditorProps, ColorMarker, CustomKeywordStyle, CustomRegexHighlight, EditorDisplayOptions, LanguageDefinition } from "../types";

class InlineSymbolWidget extends WidgetType {
  constructor(private readonly symbol: string, private readonly className: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = this.className;
    span.textContent = this.symbol;
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

function createDisplayDecorations(state: EditorState, options: EditorDisplayOptions) {
  const builder = new RangeSetBuilder<Decoration>();
  if (!options.showSpaces && !options.showTabs && !options.showLineBreaks) {
    return builder.finish();
  }

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const text = line.text;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const position = line.from + index;
      if (char === " " && options.showSpaces) {
        builder.add(position + 1, position + 1, Decoration.widget({
          widget: new InlineSymbolWidget("·", "cm-visible-space"),
          side: -1
        }));
      } else if (char === "\t" && options.showTabs) {
        builder.add(position + 1, position + 1, Decoration.widget({
          widget: new InlineSymbolWidget("→", "cm-visible-tab"),
          side: -1
        }));
      }
    }

    if (options.showLineBreaks && lineNumber < state.doc.lines) {
      builder.add(line.to, line.to, Decoration.widget({
        widget: new InlineSymbolWidget("↵", "cm-visible-linebreak"),
        side: 1
      }));
    }
  }

  return builder.finish();
}

class IndentGuideWidget extends WidgetType {
  constructor(private readonly column: number) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-indent-guide-widget";
    span.style.left = `${this.column}ch`;
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

function getIndentColumns(text: string, tabSize: number) {
  const indent = text.match(/^[\t ]*/)?.[0] ?? "";
  if (!indent) {
    return [];
  }

  let columns = 0;
  for (const char of indent) {
    if (char === "\t") {
      const remainder = columns % tabSize;
      columns += remainder === 0 ? tabSize : tabSize - remainder;
    } else {
      columns += 1;
    }
  }

  const indentUnit = 2;
  const result: number[] = [];
  for (let column = indentUnit; column <= columns; column += indentUnit) {
    result.push(column);
  }
  return result;
}

function createIndentGuideDecorations(view: EditorView, enabled: boolean) {
  const builder = new RangeSetBuilder<Decoration>();
  if (!enabled) {
    return builder.finish();
  }

  const seenLines = new Set<number>();
  for (const range of view.visibleRanges) {
    let position = range.from;
    while (position <= range.to) {
      const line = view.state.doc.lineAt(position);
      if (!seenLines.has(line.from)) {
        seenLines.add(line.from);
        const columns = getIndentColumns(line.text, view.state.tabSize);
        if (columns.length) {
          const backgroundImage = columns.map(() => "linear-gradient(var(--indent-guide-color), var(--indent-guide-color))").join(", ");
          const backgroundPosition = columns.map((column) => `${column}ch 0`).join(", ");
          const backgroundSize = columns.map(() => "1px 100%").join(", ");
          builder.add(line.from, line.from, Decoration.line({
            attributes: {
              class: "cm-indent-guide-line",
              style: [
                `background-image: ${backgroundImage}`,
                `background-position: ${backgroundPosition}`,
                `background-size: ${backgroundSize}`
              ].join("; ")
            }
          }));
        }
      }

      if (line.to >= range.to) {
        break;
      }
      position = line.to + 1;
    }
  }

  return builder.finish();
}

function indentGuidesExtension(enabled: boolean) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = createIndentGuideDecorations(view, enabled);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.geometryChanged) {
        this.decorations = createIndentGuideDecorations(update.view, enabled);
      }
    }
  }, {
    decorations: (plugin) => plugin.decorations
  });
}

const maxBackgroundMarkersPerLine = 480;

function getTabAdvance(column: number, tabSize: number) {
  const remainder = column % tabSize;
  return remainder === 0 ? tabSize : tabSize - remainder;
}

function getIndentGuideColumns(text: string, tabSize: number) {
  const indent = text.match(/^[\t ]*/)?.[0] ?? "";
  let column = 0;
  for (const char of indent) {
    column += char === "\t" ? getTabAdvance(column, tabSize) : 1;
  }

  const columns: number[] = [];
  for (let guide = 0; guide < column; guide += tabSize) {
    columns.push(guide);
  }
  return columns;
}

function getBlankLineIndentGuideColumns(state: EditorState, lineNumber: number, tabSize: number) {
  let previousColumns: number[] = [];
  for (let current = lineNumber - 1; current >= 1; current -= 1) {
    const text = state.doc.line(current).text;
    if (text.trim().length > 0) {
      previousColumns = getIndentGuideColumns(text, tabSize);
      break;
    }
  }

  let nextColumns: number[] = [];
  for (let current = lineNumber + 1; current <= state.doc.lines; current += 1) {
    const text = state.doc.line(current).text;
    if (text.trim().length > 0) {
      nextColumns = getIndentGuideColumns(text, tabSize);
      break;
    }
  }

  if (!previousColumns.length) {
    return nextColumns;
  }
  if (!nextColumns.length) {
    return previousColumns;
  }
  return previousColumns.length <= nextColumns.length ? previousColumns : nextColumns;
}

function createLineBackgroundStyle(
  text: string,
  options: EditorDisplayOptions,
  tabSize: number,
  isLastLine: boolean,
  indentGuideColumns = getIndentGuideColumns(text, tabSize)
) {
  const images: string[] = [];
  const positions: string[] = [];
  const sizes: string[] = [];
  const addLayer = (image: string, position: string, size: string) => {
    if (images.length >= maxBackgroundMarkersPerLine) {
      return;
    }
    images.push(image);
    positions.push(position);
    sizes.push(size);
  };

  if (options.showIndentGuides) {
    indentGuideColumns.forEach((column) => {
      addLayer(
        "linear-gradient(var(--indent-guide-color), var(--indent-guide-color))",
        `${column}ch 0`,
        "1px 100%"
      );
    });
  }

  let column = 0;
  for (const char of text) {
    if (char === "\t") {
      const width = getTabAdvance(column, tabSize);
      if (options.showTabs) {
        addLayer(
          "linear-gradient(var(--visible-tab-color), var(--visible-tab-color))",
          `calc(${column}ch + 3px) 58%`,
          `max(5px, calc(${width}ch - 6px)) 1px`
        );
        addLayer(
          "linear-gradient(135deg, transparent 45%, var(--visible-tab-color) 46% 54%, transparent 55%)",
          `calc(${column + width}ch - 5px) 50%`,
          "6px 6px"
        );
      }
      column += width;
    } else {
      if (char === " " && options.showSpaces) {
        addLayer(
          "radial-gradient(circle, var(--visible-space-color) 0 1.2px, transparent 1.45px)",
          `calc(${column + 0.5}ch - 2px) 60%`,
          "4px 4px"
        );
      }
      column += 1;
    }
  }

  if (options.showLineBreaks && !isLastLine) {
    addLayer(
      "linear-gradient(var(--visible-linebreak-color), var(--visible-linebreak-color))",
      `calc(${column}ch + 2px) 52%`,
      "7px 1px"
    );
    addLayer(
      "linear-gradient(var(--visible-linebreak-color), var(--visible-linebreak-color))",
      `calc(${column}ch + 8px) 39%`,
      "1px 7px"
    );
  }

  if (!images.length) {
    return null;
  }

  return [
    `background-image: ${images.join(", ")}`,
    `background-position: ${positions.join(", ")}`,
    `background-size: ${sizes.join(", ")}`
  ].join("; ");
}

function createDisplayBackgroundDecorations(view: EditorView, options: EditorDisplayOptions) {
  const builder = new RangeSetBuilder<Decoration>();
  if (!options.showIndentGuides && !options.showSpaces && !options.showTabs && !options.showLineBreaks) {
    return builder.finish();
  }

  const seenLines = new Set<number>();
  for (const range of view.visibleRanges) {
    let position = range.from;
    while (position <= range.to) {
      const line = view.state.doc.lineAt(position);
      if (!seenLines.has(line.from)) {
        seenLines.add(line.from);
        const style = createLineBackgroundStyle(
          line.text,
          options,
          view.state.tabSize,
          line.number === view.state.doc.lines,
          line.text.trim().length === 0
            ? getBlankLineIndentGuideColumns(view.state, line.number, view.state.tabSize)
            : undefined
        );
        if (style) {
          builder.add(line.from, line.from, Decoration.line({
            attributes: {
              class: "cm-display-line",
              style
            }
          }));
        }
      }

      if (line.to >= range.to) {
        break;
      }
      position = line.to + 1;
    }
  }

  return builder.finish();
}

function createForegroundDisplayDecorations(view: EditorView, options: EditorDisplayOptions) {
  const builder = new RangeSetBuilder<Decoration>();
  const selectedRanges = view.state.selection.ranges.filter((range) => !range.empty);
  const hasSelectedRange = selectedRanges.length > 0;
  if (!options.showIndentGuides && !options.showSpaces && !options.showTabs && !options.showLineBreaks && !hasSelectedRange) {
    return builder.finish();
  }
  const isSelected = (from: number, to: number) => {
    return selectedRanges.some((range) => from < range.to && to > range.from);
  };

  const seenLines = new Set<number>();
  for (const range of view.visibleRanges) {
    let position = range.from;
    while (position <= range.to) {
      const line = view.state.doc.lineAt(position);
      if (!seenLines.has(line.from)) {
        seenLines.add(line.from);
        const indentGuideColumns = line.text.trim().length === 0
          ? getBlankLineIndentGuideColumns(view.state, line.number, view.state.tabSize)
          : getIndentGuideColumns(line.text, view.state.tabSize);

        if (options.showIndentGuides) {
          indentGuideColumns.forEach((column) => {
            builder.add(line.from, line.from, Decoration.widget({
              widget: new IndentGuideWidget(column),
              side: -1
            }));
          });
        }

        for (let index = 0; index < line.text.length; index += 1) {
          const char = line.text[index];
          const from = line.from + index;
          if (char === " " && (options.showSpaces || isSelected(from, from + 1))) {
            builder.add(from, from + 1, Decoration.mark({ class: "cm-visible-space-char" }));
          } else if (char === "\t" && options.showTabs) {
            builder.add(from, from + 1, Decoration.mark({ class: "cm-visible-tab-char" }));
          }
        }

        if (options.showLineBreaks && line.number < view.state.doc.lines) {
          builder.add(line.to, line.to, Decoration.widget({
            widget: new InlineSymbolWidget("↵", "cm-visible-linebreak"),
            side: 1
          }));
        }
      }

      if (line.to >= range.to) {
        break;
      }
      position = line.to + 1;
    }
  }

  return builder.finish();
}

function displayBackgroundsExtension(options: EditorDisplayOptions) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = createForegroundDisplayDecorations(view, options);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged) {
        this.decorations = createForegroundDisplayDecorations(update.view, options);
      }
    }
  }, {
    decorations: (plugin) => plugin.decorations
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createStyleAttribute(highlight: CustomRegexHighlight | CustomKeywordStyle | CSSProperties) {
  const styles = [
    highlight.color ? `color: ${highlight.color}` : "",
    highlight.backgroundColor ? `background-color: ${highlight.backgroundColor}` : "",
    highlight.backgroundColor ? "border-radius: 2px" : "",
    highlight.fontWeight ? `font-weight: ${highlight.fontWeight}` : "",
    highlight.fontStyle ? `font-style: ${highlight.fontStyle}` : "",
    highlight.textDecoration ? `text-decoration: ${highlight.textDecoration}` : "",
    highlight.borderColor ? `box-shadow: inset 0 -1px 0 ${highlight.borderColor}` : ""
  ].filter(Boolean);
  return styles.join("; ");
}

function keywordHighlightStyle(style: CustomKeywordStyle | undefined): CustomKeywordStyle {
  return {
    color: "#8f3fb0",
    ...style
  };
}

function createCustomKeywordRegex(keyword: string, prefixEnabled: boolean) {
  const escaped = escapeRegExp(keyword);
  const wordBoundary = "[\\p{L}\\p{N}_$-]";
  const prefixTail = "[\\p{L}\\p{N}_$.-]*";
  const pattern = prefixEnabled
    ? `(?<!${wordBoundary})${escaped}${prefixTail}`
    : `(?<!${wordBoundary})${escaped}(?!${wordBoundary})`;
  return new RegExp(pattern, "giu");
}

function createCustomRegexDecorations(state: EditorState, language: LanguageDefinition) {
  const builder = new RangeSetBuilder<Decoration>();
  const highlights = language.regexHighlights ?? [];
  const keywordEntries = language.keywords
    .map((keyword) => {
      const key = keyword.toLowerCase();
      return {
        keyword,
        prefixEnabled: language.keywordPrefixEnabled?.[key] ?? language.keywordStyles?.[key]?.prefixEnabled ?? false,
        style: keywordHighlightStyle(language.keywordStyles?.[key])
      };
    })
    .filter(({ keyword }) => keyword.length > 0);
  if (!language.isCustom || (highlights.length === 0 && keywordEntries.length === 0)) {
    return builder.finish();
  }

  const content = state.doc.toString();
  const entries: Array<{ from: number; to: number; decoration: Decoration }> = [];

  keywordEntries.forEach(({ keyword, prefixEnabled, style }) => {
    const styleAttribute = createStyleAttribute(style);
    const regex = createCustomKeywordRegex(keyword, prefixEnabled);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      if (match.index >= regex.lastIndex) {
        regex.lastIndex = match.index + 1;
      }
      entries.push({
        from: match.index,
        to: match.index + match[0].length,
        decoration: Decoration.mark({
          class: "cm-customKeywordHighlight",
          attributes: { style: styleAttribute }
        })
      });
    }
  });

  highlights.forEach((highlight) => {
    if (!highlight.pattern) {
      return;
    }

    let regex: RegExp;
    try {
      regex = new RegExp(highlight.pattern, "gsud");
    } catch {
      try {
        regex = new RegExp(highlight.pattern, "gsu");
      } catch {
        return;
      }
    }

    const style = createStyleAttribute(highlight);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      const targetGroup = highlight.captureGroup;
      const indices = (match as RegExpExecArray & { indices?: Array<[number, number] | undefined> }).indices;
      const targetText = Number.isInteger(targetGroup) && targetGroup !== undefined ? match[targetGroup] : match[0];
      let from = match.index;
      let to = match.index + match[0].length;

      if (Number.isInteger(targetGroup) && targetGroup !== undefined) {
        const groupIndices = indices?.[targetGroup];
        if (groupIndices) {
          [from, to] = groupIndices;
        } else if (targetText) {
          const offset = match[0].indexOf(targetText);
          if (offset >= 0) {
            from = match.index + offset;
            to = from + targetText.length;
          }
        }
      }

      if (!targetText || from >= to) {
        regex.lastIndex = Math.max(regex.lastIndex + 1, match.index + 1);
        continue;
      }

      entries.push({
        from,
        to,
        decoration: Decoration.mark({
          class: "cm-customRegexHighlight",
          attributes: style ? { style } : undefined
        })
      });
    }
  });

  let lastEnd = -1;
  entries
    .sort((first, second) => first.from - second.from || first.to - second.to)
    .forEach((entry) => {
      if (entry.from < lastEnd || entry.from >= entry.to) {
        return;
      }
      lastEnd = entry.to;
      builder.add(entry.from, entry.to, entry.decoration);
    });

  return builder.finish();
}

function createColorMarkerDecorations(state: EditorState, markers: ColorMarker[]) {
  const builder = new RangeSetBuilder<Decoration>();
  if (!markers.length) {
    return builder.finish();
  }

  const content = state.doc.toString();
  const entries: Array<{ from: number; to: number; decoration: Decoration }> = [];
  markers.forEach((marker) => {
    if (!marker.text) {
      return;
    }
    let index = content.indexOf(marker.text);
    while (index !== -1) {
      entries.push({
        from: index,
        to: index + marker.text.length,
        decoration: Decoration.mark({
          class: "cm-color-marker",
          attributes: {
            style: `background-color: ${marker.color}`
          }
        })
      });
      index = content.indexOf(marker.text, index + Math.max(marker.text.length, 1));
    }
  });

  entries
    .sort((first, second) => first.from - second.from || first.to - second.to)
    .forEach((entry) => {
      if (entry.from < entry.to) {
        builder.add(entry.from, entry.to, entry.decoration);
      }
    });

  return builder.finish();
}

export default forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(function CodeMirrorEditor({
  documentId,
  content,
  viewState,
  wordWrap,
  tabSize,
  displayOptions,
  matches,
  currentMatchIndex,
  lineHighlights,
  colorMarkers,
  fontStyle,
  language,
  onChange,
  onCursorChange,
  onCurrentMatchReset,
  onLineHighlightsClear,
  onOpenSearchWidget,
  onJumpToLine,
  onEditorContextMenu,
  onViewStateChange,
  onZoomWheel
}, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const contentRef = useRef(content);
  const wrapCompartmentRef = useRef(new Compartment());
  const tabSizeCompartmentRef = useRef(new Compartment());
  const decorationCompartmentRef = useRef(new Compartment());
  const displayCompartmentRef = useRef(new Compartment());
  const customRegexCompartmentRef = useRef(new Compartment());
  const colorMarkerCompartmentRef = useRef(new Compartment());
  const languageCompartmentRef = useRef(new Compartment());
  const changeRef = useRef(onChange);
  const cursorRef = useRef(onCursorChange);
  const resetRef = useRef(onCurrentMatchReset);
  const clearLineHighlightsRef = useRef(onLineHighlightsClear);
  const openSearchRef = useRef(onOpenSearchWidget);
  const jumpToLineRef = useRef(onJumpToLine);
  const editorContextMenuRef = useRef(onEditorContextMenu);
  const viewStateChangeRef = useRef(onViewStateChange);
  const languageLoadRef = useRef(0);
  const restoringViewStateRef = useRef(false);
  const viewStateFrameRef = useRef(0);
  const documentIdRef = useRef(documentId);

  useEffect(() => {
    changeRef.current = onChange;
    cursorRef.current = onCursorChange;
    resetRef.current = onCurrentMatchReset;
    clearLineHighlightsRef.current = onLineHighlightsClear;
    openSearchRef.current = onOpenSearchWidget;
    jumpToLineRef.current = onJumpToLine;
    editorContextMenuRef.current = onEditorContextMenu;
    viewStateChangeRef.current = onViewStateChange;
  }, [onChange, onCurrentMatchReset, onCursorChange, onEditorContextMenu, onJumpToLine, onLineHighlightsClear, onOpenSearchWidget, onViewStateChange]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const reportViewState = () => {
    const view = viewRef.current;
    if (!view || restoringViewStateRef.current || viewStateFrameRef.current) {
      return;
    }
    const onViewStateChange = viewStateChangeRef.current;
    viewStateFrameRef.current = window.requestAnimationFrame(() => {
      viewStateFrameRef.current = 0;
      const currentView = viewRef.current;
      if (!currentView || restoringViewStateRef.current) {
        return;
      }
      const selection = currentView.state.selection.main;
      onViewStateChange({
        selectionStart: selection.from,
        selectionEnd: selection.to,
        scrollTop: currentView.scrollDOM.scrollTop,
        scrollLeft: currentView.scrollDOM.scrollLeft
      });
    });
  };

  const restoreViewState = (state = viewState) => {
    const view = viewRef.current;
    if (!view || !state) {
      return;
    }
    const selectionStart = Math.max(0, Math.min(view.state.doc.length, state.selectionStart));
    const selectionEnd = Math.max(0, Math.min(view.state.doc.length, state.selectionEnd));
    restoringViewStateRef.current = true;
    view.dispatch({ selection: { anchor: selectionStart, head: selectionEnd } });
    cursorRef.current(selectionEnd);
    requestAnimationFrame(() => {
      const currentView = viewRef.current;
      if (currentView) {
        currentView.scrollDOM.scrollTop = state.scrollTop;
        currentView.scrollDOM.scrollLeft = state.scrollLeft;
      }
      restoringViewStateRef.current = false;
    });
  };

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    setSelectionRange: (start, end, focusEditor = true) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      const safeStart = Math.max(0, Math.min(view.state.doc.length, start));
      const safeEnd = Math.max(0, Math.min(view.state.doc.length, end));
      view.dispatch({ selection: { anchor: safeStart, head: safeEnd }, scrollIntoView: true });
      cursorRef.current(safeEnd);
      if (focusEditor) {
        view.focus();
      }
    },
    getSelectionRange: () => {
      const selection = viewRef.current?.state.selection.main;
      return selection ? { start: selection.from, end: selection.to } : { start: 0, end: 0 };
    },
    getViewState: () => {
      const view = viewRef.current;
      if (!view) {
        return { selectionStart: 0, selectionEnd: 0, scrollTop: 0, scrollLeft: 0 };
      }
      const selection = view.state.selection.main;
      return {
        selectionStart: selection.from,
        selectionEnd: selection.to,
        scrollTop: view.scrollDOM.scrollTop,
        scrollLeft: view.scrollDOM.scrollLeft
      };
    },
    isOffsetVisible: (offset) => {
      const view = viewRef.current;
      if (!view) {
        return false;
      }
      const safeOffset = Math.max(0, Math.min(view.state.doc.length, offset));
      return view.visibleRanges.some((range) => safeOffset >= range.from && safeOffset <= range.to);
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

    const customRegexDecorationField = StateField.define<DecorationSet>({
      create: (state) => createCustomRegexDecorations(state, language),
      update: (decorations, transaction) => transaction.docChanged ? createCustomRegexDecorations(transaction.state, language) : decorations.map(transaction.changes),
      provide: (field) => EditorView.decorations.from(field)
    });

    const colorMarkerDecorationField = StateField.define<DecorationSet>({
      create: (state) => createColorMarkerDecorations(state, colorMarkers),
      update: (decorations, transaction) => transaction.docChanged ? createColorMarkerDecorations(transaction.state, colorMarkers) : decorations.map(transaction.changes),
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
        reportViewState();
      }
    });

    const clearLineHighlightsOnDoubleClick = EditorView.domEventHandlers({
      dblclick: () => {
        clearLineHighlightsRef.current();
        return false;
      }
    });

    const editorContextMenuHandler = EditorView.domEventHandlers({
      contextmenu: (event, view) => {
        if (view.state.selection.main.empty) {
          return false;
        }
        event.preventDefault();
        editorContextMenuRef.current(event.clientX, event.clientY);
        return true;
      }
    });

    const scrollStateListener = EditorView.domEventHandlers({
      scroll: () => {
        reportViewState();
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
              key: "Mod-g",
              run: () => {
                jumpToLineRef.current();
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
          editorContextMenuHandler,
          scrollStateListener,
          highlightSelectionMatches({ wholeWords: true }),
          wrapCompartmentRef.current.of(wordWrap ? EditorView.lineWrapping : []),
          tabSizeCompartmentRef.current.of([
            EditorState.tabSize.of(tabSize),
            indentUnit.of(" ".repeat(tabSize))
          ]),
          decorationCompartmentRef.current.of(searchDecorationField),
          displayCompartmentRef.current.of(Prec.highest(displayBackgroundsExtension(displayOptions))),
          customRegexCompartmentRef.current.of(customRegexDecorationField),
          colorMarkerCompartmentRef.current.of(colorMarkerDecorationField),
          languageCompartmentRef.current.of([])
        ]
      })
    });

    viewRef.current = view;
    restoreViewState();
    return () => {
      if (viewStateFrameRef.current) {
        window.cancelAnimationFrame(viewStateFrameRef.current);
        viewStateFrameRef.current = 0;
      }
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const didSwitchDocument = documentIdRef.current !== documentId;
    documentIdRef.current = documentId;
    const current = view.state.doc.toString();
    if (current === content) {
      if (didSwitchDocument) {
        restoreViewState();
      }
      return;
    }
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
      selection: {
        anchor: Math.min(content.length, didSwitchDocument ? viewState?.selectionStart ?? 0 : selection.anchor),
        head: Math.min(content.length, didSwitchDocument ? viewState?.selectionEnd ?? 0 : selection.head)
      }
    });
    if (didSwitchDocument) {
      requestAnimationFrame(() => restoreViewState());
    }
  }, [content, documentId, viewState]);

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
    view.dispatch({
      effects: tabSizeCompartmentRef.current.reconfigure([
        EditorState.tabSize.of(tabSize),
        indentUnit.of(" ".repeat(tabSize))
      ])
    });
    requestAnimationFrame(() => view.requestMeasure());
  }, [tabSize]);

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
    const field = StateField.define<DecorationSet>({
      create: (state) => createColorMarkerDecorations(state, colorMarkers),
      update: (decorations, transaction) => transaction.docChanged ? createColorMarkerDecorations(transaction.state, colorMarkers) : decorations.map(transaction.changes),
      provide: (field) => EditorView.decorations.from(field)
    });
    view.dispatch({ effects: colorMarkerCompartmentRef.current.reconfigure(field) });
  }, [colorMarkers]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: displayCompartmentRef.current.reconfigure(Prec.highest(displayBackgroundsExtension(displayOptions)))
    });
  }, [displayOptions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const loadId = languageLoadRef.current + 1;
    languageLoadRef.current = loadId;
    const field = StateField.define<DecorationSet>({
      create: (state) => createCustomRegexDecorations(state, language),
      update: (decorations, transaction) => transaction.docChanged ? createCustomRegexDecorations(transaction.state, language) : decorations.map(transaction.changes),
      provide: (field) => EditorView.decorations.from(field)
    });
    void getLanguageExtensions(language).then((extensions) => {
      if (languageLoadRef.current !== loadId || viewRef.current !== view) {
        return;
      }
      view.dispatch({
        effects: [
          customRegexCompartmentRef.current.reconfigure(field),
          languageCompartmentRef.current.reconfigure(extensions)
        ]
      });
    });
  }, [language]);

  return <div ref={hostRef} className={wordWrap ? "cm-editor-host is-wrapping" : "cm-editor-host"} style={fontStyle} onWheel={onZoomWheel} />;
});
