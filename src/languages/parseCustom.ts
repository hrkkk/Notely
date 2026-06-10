import type { CSSProperties } from "react";
import type { CustomKeywordGroup, CustomLanguageConfig, CustomRegexHighlight, LanguageDefinition } from "../types";

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
  const groups = (value.keywordGroups ?? []) as CustomKeywordGroup[];
  const keywordStyles: Record<string, CSSProperties> = {};
  const keywords: string[] = [];

  if (Array.isArray(groups)) {
    groups.forEach((group) => {
      const keywordText = group.keywords ?? group.keyword1 ?? "";
      const color = group.color ?? group.keywordColor;
      const style = keywordStyleFromText(group.style ?? group.fontStyle, color);
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
        const keywordText = group.keywords ?? group.keyword1 ?? "";
        const color = group.color ?? group.keywordColor;
        const style = keywordStyleFromText(group.style ?? group.fontStyle, color);
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

function normalizeRegexHighlights(value: CustomLanguageConfig) {
  const highlights = (value.regexHighlights ?? value.regexHighlight ?? []) as CustomRegexHighlight[];

  if (!Array.isArray(highlights)) {
    return [];
  }

  return highlights
    .filter((highlight) => highlight && typeof highlight.pattern === "string" && highlight.pattern.length > 0)
    .map((highlight) => ({
      pattern: highlight.pattern,
      captureGroup: Number.isInteger(highlight.captureGroup) ? highlight.captureGroup : undefined,
      color: highlight.color,
      backgroundColor: highlight.backgroundColor,
      fontWeight: highlight.fontWeight,
      fontStyle: highlight.fontStyle
    }));
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
        const name = language.name ?? language.languageName ?? "";
        const extensions = normalizeExtensionValue(language.extensions ?? language.extension);
        const regex = language.regex ?? language.regexPattern;
        const keywordConfig = normalizeKeywordGroups(language);
        const regexHighlights = normalizeRegexHighlights(language);
        return {
          name,
          extensions,
          keywords: keywordConfig.keywords,
          regexHighlights,
          keywordStyles: keywordConfig.keywordStyles,
          isCustom: true,
          regexEnabled: language.regexEnabled ?? language.enableRegex ?? false,
          regex,
          comment: {
            line: language.lineComment ?? undefined,
            blockStart: language.blockStart ?? language.blockCommentStart ?? undefined,
            blockEnd: language.blockEnd ?? language.blockCommentEnd ?? undefined
          }
        };
      })
      .filter((language) => language.name && (language.extensions.length > 0 || language.regex));
  } catch {
    return [];
  }
}

export { parseCustomLanguages };
