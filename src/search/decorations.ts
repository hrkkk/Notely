import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import type { SearchMatch } from "../types";

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

export { createSearchDecorations };
