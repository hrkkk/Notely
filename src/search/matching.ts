import type { SearchMatch, SearchOptions } from "../types";

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

export {
  findMatches,
  createSearchRegex,
  findMatchesInRange,
  getSelectedLineRange,
  getCurrentLineRange,
  findPreviousMatchIndex
};
