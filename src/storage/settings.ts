import {
  defaultFontChoice,
  fontSettingsKey,
  fontSizes,
  languageFontSettingsKey,
  startupPolicyKey
} from "../constants";
import type { FontChoice, LanguageFontChoice, StartupPolicy } from "../types";

function loadFontChoice(): FontChoice {
  try {
    const raw = window.localStorage.getItem(fontSettingsKey);
    if (!raw) {
      return defaultFontChoice;
    }
    const parsed = JSON.parse(raw) as Partial<FontChoice>;
    return {
      family: parsed.family || defaultFontChoice.family,
      size: parsed.size && fontSizes.includes(parsed.size) ? parsed.size : defaultFontChoice.size
    };
  } catch {
    return defaultFontChoice;
  }
}

function loadLanguageFontChoices(): Record<string, LanguageFontChoice> {
  try {
    const raw = window.localStorage.getItem(languageFontSettingsKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, LanguageFontChoice>;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function saveFontChoice(choice: FontChoice) {
  window.localStorage.setItem(fontSettingsKey, JSON.stringify(choice));
}

function saveLanguageFontChoices(choices: Record<string, LanguageFontChoice>) {
  window.localStorage.setItem(languageFontSettingsKey, JSON.stringify(choices));
}

function loadStartupPolicy(): StartupPolicy {
  return window.localStorage.getItem(startupPolicyKey) === "restore" ? "restore" : "new";
}

function saveStartupPolicy(policy: StartupPolicy) {
  window.localStorage.setItem(startupPolicyKey, policy);
}

export {
  loadFontChoice,
  loadLanguageFontChoices,
  saveFontChoice,
  saveLanguageFontChoices,
  loadStartupPolicy,
  saveStartupPolicy
};
