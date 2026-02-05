# Public Attendance -> Google Sheet Sync

This project now supports syncing the **public attendance table format** to Google Sheets in two ways:

1. From TA dashboard (`Consolidated` tab -> `Sync Sheet` button)
2. From terminal (`npm run sync:public-sheet`)

## 1) Required Google Apps Script update

Your current web app endpoint must handle payloads with:

- `type: "public_attendance_snapshot"`
- `headers: string[]`
- `rows: (string|number)[][]`

Paste this into your Google Apps Script project (replace existing `doPost` if needed), then deploy as a web app:

```javascript
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (payload.type === 'public_attendance_snapshot') {
      syncPublicAttendanceSnapshot(ss, payload);
      return jsonResponse({ ok: true, type: 'public_attendance_snapshot' });
    }

    // Keep old behavior for existing attendance syncs if you already use it.
    if (payload.type === 'full_sync') {
      syncLegacyFullSync(ss, payload);
      return jsonResponse({ ok: true, type: 'full_sync' });
    }

    return jsonResponse({ ok: false, error: 'Unknown payload type' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function syncPublicAttendanceSnapshot(ss, payload) {
  const sheetName = 'Public Attendance Snapshot';
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.clearContents();

  // Optional metadata row
  const generatedAt = payload.generated_at || new Date().toISOString();
  const students = payload.metadata && payload.metadata.students ? payload.metadata.students : rows.length;
  const sessions = payload.metadata && payload.metadata.sessions ? payload.metadata.sessions : Math.max(headers.length - 5, 0);
  sheet.getRange(1, 1, 1, 4).setValues([["Generated At", generatedAt, "Students", students]]);
  sheet.getRange(2, 1, 1, 2).setValues([["Sessions", sessions]]);

  if (headers.length > 0) {
    sheet.getRange(4, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(4, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(4);
  }

  if (rows.length > 0 && headers.length > 0) {
    sheet.getRange(5, 1, rows.length, headers.length).setValues(rows);
  }

  sheet.autoResizeColumns(1, Math.max(headers.length, 1));
}

function syncLegacyFullSync(ss, payload) {
  const sheetName = 'Attendance Full Sync';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const data = Array.isArray(payload.data) ? payload.data : [];
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 4).setValues([["Session", payload.session || '', "Synced At", payload.date || '']]);
  sheet.getRange(3, 1, 1, 4).setValues([["Name", "ERP", "Status", "Naming Penalty"]]);

  if (data.length > 0) {
    const rows = data.map((r) => [r.name || '', r.erp || '', r.status || '', r.naming_penalty || 0]);
    sheet.getRange(4, 1, rows.length, 4).setValues(rows);
  }

  sheet.autoResizeColumns(1, 4);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Deploy guidance:

1. In Apps Script: `Deploy` -> `Manage deployments` -> `Edit` (or `New deployment`)
2. Type: `Web app`
3. Execute as: `Me`
4. Who has access: `Anyone`
5. Copy the web app URL

## 2) Configure project env URL (optional but recommended)

Set this in your local `.env` and hosting env:

```bash
VITE_GOOGLE_SCRIPT_URL="https://script.google.com/macros/s/REPLACE/exec"
GOOGLE_SCRIPT_URL="https://script.google.com/macros/s/REPLACE/exec"
```

- `VITE_GOOGLE_SCRIPT_URL` is used by browser UI sync buttons.
- `GOOGLE_SCRIPT_URL` is used by terminal sync script.

## 3) Run sync from terminal

From project root:

```bash
npm run sync:public-sheet
```

Dry run (no upload, payload check only):

```bash
npm run sync:public-sheet -- --dry-run
```

## 4) In-app sync

As TA:

1. Go to dashboard -> `Consolidated`
2. Click `Sync Sheet`

This sends the same table structure currently shown in public attendance view:

- Class, Name, ERP, Penalties, Absences, session columns (`S1`, `S2`, ...)
- Session cell values as `P`, `A`, `E`, `-`
