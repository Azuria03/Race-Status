// ============================================================
// Marathon Participant Lookup — Google Apps Script Backend
// Deploy as: Web App > Execute as Me > Anyone (no sign-in)
// ============================================================


// ── SHEET CONFIGURATION ──────────────────────────────────────
//
// SHEET_NAME: The exact tab name in your Google Sheet.
const SHEET_NAME = "Participants";

// ── COLUMN INDEX MAP ─────────────────────────────────────────
//
// This is where you manually map your sheet columns to field names.
// Columns are zero-indexed: A=0, B=1, C=2, D=3, E=4, F=5 ...
//
// YOUR CURRENT SHEET LAYOUT:
//   A (0) = First Name
//   B (1) = Last Name
//   C (2) = Gender
//   D (3) = Distance
//   E (4) = Shirt Size
//   F (5) = Team
//   G (6) = Reg Status       ← new column added here
//
// HOW TO ADD A NEW COLUMN:
//   1. Add it to your sheet (e.g. column H = "Payment Status")
//   2. Add a new entry below, e.g.:  paymentStatus: 7
//   3. Use it in the participant loop further down: row[COL.paymentStatus]
//
const COL = {
  firstName : 0,   // A — First Name
  lastName  : 1,   // B — Last Name
  gender    : 2,   // C — Gender
  distance  : 3,   // D — Distance
  shirtSize : 4,   // E — Shirt Size
  team      : 5,   // F — Team
  regStatus : 6,   // G — Reg Status  ← add more fields here the same way
};

// ── STATS COLUMN POSITIONS ────────────────────────────────────
//
// Your sheet has pre-computed totals stored as single cells with
// combined label + number (e.g. "5KM - 2", "XS = 1").
// Tell the script which COLUMN contains those summary cells,
// and which rows they live in.
//
// Example layout (adjust row numbers to match your actual sheet):
//
//   Col H (7):  "Total Participants"  header
//   H2: "5KM - 2"
//   H3: "10KM - 2"
//   H4: "21KM - 2"
//   H5: "42KM - 2"
//
//   Col I (8):  "Total Shirt Sizes"  header
//   I2: "XS = 2"
//   I3: "Small = 1"
//   I4: "Medium = 3"
//   I5: "Large = 1"
//   I6: "XL = 1"
//
// STATS_COL_DISTANCES: column index of the distances summary
// STATS_COL_SHIRTS:    column index of the shirt sizes summary
// STATS_ROW_START:     first data row (0-indexed) — row 2 in Sheets = index 1
// STATS_ROW_END_DIST:  last distance row (0-indexed)
// STATS_ROW_END_SHIRT: last shirt row (0-indexed)
//
const STATS_COL_DISTANCES  = 7;   // Column H
const STATS_COL_SHIRTS     = 8;   // Column I
const STATS_ROW_START      = 1;   // Row 2 in Sheets (header is row 1 = index 0)
const STATS_ROW_END_DIST   = 4;   // Rows 2–5  → indices 1–4  (4 distance categories)
const STATS_ROW_END_SHIRT  = 5;   // Rows 2–6  → indices 1–5  (5 shirt categories)

// ── CACHE SETTINGS ────────────────────────────────────────────
const CACHE_KEY = "marathon_participants_v2";
const CACHE_TTL = 600; // seconds — 10 minutes


// ── NORMALISATION HELPERS ─────────────────────────────────────

function normaliseGender(v) {
  const s = v.trim().toUpperCase();
  if (s === "M" || s === "MALE")   return "Male";
  if (s === "F" || s === "FEMALE") return "Female";
  return v.trim() || "—";
}

function normaliseDistance(v) {
  const map = {
    "5":"5K",   "5K":"5K",   "5KM":"5K",
    "10":"10K", "10K":"10K", "10KM":"10K",
    "21":"21K", "21K":"21K", "21KM":"21K", "HALF":"21K",
    "42":"42K", "42K":"42K", "42KM":"42K", "FULL":"42K"
  };
  const key = v.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  return map[key] || v.trim() || "—";
}

function normaliseShirt(v) {
  const map = {
    "XS":"XS",
    "S":"S", "SM":"S", "SMALL":"S",
    "M":"M", "MED":"M", "MEDIUM":"M",
    "L":"L", "LG":"L", "LARGE":"L",
    "XL":"XL", "EXTRALARGE":"XL", "XLARGE":"XL", "X-LARGE":"XL"
  };
  const key = v.trim().toUpperCase().replace(/[^A-Z]/g, "");
  return map[key] || v.trim() || "—";
}

