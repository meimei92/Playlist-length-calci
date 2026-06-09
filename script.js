/**
 * script.js
 * ─────────────────────────────────────────────
 * YouTube Playlist Length Calculator
 * Core application logic — no frameworks, pure ES6+
 * ─────────────────────────────────────────────
 */

"use strict";

/* ═══════════════════════════════════════════════
   UTILITY: URL & ID EXTRACTION
═══════════════════════════════════════════════ */

/**
 * extractPlaylistId(url)
 * Extracts the playlist ID from various YouTube URL formats.
 * Supports:
 *   https://www.youtube.com/playlist?list=PLxxxx
 *   https://youtube.com/watch?v=xxx&list=PLxxxx
 *   https://youtu.be/xxx?list=PLxxxx
 * @param {string} url - Raw URL string from input
 * @returns {string|null} Playlist ID or null if not found
 */
function extractPlaylistId(url) {
  if (!url || typeof url !== "string") return null;

  try {
    const parsed = new URL(url.trim());
    return parsed.searchParams.get("list");
  } catch {
    // Try regex fallback for partial URLs
    const match = url.match(/[?&]list=([^&]+)/);
    return match ? match[1] : null;
  }
}

/* ═══════════════════════════════════════════════
   UTILITY: ISO 8601 DURATION PARSING
═══════════════════════════════════════════════ */

/**
 * parseDuration(isoString)
 * Converts an ISO 8601 duration string to total seconds.
 * Examples: "PT15M30S" → 930, "PT1H22M10S" → 4930, "PT45S" → 45
 * @param {string} isoString - ISO 8601 duration from YouTube API
 * @returns {number} Total duration in seconds
 */
