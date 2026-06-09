
const CONFIG = {
  API_KEY: "your YouTube Data API v3 key here",

  
  API_BASE: "https://www.googleapis.com/youtube/v3",

  // Max video IDs per batch request (API limit: 50)
  BATCH_SIZE: 50,

  // Max playlist items per page (API limit: 50)
  PAGE_SIZE: 50,

  // Max recent searches to store
  MAX_RECENT_SEARCHES: 5,

  // Playback speeds to display
  PLAYBACK_SPEEDS: [1, 1.25, 1.5, 1.75, 2],

  // localStorage keys
  STORAGE_KEYS: {
    THEME: "yt-calc-theme",
    RECENT: "yt-calc-recent",
  },
};