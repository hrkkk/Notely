import { builtInLanguages } from "./builtIn";
import { getExtension } from "../utils/path";
import type { LanguageDefinition } from "../types";

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

export { detectLanguage, getLanguageDefinition };