// ── PARSE A STATS CELL ────────────────────────────────────────
//
// Reads a cell value like "5KM - 2" or "XS = 1" and returns
// an object: { label: "5KM", count: 2 }
//
// It splits on any of these separators: " - ", " = ", ":", "-", "="
// and trims both sides.
//
// If the cell is blank or can't be parsed, returns null.
//
function parseStatCell(raw) {
  const str = String(raw || "").trim();
  if (!str) return null;

  // Split on dash or equals, allowing spaces around them
  const parts = str.split(/\s*[-=:]\s*/);
  if (parts.length < 2) return null;

  const label = parts[0].trim();
  const count = parseInt(parts[parts.length - 1].trim(), 10);

  if (!label || isNaN(count)) return null;
  return { label, count };
}


// ── MAIN HANDLER ─────────────────────────────────────────────

function doGet(e) {
  try {
    // Check cache first — avoids reading the sheet on every request
    // UNLESS the user passes ?noCache=true to force a fresh read
    const cache  = CacheService.getScriptCache();
    const noCache = e.parameter.noCache === "true";
    const cached = noCache ? null : cache.get(CACHE_KEY);

    if (cached) {
      return ContentService
        .createTextOutput(cached)
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found.`);

    // Read all data in one call (efficient — avoids multiple API calls)
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      const empty = JSON.stringify({ participants: [], stats: emptyStats() });
      return ContentService.createTextOutput(empty).setMimeType(ContentService.MimeType.JSON);
    }

    // ── BUILD PARTICIPANTS LIST ───────────────────────────────
    //
    // Row 0 is the header — skip it. Start at index 1.
    //
    const participants = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      // Skip rows where BOTH name columns are empty
      const firstName = String(row[COL.firstName] || "").trim();
      const lastName  = String(row[COL.lastName]  || "").trim();
      if (!firstName && !lastName) continue;

      // Combine first + last name into a single display name.
      // The filter removes empty parts so "Juan " doesn't become "Juan ".
      const name = [firstName, lastName].filter(Boolean).join(" ");

      const gender    = normaliseGender(String(row[COL.gender]    || ""));
      const distance  = normaliseDistance(String(row[COL.distance] || ""));
      const shirtSize = normaliseShirt(String(row[COL.shirtSize]   || ""));
      const team      = String(row[COL.team] || "").trim() || "—";

      // ── HOW TO ADD A NEW FIELD ──────────────────────────────
      //
      // 1. Add the column index to COL above (e.g. regStatus: 6)
      // 2. Read it here — just copy this pattern:
      //
      //      const regStatus = String(row[COL.regStatus] || "").trim() || "—";
      //
      // 3. Add it to the object pushed below (e.g.  regStatus,)
      // 4. That's it! It will appear in the JSON response automatically.
      //
      const regStatus = String(row[COL.regStatus] || "").trim() || "—";

      participants.push({ name, gender, distance, shirtSize, team, regStatus });
    }

    // ── READ PRE-COMPUTED STATS FROM THE SHEET ────────────────
    //
    // Instead of counting from the participant rows, we read the
    // summary cells you've already filled in on the sheet.
    //
    // parseStatCell() turns "5KM - 2" → { label:"5KM", count:2 }
    // We then normalise the label so "5KM" becomes the canonical "5K".
    //
    const stats = emptyStats();

    // Distance stats
    for (let r = STATS_ROW_START; r <= STATS_ROW_END_DIST; r++) {
      if (!data[r]) continue;
      const parsed = parseStatCell(data[r][STATS_COL_DISTANCES]);
      if (!parsed) continue;
      const key = normaliseDistance(parsed.label); // "5KM" → "5K"
      if (stats.distances[key] !== undefined) {
        stats.distances[key] = parsed.count;
      }
    }

    // Shirt stats
    for (let r = STATS_ROW_START; r <= STATS_ROW_END_SHIRT; r++) {
      if (!data[r]) continue;
      const parsed = parseStatCell(data[r][STATS_COL_SHIRTS]);
      if (!parsed) continue;
      const key = normaliseShirt(parsed.label); // "Small" → "S"
      if (stats.shirts[key] !== undefined) {
        stats.shirts[key] = parsed.count;
      }
    }

    // ── CACHE & RETURN ────────────────────────────────────────
    const payload = JSON.stringify({ participants, stats });
    cache.put(CACHE_KEY, payload, CACHE_TTL);

    return ContentService
      .createTextOutput(payload)
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    const errPayload = JSON.stringify({ error: err.message });
    return ContentService
      .createTextOutput(errPayload)
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ── EMPTY STATS TEMPLATE ─────────────────────────────────────
//
// Defines the expected keys. Any stat cell that doesn't match a
// key here is silently ignored.
//
function emptyStats() {
  return {
    distances: { "5K": 0, "10K": 0, "21K": 0, "42K": 0 },
    shirts:    { "XS": 0, "S": 0, "M": 0, "L": 0, "XL": 0 }
  };
}


// ── OPTIONAL: CLEAR CACHE MANUALLY ───────────────────────────
//
// Run this function from the Apps Script editor anytime you want
// the API to return fresh data immediately (without waiting 10 min).
// Go to: Run → clearCache
//
function clearCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  Logger.log("Cache cleared successfully.");
}
