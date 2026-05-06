/**
 * BROWSER CACHE CLEANUP SCRIPT
 * Run this in browser console to force clear all cached UI data
 * This ensures old UIs (h5p, genially, educaplay) are completely removed
 * 
 * Usage: Copy and paste into browser console (F12 > Console tab)
 */

(() => {
  console.warn("🧹 [CACHE CLEANUP] Starting aggressive cache cleanup...");

  // List of all cache keys to clear
  const CACHE_PATTERNS = [
    "actividades",
    "activity",
    "interactive",
    "h5p",
    "genially",
    "educaplay",
    "topic",
    "lesson",
    "section",
    "content",
    "block",
    "form",
    "draft",
    "modal",
    "UI_VERSION",
  ];

  // 1. Clear localStorage
  console.log("📦 Clearing localStorage...");
  const localStorageKeysToDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const shouldDelete = CACHE_PATTERNS.some((pattern) =>
        key.toLowerCase().includes(pattern.toLowerCase())
      );
      if (shouldDelete) {
        localStorageKeysToDelete.push(key);
      }
    }
  }
  localStorageKeysToDelete.forEach((key) => {
    localStorage.removeItem(key);
    console.log(`  ❌ Removed: ${key}`);
  });

  // 2. Clear sessionStorage
  console.log("📦 Clearing sessionStorage...");
  const sessionStorageKeysToDelete: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key) {
      const shouldDelete = CACHE_PATTERNS.some((pattern) =>
        key.toLowerCase().includes(pattern.toLowerCase())
      );
      if (shouldDelete) {
        sessionStorageKeysToDelete.push(key);
      }
    }
  }
  sessionStorageKeysToDelete.forEach((key) => {
    sessionStorage.removeItem(key);
    console.log(`  ❌ Removed: ${key}`);
  });

  // 3. Clear IndexedDB (if exists)
  console.log("🗄️ Clearing IndexedDB...");
  if (window.indexedDB) {
    indexedDB.databases().then((dbs: any[]) => {
      dbs.forEach((dbInfo: any) => {
        if (
          dbInfo.name.toLowerCase().includes("activity") ||
          dbInfo.name.toLowerCase().includes("interactive") ||
          dbInfo.name.toLowerCase().includes("h5p") ||
          dbInfo.name.toLowerCase().includes("genially") ||
          dbInfo.name.toLowerCase().includes("educaplay")
        ) {
          console.log(`  ❌ Deleting IndexedDB: ${dbInfo.name}`);
          indexedDB.deleteDatabase(dbInfo.name);
        }
      });
    });
  }

  // 4. Clear Service Worker cache (if exists)
  console.log("🔧 Clearing Service Worker cache...");
  if ("caches" in window) {
    caches.keys().then((cacheNames: string[]) => {
      cacheNames.forEach((cacheName) => {
        if (
          cacheName.toLowerCase().includes("activity") ||
          cacheName.toLowerCase().includes("interactive") ||
          cacheName.toLowerCase().includes("api")
        ) {
          console.log(`  ❌ Deleting cache: ${cacheName}`);
          caches.delete(cacheName);
        }
      });
    });
  }

  // 5. Set UI version to force next load to update
  localStorage.setItem("UI_VERSION", "2026-05-05-native-only");
  console.log("📌 Set UI_VERSION to: 2026-05-05-native-only");

  console.log("✅ [CACHE CLEANUP] Complete! Reloading page...");
  console.log("💡 If you still see old UIs after reload, check:");
  console.log("   1. Press Ctrl+Shift+Del to clear browser cache");
  console.log("   2. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)");

  // Reload page
  setTimeout(() => {
    window.location.reload();
  }, 1500);
})();
