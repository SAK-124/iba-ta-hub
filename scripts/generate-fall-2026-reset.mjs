import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const rosterDir = path.resolve(
  process.env.FALL_2026_ROSTER_DIR ?? path.join(repoRoot, 'Enrolled Students List - UMS'),
);
const templatePath = path.join(repoRoot, 'supabase', 'manual', 'fall-2026-semester-reset.template.sql');
const outputPath = path.resolve(
  process.env.FALL_2026_RESET_OUTPUT ??
    path.join(repoRoot, 'supabase', 'manual', 'generated', 'fall-2026-semester-reset.sql'),
);
const valuesToken = '__FALL_2026_ROSTER_VALUES__';
const expectedCounts = new Map([
  ['101809', 46],
  ['101810', 46],
  ['101811', 44],
]);

const usage = () => {
  console.log('Usage: node scripts/generate-fall-2026-reset.mjs');
  console.log('Reads ignored Enrolled Students List - UMS/*.xlsx, validates the roster,');
  console.log('and writes ignored supabase/manual/generated/fall-2026-semester-reset.sql.');
  console.log('Optional env vars: FALL_2026_ROSTER_DIR, FALL_2026_RESET_OUTPUT.');
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

const cellText = (value) => (value == null ? '' : String(value).trim());
const normalizeName = (value) => {
  const compact = cellText(value).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  return compact
    .split(/([\s-]+)/)
    .map((token) => {
      if (/^[\s-]+$/.test(token)) return token;
      if (/^n\/a$/i.test(token)) return 'N/a';

      let firstLetter = true;
      return token.replace(/[A-Za-z]/g, (letter) => {
        if (firstLetter) {
          firstLetter = false;
          return letter.toUpperCase();
        }
        return letter.toLowerCase();
      });
    })
    .join('');
};
const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;

if (!fs.existsSync(rosterDir)) {
  throw new Error(`Roster directory not found: ${rosterDir}`);
}

const workbookFiles = fs
  .readdirSync(rosterDir)
  .filter((file) => file.toLowerCase().endsWith('.xlsx'))
  .sort()
  .map((file) => path.join(rosterDir, file));

if (workbookFiles.length !== 3) {
  throw new Error(`Expected exactly 3 .xlsx roster files; found ${workbookFiles.length}`);
}

const rows = [];
for (const workbookPath of workbookFiles) {
  const workbook = XLSX.readFile(workbookPath, { cellDates: false, raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`Workbook has no worksheets: ${workbookPath}`);

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  if (rawRows.length === 0) throw new Error(`Workbook is empty: ${workbookPath}`);

  const header = rawRows[0].map((value) => cellText(value).toLowerCase());
  const indexes = Object.fromEntries(
    ['erp id', 'class no', 'student name'].map((required) => [required, header.indexOf(required)]),
  );
  const missingHeaders = Object.entries(indexes)
    .filter(([, index]) => index < 0)
    .map(([name]) => name);
  if (missingHeaders.length > 0) {
    throw new Error(`${path.basename(workbookPath)} missing headers: ${missingHeaders.join(', ')}`);
  }

  for (const rawRow of rawRows.slice(1)) {
    if (!rawRow.some((value) => value != null && cellText(value) !== '')) continue;

    const erp = cellText(rawRow[indexes['erp id']]);
    const classNo = cellText(rawRow[indexes['class no']]);
    const studentName = normalizeName(rawRow[indexes['student name']]);
    if (!/^\d{5}$/.test(erp)) throw new Error(`Invalid ERP in ${path.basename(workbookPath)}: ${erp}`);
    if (!expectedCounts.has(classNo)) throw new Error(`Unexpected class ${classNo} for ERP ${erp}`);
    if (!studentName) throw new Error(`Blank student name for ERP ${erp}`);
    rows.push({ erp, studentName, classNo });
  }
}

const erps = new Set(rows.map((row) => row.erp));
if (erps.size !== rows.length) throw new Error('Roster validation failed: duplicate ERP values');
if (rows.length !== 136) throw new Error(`Roster validation failed: expected 136 rows, found ${rows.length}`);
for (const [classNo, expected] of expectedCounts) {
  const actual = rows.filter((row) => row.classNo === classNo).length;
  if (actual !== expected) throw new Error(`Roster validation failed for ${classNo}: expected ${expected}, found ${actual}`);
}

const template = fs.readFileSync(templatePath, 'utf8');
if (template.split(valuesToken).length - 1 !== 1) {
  throw new Error(`Template must contain exactly one ${valuesToken} token`);
}
const doOpeners = (template.match(/^DO \$\$$/gm) ?? []).length;
const doClosers = (template.match(/^\$\$;$/gm) ?? []).length;
if (/^DO \$\s*$/m.test(template) || doOpeners !== 4 || doClosers !== 4 || doOpeners !== doClosers) {
  throw new Error(`Template validation failed: expected four balanced DO $$ blocks; found openers=${doOpeners}, closers=${doClosers}`);
}

const valuesSql = rows
  .map((row) => `  (${sqlLiteral(row.erp)}, ${sqlLiteral(row.studentName)}, ${sqlLiteral(row.classNo)})`)
  .join(',\n');
const generatedSql = template.replace(valuesToken, `${valuesSql};`);
const generatedOpeners = (generatedSql.match(/^DO \$\$$/gm) ?? []).length;
const generatedClosers = (generatedSql.match(/^\$\$;$/gm) ?? []).length;
if (/^DO \$\s*$/m.test(generatedSql) || generatedOpeners !== 4 || generatedClosers !== 4) {
  throw new Error(`Generated SQL validation failed: expected four balanced DO $$ blocks; found openers=${generatedOpeners}, closers=${generatedClosers}`);
}

// Re-parse generated tuple literals to verify SQL escaping and the final payload.
const tuplePattern = /^  \('([0-9]{5})', '((?:''|[^'])*)', '(101809|101810|101811)'\)(?:,|;)$/gm;
const generatedRows = [...generatedSql.matchAll(tuplePattern)].map((match) => ({
  erp: match[1],
  studentName: match[2].replaceAll("''", "'"),
  classNo: match[3],
}));
if (generatedRows.length !== rows.length || generatedRows.some((row, index) => JSON.stringify(row) !== JSON.stringify(rows[index]))) {
  throw new Error('Generated SQL validation failed: tuple payload or apostrophe escaping differs from workbook data');
}
if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/.test(generatedSql)) {
  throw new Error('Generated SQL validation failed: email literal detected');
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, generatedSql, 'utf8');

console.log(`Validated ${rows.length} unique ERPs (101809=${expectedCounts.get('101809')}, 101810=${expectedCounts.get('101810')}, 101811=${expectedCounts.get('101811')}).`);
console.log(`Generated ${path.relative(repoRoot, outputPath)} (ignored; do not commit).`);
