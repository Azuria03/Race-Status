# Marathon Race Lookup — Deployment Guide

---

## Part 1 · Google Apps Script (Backend API)

### Step 1 — Set up your Google Sheet

1. Create a new Google Sheet and name it anything you like.
2. Rename the default tab to exactly: **`Participants`**
3. Add this header row in row 1:

   | A    | B      | C        | D          | E    |
   |------|--------|----------|------------|------|
   | Name | Gender | Distance | Shirt Size | Team |

4. Add your runner data starting from row 2. Sample:

   | Name          | Gender | Distance | Shirt Size | Team        |
   |---------------|--------|----------|------------|-------------|
   | Maria Santos  | F      | 21K      | S          | Runners PH  |
   | Juan dela Cruz| M      | 42K      | L          | Solo        |

---

### Step 2 — Add the Apps Script

1. In your Google Sheet, click **Extensions → Apps Script**.
2. Delete all existing code in the editor.
3. Paste the entire contents of **`Code.gs`** from this project.
4. Click **Save** (💾 or Ctrl/Cmd+S). Name the project anything (e.g., `MarathonAPI`).

---

### Step 3 — Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the ⚙️ gear icon next to "Type" and select **Web app**.
3. Fill in:
   - **Description**: `Marathon Lookup API v1`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` *(no Google sign-in required)*
4. Click **Deploy**.
5. Authorize the permissions when prompted (click "Allow").
6. **Copy the Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycby.../exec
   ```

> ⚠️ **Important**: Every time you make changes to `Code.gs`, you must create a **new deployment** (not "Manage deployments → Edit"). Old deployments cache the prior version.

---

### Step 4 — Test the API

Open the Web App URL in your browser. You should see a JSON response like:

```json
{
  "participants": [
    { "name": "Maria Santos", "gender": "Female", "distance": "21K", "shirtSize": "S", "team": "Runners PH" }
  ],
  "stats": {
    "distances": { "5K": 0, "10K": 0, "21K": 1, "42K": 1 },
    "shirts": { "XS": 0, "S": 1, "M": 0, "L": 1, "XL": 0 }
  }
}
```

---

## Part 2 · Frontend (GitHub Pages)

### Step 1 — Add your API URL to script.js

Open `script.js` and replace the placeholder on line 9:

```js
// BEFORE:
const API_URL = "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec";

// AFTER (your actual URL):
const API_URL = "https://script.google.com/macros/s/AKfycby.../exec";
```

---

### Step 2 — Create a GitHub repository

1. Go to [github.com](https://github.com) and log in.
2. Click **New repository**.
3. Name it (e.g., `marathon-lookup`).
4. Set it to **Public**.
5. Click **Create repository**.

---

### Step 3 — Upload your files

Upload these three files to the root of the repository:
- `index.html`
- `style.css`
- `script.js`

You can drag-and-drop them in the GitHub web UI, or use git:

```bash
git clone https://github.com/YOUR_USERNAME/marathon-lookup.git
cd marathon-lookup
cp /path/to/index.html .
cp /path/to/style.css .
cp /path/to/script.js .
git add .
git commit -m "Initial deploy"
git push origin main
```

---

### Step 4 — Enable GitHub Pages

1. In your repository, go to **Settings → Pages**.
2. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
3. Click **Save**.
4. Wait ~60 seconds. GitHub will show your live URL:
   ```
   https://YOUR_USERNAME.github.io/marathon-lookup/
   ```

---

## Part 3 · CORS Notes

Google Apps Script Web Apps automatically include CORS headers when deployed with **"Anyone"** access, so no additional CORS configuration is needed for the frontend to call the API.

If you see CORS errors in the browser console:
- Make sure the deployment is set to **"Anyone"** (not "Anyone with Google account").
- Make sure you're using the `/exec` URL, not the `/dev` URL (dev requires authentication).

---

## Part 4 · Updating Data

- Add/edit rows in your **Participants** Google Sheet anytime.
- The API caches results for **10 minutes** using Google's CacheService.
- To force an immediate refresh, you can temporarily change `CACHE_TTL` to `1` in `Code.gs` and redeploy, or manually clear the cache via **Apps Script → Run → clearCache** (you can add a helper function).

### Optional cache-clear function (add to Code.gs)

```javascript
function clearCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  Logger.log("Cache cleared.");
}
```

Run this from the Apps Script editor whenever you want instant data refresh.

---

## File Summary

| File        | Purpose                        |
|-------------|--------------------------------|
| `Code.gs`   | Google Apps Script backend API |
| `index.html`| Frontend HTML structure        |
| `style.css` | Styles (dark athletic theme)   |
| `script.js` | Search logic & API integration |

---

## Performance Notes

- All **5,000+ rows** are fetched once on page load and stored in memory.
- Search filtering is **entirely client-side** — zero additional API calls.
- Search uses **300ms debounce** to prevent excess computation while typing.
- Results are **capped at 200 displayed cards** for DOM performance; the user is prompted to refine their search if more matches exist.
- Stats (distance & shirt size breakdowns) are **pre-computed server-side** in the Apps Script response.
