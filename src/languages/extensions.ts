import type { Extension } from "@codemirror/state";
import type { CommentTokens, LanguageDefinition } from "../types";

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

async function createCustomLanguageExtension(language: LanguageDefinition): Promise<Extension[]> {
  const [{ HighlightStyle, StreamLanguage, syntaxHighlighting }, { tags }] = await Promise.all([
    import("@codemirror/language"),
    import("@lezer/highlight")
  ]);
  type StringStream = import("@codemirror/language").StringStream;
  type StreamParser<T> = import("@codemirror/language").StreamParser<T>;

  const consumeUntilMatch = (stream: StringStream, marker: string) => {
    while (!stream.eol()) {
      if (stream.match(marker)) {
        return true;
      }
      stream.next();
    }
    return false;
  };

  const keywords = new Set(language.keywords.map((keyword) => keyword.toLowerCase()));
  const prefixKeywords = language.keywords
    .filter((keyword) => language.keywordPrefixEnabled?.[keyword.toLowerCase()] ?? language.keywordStyles?.[keyword.toLowerCase()]?.prefixEnabled ?? false)
    .sort((first, second) => second.length - first.length);
  const styledKeywords = new Set(Object.keys(language.keywordStyles ?? {}).map((keyword) => keyword.toLowerCase()));
  const stringDelimiters = [...(language.stringDelimiters?.length ? language.stringDelimiters : ["'", '"'])]
    .filter(Boolean)
    .sort((first, second) => second.length - first.length);
  const lineComment = language.comment.line;
  const blockStart = language.comment.blockStart;
  const blockEnd = language.comment.blockEnd;

  const highlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: "#8f3fb0" }
  ]);

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

      for (const keyword of prefixKeywords) {
        if (stream.match(keyword, true, true)) {
          stream.match(/[\p{L}\p{N}_$.-]*/u);
          return styledKeywords.has(keyword.toLowerCase()) ? "variableName" : "keyword";
        }
      }

      if (stream.match(/[\p{L}_$][\p{L}\p{N}_$-]*/u)) {
        const current = stream.current().toLowerCase();
        return keywords.has(current) && !styledKeywords.has(current) ? "keyword" : "variableName";
      }

      stream.next();
      return null;
    },
    languageData: getCommentLanguageData(language.comment)
  };

  return [StreamLanguage.define(parser), syntaxHighlighting(highlightStyle)];
}

async function getLanguageExtensions(language: LanguageDefinition): Promise<Extension[]> {
  switch (language.name.toLowerCase()) {
    case "javascript":
      return [(await import("@codemirror/lang-javascript")).javascript({ jsx: true })];
    case "typescript":
      return [(await import("@codemirror/lang-javascript")).javascript({ jsx: true, typescript: true })];
    case "python":
      return [(await import("@codemirror/lang-python")).python()];
    case "java":
      return [(await import("@codemirror/lang-java")).java()];
    case "c": {
      const [{ StreamLanguage }, { c }] = await Promise.all([
        import("@codemirror/language"),
        import("@codemirror/legacy-modes/mode/clike")
      ]);
      return [StreamLanguage.define(c)];
    }
    case "c++":
      return [(await import("@codemirror/lang-cpp")).cpp()];
    case "c#": {
      const [{ StreamLanguage }, { csharp }] = await Promise.all([
        import("@codemirror/language"),
        import("@codemirror/legacy-modes/mode/clike")
      ]);
      return [StreamLanguage.define(csharp)];
    }
    case "rust":
      return [(await import("@codemirror/lang-rust")).rust()];
    case "go":
      return [(await import("@codemirror/lang-go")).go()];
    case "shell": {
      const [{ StreamLanguage }, { shell }] = await Promise.all([
        import("@codemirror/language"),
        import("@codemirror/legacy-modes/mode/shell")
      ]);
      return [StreamLanguage.define(shell)];
    }
    case "sql":
      return [(await import("@codemirror/lang-sql")).sql()];
    case "html":
      return [(await import("@codemirror/lang-html")).html()];
    case "css":
      return [(await import("@codemirror/lang-css")).css()];
    case "json":
      return [(await import("@codemirror/lang-json")).json()];
    case "yaml":
      return [(await import("@codemirror/lang-yaml")).yaml()];
    case "markdown":
      return [(await import("@codemirror/lang-markdown")).markdown()];
    case "ruby": {
      const [{ StreamLanguage }, { ruby }] = await Promise.all([
        import("@codemirror/language"),
        import("@codemirror/legacy-modes/mode/ruby")
      ]);
      return [StreamLanguage.define(ruby)];
    }
    case "php":
      return [(await import("@codemirror/lang-php")).php()];
    case "lua": {
      const [{ StreamLanguage }, { lua }] = await Promise.all([
        import("@codemirror/language"),
        import("@codemirror/legacy-modes/mode/lua")
      ]);
      return [StreamLanguage.define(lua)];
    }
    case "kotlin": {
      const [{ StreamLanguage }, { kotlin }] = await Promise.all([
        import("@codemirror/language"),
        import("@codemirror/legacy-modes/mode/clike")
      ]);
      return [StreamLanguage.define(kotlin)];
    }
    default:
      return language.isCustom ? createCustomLanguageExtension(language) : [];
  }
}

export { getLanguageExtensions };
