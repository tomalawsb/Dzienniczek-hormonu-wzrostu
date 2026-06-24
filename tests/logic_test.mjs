import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = new URL('../', import.meta.url);
const appPath = new URL('../app.js', import.meta.url);
let source = await readFile(appPath, 'utf8');

const hook = `
  globalThis.__GH_TEST__ = {
    parseVoiceEntry,
    keepOneEntryPerDate,
    sanitizeEntry,
    setDraft: (draft) => { quickDraft = draft; },
    applyVoiceEntryToDraft,
    getDraft: () => ({ ...quickDraft }),
    createDefaultDraft,
    createDocxBlob,
    getAmpouleInfo,
    buildAmpouleTimeline,
    buildReportBody,
    ampouleNotificationText,
    localDateISO,
    setEntries: (entries) => { data.entries = entries; },
    setSettings: (settings) => { data.settings = sanitizeSettings({ ...data.settings, ...settings }); }
  };
`;
const end = source.lastIndexOf('})();');
if (end < 0) throw new Error('Nie znaleziono końca app.js.');
source = `${source.slice(0, end)}${hook}})();\n`;

const tempPath = join(tmpdir(), `dzienniczek-logic-${Date.now()}.mjs`);
await writeFile(tempPath, source, 'utf8');

globalThis.localStorage = { getItem() { return null; }, setItem() {} };
globalThis.document = { addEventListener() {} };
globalThis.window = {};

try {
  await import(`file://${tempPath}`);
  const t = globalThis.__GH_TEST__;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const placeOnly = t.parseVoiceEntry('lewy brzuch');
  assert(!Object.hasOwn(placeOnly, 'date'), 'Polecenie bez daty nie może nadpisywać daty szkicu.');
  assert(placeOnly.side === 'lewa' && placeOnly.site === 'brzuch', 'Nie rozpoznano miejsca wkłucia.');

  t.setDraft(t.createDefaultDraft({ date: '2026-06-14', time: '20:00' }));
  t.applyVoiceEntryToDraft(placeOnly);
  assert(t.getDraft().date === '2026-06-14', 'Drugie polecenie głosowe nadpisało wcześniej wybraną datę.');

  const entry = (id, updatedAt) => ({
    id,
    date: '2026-06-15',
    time: '21:00',
    dose: '1,1',
    unit: 'mg',
    side: 'lewa',
    site: 'brzuch',
    status: 'given',
    note: '',
    createdAt: '2026-06-15T19:00:00.000Z',
    updatedAt
  });
  const unique = t.keepOneEntryPerDate([
    entry('entry-old', '2026-06-15T20:00:00.000Z'),
    entry('entry-new', '2026-06-15T21:00:00.000Z')
  ]);
  assert(unique.entries.length === 1, 'Nie zablokowano wielu wpisów dla jednego dnia.');
  assert(unique.entries[0].id === 'entry-new', 'Nie zachowano najnowszego wpisu podczas migracji duplikatów.');
  assert(unique.removedDuplicates === 1, 'Nie zliczono usuniętego duplikatu.');

  assert(t.sanitizeEntry({ ...entry('<script>', ''), id: '<script>' }) === null, 'Niebezpieczny identyfikator wpisu nie został odrzucony.');

  const today = new Date();
  const dateShift = (days) => {
    const date = new Date(today);
    date.setDate(today.getDate() + days);
    return t.localDateISO(date);
  };
  const ampouleEntries = [];
  for (let index = 9; index >= 1; index -= 1) {
    ampouleEntries.push({
      ...entry(`ampoule-${index}`, `2026-06-15T2${index % 4}:00:00.000Z`),
      date: dateShift(-index),
      unit: 'ml',
      dose: '1,0'
    });
  }
  t.setSettings({ defaultDose: '1,0', unit: 'ml', ampouleStartDate: dateShift(-9), ampouleVolumeMl: '10', ampouleDoseMl: '' });
  t.setEntries(ampouleEntries);
  const ampoule = t.getAmpouleInfo();
  assert(ampoule.configured === true, 'Licznik ampułki nie został skonfigurowany.');
  assert(ampoule.todayIsLast === true, 'Nie wykryto ostatniego zastrzyku z ampułki.');
  assert(t.ampouleNotificationText(ampoule).includes('ostatni zastrzyk'), 'Powiadomienie nie zawiera ostrzeżenia o końcu ampułki.');



  const todaySkipped = {
    ...entry('ampoule-skipped-today', '2026-06-15T22:00:00.000Z'),
    date: t.localDateISO(),
    status: 'skipped',
    dose: '',
    unit: '',
    side: '',
    site: ''
  };
  t.setSettings({ defaultDose: '1,0', unit: 'ml', ampouleStartDate: dateShift(-1), ampouleStartNumber: 13, ampouleVolumeMl: '2', ampouleDoseMl: '' });
  t.setEntries([
    { ...entry('ampoule-yesterday', '2026-06-15T21:00:00.000Z'), date: dateShift(-1), unit: 'ml', dose: '1,0' },
    todaySkipped
  ]);
  const skippedAmpoule = t.getAmpouleInfo();
  assert(skippedAmpoule.todayEntryStatus === 'skipped', 'Nie wykryto pominiętej dawki dzisiaj.');
  assert(skippedAmpoule.todayDoseMl === 0, 'Pominięta dawka błędnie zużyła ampułkę.');
  assert(skippedAmpoule.remainingAfterToday === 1, 'Stan ampułki zmienił się po pominiętej dawce.');

  t.setSettings({ defaultDose: '1,0', unit: 'ml', ampouleStartDate: dateShift(-2), ampouleStartNumber: 13, ampouleVolumeMl: '2', ampouleDoseMl: '' });
  t.setEntries([
    { ...entry('ampoule-start-a', '2026-06-15T21:00:00.000Z'), date: dateShift(-2), unit: 'ml', dose: '1,0' },
    { ...entry('ampoule-start-b', '2026-06-15T21:00:00.000Z'), date: dateShift(-1), unit: 'ml', dose: '1,0' }
  ]);
  const autoStartAmpoule = t.getAmpouleInfo();
  assert(autoStartAmpoule.todayStartsNewAmpoule === true, 'Nowa ampułka nie zaczęła się automatycznie przy kolejnym podaniu.');
  assert(autoStartAmpoule.ampouleNumber === 14, 'Numer nowej ampułki nie zwiększył się automatycznie.');

  t.setEntries([
    { ...entry('report-newer', '2026-06-16T21:00:00.000Z'), date: '2026-06-16' },
    { ...entry('report-older', '2026-06-14T21:00:00.000Z'), date: '2026-06-14' }
  ]);
  const report = t.buildReportBody();
  assert(report.indexOf('14.06.2026') < report.indexOf('16.06.2026'), 'Raport nie sortuje wpisów od najstarszych do najnowszych.');
  assert(report.includes('Start ampułki'), 'Raport nie zawiera kolumny startu ampułki.');

  t.setEntries([entry('entry-docx', '2026-06-15T21:00:00.000Z')]);
  const docx = new Uint8Array(await t.createDocxBlob().arrayBuffer());
  assert(docx[0] === 0x50 && docx[1] === 0x4b, 'Eksport DOCX nie tworzy prawidłowego kontenera ZIP.');

  console.log('Testy logiki: OK');
} finally {
  delete globalThis.__GH_TEST__;
  await unlink(tempPath).catch(() => {});
}
