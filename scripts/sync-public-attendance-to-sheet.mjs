#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzTnif0SQm3IoIRRUNsXCJvU65qNiIas_agm-sn7d5vypd51bis5KQbnPL1A0cAOc-f-Q/exec';
const PUBLIC_ATTENDANCE_SHEET_NAME = 'Public Attendance Snapshot';

function loadDotEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['\"]|['\"]$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function buildRows(data) {
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const students = Array.isArray(data.students) ? data.students : [];

  const headers = [
    'Class',
    'Name',
    'ERP',
    'Penalties',
    'Absences',
    ...sessions.map((session) => `S${session.session_number}`),
  ];

  const rows = students.map((student) => [
    student.class_no,
    student.student_name,
    student.erp,
    Number(student.total_penalties || 0),
    Number(student.total_absences || 0),
    ...sessions.map((session) => {
      const status = student.session_status?.[session.id];
      if (status === 'present') return 'P';
      if (status === 'absent') return 'A';
      if (status === 'excused') return 'E';
      return '-';
    }),
  ]);

  return { headers, rows, sessions, students };
}

async function fetchPublicAttendance(supabaseUrl, supabaseKey) {
  const rpcUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/get_public_attendance_board`;

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: '{}',
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Supabase RPC failed (${response.status}): ${bodyText}`);
  }

  return response.json();
}

async function sendToGoogleSheet(googleScriptUrl, payload) {
  const response = await fetch(googleScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Google Script failed (${response.status}): ${bodyText}`);
  }
}

async function main() {
  loadDotEnvFile();

  const dryRun = process.argv.includes('--dry-run');
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const googleScriptUrl =
    process.env.GOOGLE_SCRIPT_URL || process.env.VITE_GOOGLE_SCRIPT_URL || DEFAULT_GOOGLE_SCRIPT_URL;

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL in environment.');
  }

  if (!supabaseKey) {
    throw new Error('Missing SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY in environment.');
  }

  const data = await fetchPublicAttendance(supabaseUrl, supabaseKey);
  const { headers, rows, sessions, students } = buildRows(data);

  const payload = {
    type: 'public_attendance_snapshot',
    target_sheet: PUBLIC_ATTENDANCE_SHEET_NAME,
    generated_at: new Date().toISOString(),
    headers,
    rows,
    metadata: {
      students: students.length,
      sessions: sessions.length,
      source: 'cli_sync',
    },
  };

  if (dryRun) {
    console.log('[dry-run] payload prepared');
    console.log(`students=${students.length}, sessions=${sessions.length}, headers=${headers.length}`);
    if (rows.length > 0) {
      console.log('[dry-run] first row sample:', rows[0]);
    }
    return;
  }

  await sendToGoogleSheet(googleScriptUrl, payload);
  console.log(
    `Synced ${students.length} students across ${sessions.length} sessions to Google Sheet via Apps Script.`
  );
}

main().catch((error) => {
  console.error('Sync failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