function parseDuration(isoString) {
  if (!isoString) return 0;

  const match = isoString.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/* ═══════════════════════════════════════════════
   UTILITY: DURATION FORMATTING
═══════════════════════════════════════════════ */

/**
 * formatDuration(seconds, compact)
 * Converts total seconds into a human-readable string.
 * @param {number} seconds - Total seconds
 * @param {boolean} compact - Omit seconds if true (for speed table)
 * @returns {string} Formatted duration string like "42h 13m 51s"
 */
function formatDuration(seconds, compact = false) {
  if (isNaN(seconds) || seconds < 0) return "0s";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (compact) {
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ═══════════════════════════════════════════════
   UTILITY: STATS CALCULATION
═══════════════════════════════════════════════ */

/**
 * calculateStats(videos)
 * Computes aggregate statistics from an array of video duration objects.
 * @param {Array<{id: string, duration: number, title: string}>} videos
 * @returns {Object} Stats object with total, average, longest, shortest
 */
function calculateStats(videos) {
  if (!videos || videos.length === 0) {
    return { total: 0, average: 0, longest: null, shortest: null };
  }

  // Filter out videos with 0 duration (live streams, unavailable)
  const valid = videos.filter((v) => v.duration > 0);

  const total = videos.reduce((sum, v) => sum + v.duration, 0);
  const average = valid.length > 0 ? Math.round(total / valid.length) : 0;

  const sorted = [...valid].sort((a, b) => b.duration - a.duration);
  const longest = sorted[0] || null;
  const shortest = sorted[sorted.length - 1] || null;

  // Estimated completion: seconds per day at 1 hour/day
  const secondsPerDay = 3600;
  const daysToComplete = total > 0 ? Math.ceil(total / secondsPerDay) : 0;

  return { total, average, longest, shortest, daysToComplete };
}

/* ═══════════════════════════════════════════════
   API: FETCH ALL PLAYLIST VIDEOS (WITH PAGINATION)
═══════════════════════════════════════════════ */

/**
 * fetchPlaylistVideos(playlistId)
 * Retrieves ALL video IDs from a playlist, handling pagination automatically.
 * Calls playlistItems endpoint repeatedly until nextPageToken is absent.
 * @param {string} playlistId - YouTube playlist ID
 * @returns {Promise<Array<string>>} Array of video IDs
 */
async function fetchPlaylistVideos(playlistId) {
  const videoIds = [];
  let pageToken = null;
  let playlistTitle = "";

  do {
    const params = new URLSearchParams({
      part: "snippet",
      playlistId,
      maxResults: CONFIG.PAGE_SIZE,
      key: CONFIG.API_KEY,
    });

    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${CONFIG.API_BASE}/playlistItems?${params}`);
    const data = await res.json();

    // Surface API errors clearly
    if (!res.ok) {
      const reason = data?.error?.errors?.[0]?.reason || "unknown";
      if (reason === "playlistNotFound" || res.status === 404) {
        throw new Error("PLAYLIST_NOT_FOUND");
      }
      if (res.status === 403) {
        throw new Error("PLAYLIST_PRIVATE");
      }
      throw new Error("API_ERROR");
    }

    if (!playlistTitle && data.items?.length) {
      // Grab title from first item's snippet
      playlistTitle =
        data.items[0]?.snippet?.channelTitle || "";
    }

    // Collect video IDs; skip private/deleted videos
    for (const item of data.items || []) {
      const vid = item.snippet?.resourceId?.videoId;
      if (vid) videoIds.push(vid);
    }

    pageToken = data.nextPageToken || null;

    // Update loading text with progress
    updateLoadingText(
      `Fetching videos… (${videoIds.length} found${pageToken ? ", loading more" : ""})`
    );
  } while (pageToken);

  return videoIds;
}

/* ═══════════════════════════════════════════════
   API: FETCH VIDEO DURATIONS IN BATCHES
═══════════════════════════════════════════════ */

/**
 * fetchVideoDurations(videoIds)
 * Fetches contentDetails for video IDs in batches of 50 (API limit).
 * @param {Array<string>} videoIds - All video IDs to look up
 * @returns {Promise<Array<{id, duration, title}>>} Array of video objects
 */
async function fetchVideoDurations(videoIds) {
  const videos = [];
  const batches = [];

  // Split IDs into chunks of BATCH_SIZE
  for (let i = 0; i < videoIds.length; i += CONFIG.BATCH_SIZE) {
    batches.push(videoIds.slice(i, i + CONFIG.BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    updateLoadingText(
      `Fetching durations… (batch ${i + 1} of ${batches.length})`
    );

    const params = new URLSearchParams({
      part: "contentDetails,snippet",
      id: batch.join(","),
      key: CONFIG.API_KEY,
    });

    const res = await fetch(`${CONFIG.API_BASE}/videos?${params}`);
    const data = await res.json();

    if (!res.ok) throw new Error("API_ERROR");

    for (const item of data.items || []) {
      videos.push({
        id: item.id,
        title: item.snippet?.title || "Unknown",
        duration: parseDuration(item.contentDetails?.duration),
      });
    }
  }

  return videos;
}

/* ═══════════════════════════════════════════════
   RECENT SEARCHES (localStorage)
═══════════════════════════════════════════════ */

function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.RECENT)) || [];
  } catch {
    return [];
  }
}

function saveRecentSearch(url) {
  const recent = getRecentSearches().filter((u) => u !== url);
  recent.unshift(url);
  const trimmed = recent.slice(0, CONFIG.MAX_RECENT_SEARCHES);
  localStorage.setItem(CONFIG.STORAGE_KEYS.RECENT, JSON.stringify(trimmed));
  renderRecentSearches();
}

function renderRecentSearches() {
  const container = document.getElementById("recent-list");
  const section = document.getElementById("recent-section");
  const recent = getRecentSearches();

  if (recent.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  container.innerHTML = recent
    .map(
      (url) => `
      <button class="recent-item" data-url="${url}" title="${url}">
        <span class="recent-icon">▶</span>
        <span class="recent-url">${url}</span>
      </button>
    `
    )
    .join("");

  container.querySelectorAll(".recent-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("playlist-url").value = btn.dataset.url;
      handleCalculate();
    });
  });
}

/* ═══════════════════════════════════════════════
   THEME TOGGLE (pastel ↔ cyberpunk)
═══════════════════════════════════════════════ */

function initTheme() {
  const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
}

/* ═══════════════════════════════════════════════
   UI HELPERS
═══════════════════════════════════════════════ */

function showError(message) {
  const el = document.getElementById("error-message");
  el.textContent = message;
  el.hidden = false;
}

function clearError() {
  const el = document.getElementById("error-message");
  el.textContent = "";
  el.hidden = true;
}

function setLoading(loading) {
  const btn = document.getElementById("calculate-btn");
  const spinner = document.getElementById("spinner");
  const loadingText = document.getElementById("loading-text");
  btn.disabled = loading;
  spinner.hidden = !loading;
  loadingText.hidden = !loading;
  if (loading) {
    btn.classList.add("loading");
  } else {
    btn.classList.remove("loading");
  }
}

function updateLoadingText(text) {
  const el = document.getElementById("loading-text");
  if (el) el.textContent = text;
}

function hideResults() {
  document.getElementById("results-section").hidden = true;
}

/* ═══════════════════════════════════════════════
   RESULTS RENDERING
═══════════════════════════════════════════════ */

function renderResults(videos, stats, playlistId) {
  const section = document.getElementById("results-section");

  // Video count
  document.getElementById("res-count").textContent = videos.length;

  // Total duration
  document.getElementById("res-total").textContent = formatDuration(stats.total);

  // Progress bar — visual proportion of playlist hours
  const maxHours = 200; // cap at 200h for bar scaling
  const pct = Math.min((stats.total / (maxHours * 3600)) * 100, 100);
  document.getElementById("progress-fill").style.width = `${pct}%`;

  // Playback speed table
  const speedTable = document.getElementById("speed-table-body");
  speedTable.innerHTML = CONFIG.PLAYBACK_SPEEDS.map((speed) => {
    const adjusted = Math.round(stats.total / speed);
    return `
      <tr>
        <td class="speed-label">${speed}x</td>
        <td class="speed-duration">${formatDuration(adjusted, true)}</td>
      </tr>
    `;
  }).join("");

  // Statistics
  document.getElementById("res-average").textContent = formatDuration(stats.average);
  document.getElementById("res-longest").textContent = stats.longest
    ? `${formatDuration(stats.longest.duration)} — ${truncate(stats.longest.title, 40)}`
    : "N/A";
  document.getElementById("res-shortest").textContent = stats.shortest
    ? `${formatDuration(stats.shortest.duration)} — ${truncate(stats.shortest.title, 40)}`
    : "N/A";

  // 1 hour/day estimate
  document.getElementById("res-days").textContent =
    stats.daysToComplete > 0
      ? `~${stats.daysToComplete} day${stats.daysToComplete !== 1 ? "s" : ""} at 1h/day`
      : "N/A";

  section.hidden = false;

  // Scroll into view smoothly
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

/* ═══════════════════════════════════════════════
   COPY RESULTS TO CLIPBOARD
═══════════════════════════════════════════════ */

function copyResults() {
  const count = document.getElementById("res-count").textContent;
  const total = document.getElementById("res-total").textContent;
  const avg = document.getElementById("res-average").textContent;
  const days = document.getElementById("res-days").textContent;

  const speedLines = CONFIG.PLAYBACK_SPEEDS.map((speed) => {
    const cell = document.querySelector(
      `#speed-table-body tr:nth-child(${CONFIG.PLAYBACK_SPEEDS.indexOf(speed) + 1}) .speed-duration`
    );
    return `  ${speed}x  ${cell ? cell.textContent : ""}`;
  }).join("\n");

  const text = `📊 Playlist Statistics
━━━━━━━━━━━━━━━━━━━━
Videos:          ${count}
Total Duration:  ${total}
Average Video:   ${avg}
Completion:      ${days}

⏩ Playback Speeds
${speedLines}`;

  navigator.clipboard
    .writeText(text)
    .then(() => {
      const btn = document.getElementById("copy-btn");
      const orig = btn.textContent;
      btn.textContent = "✓ Copied!";
      setTimeout(() => (btn.textContent = orig), 2000);
    })
    .catch(() => alert("Copy failed — please copy manually."));
}

/* ═══════════════════════════════════════════════
   SHAREABLE URL
═══════════════════════════════════════════════ */

function buildShareUrl(playlistUrl) {
  const base = window.location.href.split("?")[0];
  return `${base}?list=${encodeURIComponent(playlistUrl)}`;
}

function copyShareUrl() {
  const url = document.getElementById("playlist-url").value.trim();
  if (!url) return;
  const share = buildShareUrl(url);
  navigator.clipboard.writeText(share).then(() => {
    const btn = document.getElementById("share-btn");
    const orig = btn.textContent;
    btn.textContent = "✓ Link Copied!";
    setTimeout(() => (btn.textContent = orig), 2000);
  });
}

/* ═══════════════════════════════════════════════
   Main calculation handler
═══════════════════════════════════════════════ */

async function handleCalculate() {
  const input = document.getElementById("playlist-url").value.trim();

  clearError();
  hideResults();

  // Validation
  if (!input) {
    showError("Playlist URL is required.");
    return;
  }

  const playlistId = extractPlaylistId(input);
  if (!playlistId) {
    showError("Please enter a valid YouTube playlist URL.");
    return;
  }

  if (CONFIG.API_KEY === "YOUR_YOUTUBE_API_KEY_HERE") {
    showError(
      "⚠️ API key not configured. Open config.js and replace YOUR_YOUTUBE_API_KEY_HERE with your YouTube Data API v3 key."
    );
    return;
  }

  setLoading(true);
  updateLoadingText("Fetching playlist information…");

  try {
    // Step 1: Get all video IDs with pagination
    const videoIds = await fetchPlaylistVideos(playlistId);

    if (videoIds.length === 0) {
      throw new Error("EMPTY_PLAYLIST");
    }

    // Step 2: Get durations in batches
    const videos = await fetchVideoDurations(videoIds);

    // Step 3: Compute statistics
    const stats = calculateStats(videos);

    // Step 4: Render results
    renderResults(videos, stats, playlistId);

    // Save to recent searches
    saveRecentSearch(input);
  } catch (err) {
    console.error("Calculation error:", err);

    const messages = {
      PLAYLIST_NOT_FOUND: "Playlist not found. Check the URL and try again.",
      PLAYLIST_PRIVATE: "This playlist is private or unavailable.",
      EMPTY_PLAYLIST: "This playlist appears to be empty.",
      API_ERROR: "Unable to fetch playlist information. Try again later.",
    };

    showError(messages[err.message] || messages.API_ERROR);
  } finally {
    setLoading(false);
    updateLoadingText("Fetching playlist information…");
  }
}

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
  // Theme
  initTheme();
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);

  // Calculate on button click
  document.getElementById("calculate-btn").addEventListener("click", handleCalculate);

  // Calculate on Enter key
  document.getElementById("playlist-url").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleCalculate();
  });

  // Copy results
  document.getElementById("copy-btn").addEventListener("click", copyResults);

  // Share URL
  document.getElementById("share-btn").addEventListener("click", copyShareUrl);

  // Load recent searches
  renderRecentSearches();

  // Pre-fill from URL query param ?list=...
  const params = new URLSearchParams(window.location.search);
  const prefill = params.get("list");
  if (prefill) {
    document.getElementById("playlist-url").value = decodeURIComponent(prefill);
    handleCalculate();
  }
});
