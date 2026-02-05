# Public Attendance -> Google Sheet Sync (Canonical Tab)

All portal sync paths now write to one canonical sheet tab:

- **`Public Attendance Snapshot`**

No frontend path should write `Attendance Full Sync` anymore.

## 1) Required Google Apps Script `doPost` (single-sheet overwrite)

Use this in your Apps Script web app:

```javascript
function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const type = String(payload.type || '');

    if (type === 'public_attendance_snapshot') {
      syncCanonicalAttendanceSheet(ss, payload);
      return jsonResponse({ ok: true, type: type, sheet: resolveTargetSheet(payload) });
    }

    // Backward compatibility: route old payloads to the same canonical tab.
    if (type === 'full_sync') {
      const legacyRows = Array.isArray(payload.data) ? payload.data : [];
      syncCanonicalAttendanceSheet(ss, {
        target_sheet: resolveTargetSheet(payload),
        generated_at: payload.date || new Date().toISOString(),
        headers: ['Name', 'ERP', 'Status', 'Naming Penalty'],
        rows: legacyRows.map(function (r) {
          return [r.name || '', r.erp || '', r.status || '', r.naming_penalty || 0];
        }),
        metadata: {
          students: legacyRows.length,
          sessions: 1,
          source: 'legacy_full_sync'
        }
      });
      return jsonResponse({ ok: true, type: type, sheet: resolveTargetSheet(payload) });
    }

    return jsonResponse({ ok: false, error: 'Unknown payload type' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function resolveTargetSheet(payload) {
  const requested = String((payload && payload.target_sheet) || '').trim();
  return requested || 'Public Attendance Snapshot';
}

function syncCanonicalAttendanceSheet(ss, payload) {
  const sheetName = resolveTargetSheet(payload);
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.clearContents();

  var generatedAt = payload.generated_at || new Date().toISOString();
  var students = payload.metadata && payload.metadata.students ? payload.metadata.students : rows.length;
  var sessions = payload.metadata && payload.metadata.sessions
    ? payload.metadata.sessions
    : Math.max(headers.length - 5, 0);

  sheet.getRange(1, 1, 1, 4).setValues([['Generated At', generatedAt, 'Students', students]]);
  sheet.getRange(2, 1, 1, 2).setValues([['Sessions', sessions]]);

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

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## 2) Environment variables

Set these in local `.env` and deployment environment:

```bash
VITE_GOOGLE_SCRIPT_URL="https://script.google.com/macros/s/REPLACE/exec"
GOOGLE_SCRIPT_URL="https://script.google.com/macros/s/REPLACE/exec"
```

- `VITE_GOOGLE_SCRIPT_URL`: used by browser sync actions.
- `GOOGLE_SCRIPT_URL`: used by CLI sync script.

## 3) Manual sync commands

```bash
npm run sync:public-sheet
```

Dry run:

```bash
npm run sync:public-sheet -- --dry-run
```

## 4) In-app sync behavior

- `Consolidated -> Sync Sheet` writes canonical payload.
- `Attendance Marking` auto-syncs (debounced) after attendance/penalty updates and supports manual sync button.
- Zoom penalty apply also triggers canonical sheet sync.

All paths target `Public Attendance Snapshot`.
