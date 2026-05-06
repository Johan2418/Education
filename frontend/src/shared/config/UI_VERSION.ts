/**
 * UI Version Control
 * This file tracks UI migrations and ensures old cached data is cleaned up
 * 
 * BREAKING CHANGES:
 * - 2026-05-05: Removed h5p, genially, educaplay providers
 *               Only 'nativo' provider allowed
 */

export const UI_CONFIG = {
  VERSION: "2026-05-05-native-only",
  DEPRECATED_PROVIDERS: ["h5p", "genially", "educaplay"],
  ALLOWED_PROVIDERS: ["nativo"],
  ACTIVITY_TYPES: [
    "quiz",
    "true_false",
    "fill_in_the_blank",
    "matching",
    "ordering",
    "hotspot",
    "drag_and_drop",
    "interactive_map",
    "word_search",
    "crossword",
    "memory",
    "simulator",
    "virtual_lab",
  ] as const,
};

/**
 * Keys that store cached interactive activity data
 * These should be cleared on version change
 */
export const CACHE_KEYS_TO_CLEAR = [
  "actividades_interactivas_cache",
  "activity_form_state",
  "topic_configuration_state",
  "lesson_section_form_state",
  "native_activity_config",
  "interactive_block_draft",
  "contentBlockDraft",
  "topicModal",
  "lessonModal",
  "h5p_activities", // Legacy - should never exist
  "genially_activities", // Legacy - should never exist
  "educaplay_activities", // Legacy - should never exist
];

/**
 * Get the version stored in localStorage
 */
export function getStoredUIVersion(): string | null {
  return localStorage.getItem("UI_VERSION");
}

/**
 * Check if UI version needs update
 */
export function isUIVersionOutdated(): boolean {
  const stored = getStoredUIVersion();
  return stored !== UI_CONFIG.VERSION;
}

/**
 * Clear all cached data and update version
 */
export function clearUICache(): void {
  // Clear all known cache keys
  CACHE_KEYS_TO_CLEAR.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });

  // Clear all localStorage that contains "activity" or "interactive" keywords
  const keysToDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && /activity|interactive|h5p|genially|educaplay/i.test(key)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach((key) => localStorage.removeItem(key));

  // Same for sessionStorage
  const sessionKeysToDelete: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && /activity|interactive|h5p|genially|educaplay/i.test(key)) {
      sessionKeysToDelete.push(key);
    }
  }
  sessionKeysToDelete.forEach((key) => sessionStorage.removeItem(key));

  // Update version
  localStorage.setItem("UI_VERSION", UI_CONFIG.VERSION);
  console.log("[UI Cache] Cleared all outdated UI cache. Version:", UI_CONFIG.VERSION);
}

/**
 * Validate that a provider is allowed
 */
export function isProviderValid(provider: unknown): boolean {
  return typeof provider === "string" && UI_CONFIG.ALLOWED_PROVIDERS.includes(provider as any);
}

/**
 * Validate activity type
 */
export function isActivityTypeValid(type: unknown): boolean {
  return typeof type === "string" && (UI_CONFIG.ACTIVITY_TYPES as readonly string[]).includes(type);
}
