import type { CustomKeywordGroup, CustomKeywordStyle, CustomLanguageConfig, CustomRegexHighlight, LanguageDefinition } from "../types";

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

function keywordStyleFromGroup(group: CustomKeywordGroup): CustomKeywordStyle {
  const style: CustomKeywordStyle = {
    color: group.color ?? group.keywordColor ?? undefined,
    backgroundColor: group.backgroundColor ?? group.bgColor ?? undefined,
    fontWeight: group.fontWeight ?? group.weight ?? undefined,
    fontStyle: group.fontStyle ?? group.style ?? undefined,
    textDecoration: group.textDecoration ?? group.decoration ?? undefined,
    borderColor: group.borderColor ?? undefined,
    prefixEnabled: group.prefixEnabled ?? false
  };

  return Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined && value !== "")) as CustomKeywordStyle;
}

function normalizeKeywordGroups(value: CustomLanguageConfig) {
  const groups = (value.keywordGroups ?? []) as CustomKeywordGroup[];
  const keywordStyles: Record<string, CustomKeywordStyle> = {};
  const keywordPrefixEnabled: Record<string, boolean> = {};
  const keywords: string[] = [];

  const addGroup = (group: CustomKeywordGroup) => {
    const keywordText = group.keywords ?? group.keyword1 ?? "";
    const style = keywordStyleFromGroup(group);
    normalizeWords(keywordText).forEach((keyword) => {
      const key = keyword.toLowerCase();
      keywords.push(keyword);
      keywordStyles[key] = style;
      keywordPrefixEnabled[key] = style.prefixEnabled ?? false;
    });
  };

  if (Array.isArray(groups)) {
    groups.forEach(addGroup);
  }

  if (typeof value.keywords === "string") {
    normalizeWords(value.keywords).forEach((keyword) => {
      keywords.push(keyword);
      keywordPrefixEnabled[keyword.toLowerCase()] = false;
    });
  } else if (Array.isArray(value.keywords)) {
    if (value.keywords.every((item) => typeof item === "string")) {
      (value.keywords as string[]).flatMap((item) => normalizeWords(item)).forEach((keyword) => {
        keywords.push(keyword);
        keywordPrefixEnabled[keyword.toLowerCase()] = false;
      });
    } else {
      (value.keywords as CustomKeywordGroup[]).forEach(addGroup);
    }
  }

  return {
    keywords: Array.from(new Set(keywords)),
    keywordStyles,
    keywordPrefixEnabled
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
      fontStyle: highlight.fontStyle,
      textDecoration: highlight.textDecoration,
      borderColor: highlight.borderColor
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
          keywordPrefixEnabled: keywordConfig.keywordPrefixEnabled,
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
