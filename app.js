(() => {
  'use strict';

  const STORAGE_KEY = 'dzienniczek-hormonu-wzrostu-v1';
  const BACKUP_STORAGE_KEY = 'dzienniczek-hormonu-wzrostu-v1-backup';
  const MAX_NOTE_LENGTH = 1000;
  const ALLOWED_UNITS = new Set(['mg', 'ml', 'IU', 'j.m.']);
  const ALLOWED_SIDES = new Set(['lewa', 'prawa']);
  const ALLOWED_SITES = new Set(['brzuch', 'udo', 'ramię', 'pośladek', 'łopatka']);
  const ALLOWED_STATUSES = new Set(['given', 'skipped']);
  const DEFAULT_AMPOULE_VOLUME_ML = '10';
  const startupWarnings = [];
  const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  const MONTHS_NORMALIZED = {
    stycznia: 0, styczen: 0,
    lutego: 1, luty: 1,
    marca: 2, marzec: 2,
    kwietnia: 3, kwiecien: 3,
    maja: 4, maj: 4,
    czerwca: 5, czerwiec: 5,
    lipca: 6, lipiec: 6,
    sierpnia: 7, sierpien: 7,
    wrzesnia: 8, wrzesien: 8,
    pazdziernika: 9, pazdziernik: 9,
    listopada: 10, listopad: 10,
    grudnia: 11, grudzien: 11
  };

  const SITE_LABELS = {
    brzuch: 'brzuch',
    udo: 'udo',
    'ramię': 'ramię',
    'pośladek': 'pośladek',
    'łopatka': 'łopatka'
  };

  const ROTATION = [
    ['lewa', 'brzuch'], ['prawa', 'brzuch'],
    ['lewa', 'udo'], ['prawa', 'udo'],
    ['lewa', 'pośladek'], ['prawa', 'pośladek'],
    ['lewa', 'ramię'], ['prawa', 'ramię'],
    ['lewa', 'łopatka'], ['prawa', 'łopatka']
  ];

  const defaultData = {
    version: 5,
    settings: {
      defaultDose: '1,0',
      unit: 'mg',
      defaultTime: '20:00',
      voiceFeedback: false,
      voiceConfirm: true,
      reminderEnabled: true,
      reminderTime: '21:00',
      ampouleStartDate: '',
      ampouleStartNumber: 1,
      ampouleVolumeMl: DEFAULT_AMPOULE_VOLUME_ML,
      ampouleDoseMl: ''
    },
    meta: {
      onboardingCompleted: false,
      lastReminderDate: ''
    },
    entries: []
  };

  let data = loadData();
  let lastKnownLocalDate = localDateISO();
  let activeView = 'today';
  let selectedCalendarDate = localDateISO();
  let calendarCursor = startOfMonth(new Date());
  let deferredInstallPrompt = null;
  let recognition = null;
  let isListening = false;
  let lastRecognizedText = '';
  let quickDraft = createInitialQuickDraft();
  let quickDraftTouched = false;
  let midnightTimer = null;
  let reminderTimer = null;
  let serviceWorkerRegistration = null;

  const el = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    bindEvents();
    configureSpeechRecognition();
    updateCurrentDateHeader();
    loadVersion();
    renderAll();
    switchView(viewFromHash(), { updateHash: false, focus: false, smooth: false });
    await registerServiceWorker();
    updateOnlineInstallState();
    await updatePermissionStatuses();
    scheduleDailyReminder();
    scheduleMidnightRefresh();
    checkReminderDue();
    maybeShowFirstRunPermissions();
    flushStartupWarnings();
  }

  function cacheElements() {
    const ids = [
      'current-date-label', 'today-entry-date', 'today-dose', 'today-time', 'today-status-heading', 'today-status-badge',
      'main-action-heading', 'main-action-text', 'recommended-save-button', 'recommended-manual-button',
      'ampoule-start-main-button', 'ampoule-alert', 'ampoule-alert-title', 'ampoule-alert-text',
      'voice-button', 'voice-result', 'voice-result-text', 'selected-place', 'save-button',
      'skip-button', 'last-place', 'suggested-place', 'ampoule-status', 'use-suggestion-button', 'mini-calendar', 'recent-list',
      'quick-add-button', 'date-chip', 'dose-chip', 'time-chip', 'place-field', 'entry-dialog', 'entry-form',
      'entry-dialog-title', 'entry-id', 'entry-date', 'entry-time', 'entry-dose', 'entry-unit', 'entry-side',
      'entry-site', 'entry-status', 'entry-note', 'delete-entry-button', 'dialog-close-button',
      'dialog-cancel-button', 'toast-region', 'live-region', 'calendar-prev', 'calendar-next',
      'calendar-month-label', 'calendar-grid', 'selected-day-label', 'selected-day-entries',
      'add-for-selected-day', 'history-search', 'status-filter', 'site-filter', 'history-table-body',
      'history-empty', 'settings-dose', 'settings-unit', 'settings-time', 'ampoule-start-date',
      'ampoule-start-number', 'ampoule-volume', 'ampoule-dose-ml', 'ampoule-start-today-button', 'voice-feedback-toggle',
      'voice-confirm-toggle', 'save-settings-button', 'reminder-enabled-toggle', 'reminder-time',
      'save-reminder-button', 'notification-permission-status', 'request-notification-button',
      'test-notification-button', 'export-pdf-button', 'export-word-button', 'export-json-button',
      'export-csv-button', 'import-button', 'import-file', 'clear-data-button', 'header-install-button',
      'desktop-install-button', 'settings-install-button', 'version-label', 'permissions-dialog',
      'permission-microphone-button', 'permission-notification-button', 'permission-storage-button',
      'permission-microphone-status', 'permission-notification-status', 'permission-storage-status',
      'permissions-finish-button', 'microphone-permission-settings', 'notification-permission-settings',
      'storage-permission-settings', 'open-permissions-button'
    ];
    ids.forEach((id) => { el[id] = document.getElementById(id); });
  }

  function bindEvents() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => switchView(button.dataset.view));
    });

    document.querySelectorAll('[data-go-home]').forEach((button) => {
      button.addEventListener('click', () => switchView('today'));
    });

    document.querySelectorAll('[data-open-entry]').forEach((button) => {
      button.addEventListener('click', () => openEntryForDate(localDateISO()));
    });

    el['quick-add-button'].addEventListener('click', () => openEntryForDate(localDateISO()));
    el['date-chip'].addEventListener('click', () => openEntryDialog(quickDraft.id || null, quickDraft, 'entry-date'));
    el['place-field'].addEventListener('click', () => openEntryDialog(quickDraft.id || null, quickDraft));
    el['dose-chip'].addEventListener('click', () => openEntryDialog(quickDraft.id || null, quickDraft, 'entry-dose'));
    el['time-chip'].addEventListener('click', () => openEntryDialog(quickDraft.id || null, quickDraft, 'entry-time'));
    el['recommended-save-button'].addEventListener('click', saveRecommendedDraft);
    el['recommended-manual-button'].addEventListener('click', openAmpouleSettings);
    el['ampoule-start-main-button'].addEventListener('click', setAmpouleStartToday);
    el['voice-button'].addEventListener('click', toggleVoiceRecognition);
    el['save-button'].addEventListener('click', saveQuickDraft);
    el['skip-button'].addEventListener('click', prepareSkippedDraft);
    el['use-suggestion-button'].addEventListener('click', useSuggestedPlace);

    el['entry-form'].addEventListener('submit', handleEntrySubmit);
    el['dialog-close-button'].addEventListener('click', closeEntryDialog);
    el['dialog-cancel-button'].addEventListener('click', closeEntryDialog);
    el['delete-entry-button'].addEventListener('click', deleteEntryFromDialog);
    el['entry-status'].addEventListener('change', updateEntryRequirements);
    el['entry-dialog'].addEventListener('click', (event) => {
      if (event.target === el['entry-dialog']) closeEntryDialog();
    });

    el['calendar-prev'].addEventListener('click', () => changeCalendarMonth(-1));
    el['calendar-next'].addEventListener('click', () => changeCalendarMonth(1));
    el['add-for-selected-day'].addEventListener('click', openOrEditSelectedDay);
    el['calendar-grid'].addEventListener('keydown', handleCalendarKeydown);

    [el['history-search'], el['status-filter'], el['site-filter']].forEach((control) => {
      control.addEventListener('input', renderHistory);
      control.addEventListener('change', renderHistory);
    });
    el['history-table-body'].addEventListener('click', handleHistoryAction);
    el['selected-day-entries'].addEventListener('click', handleDayDetailsAction);

    el['save-settings-button'].addEventListener('click', saveSettings);
    el['ampoule-start-today-button'].addEventListener('click', setAmpouleStartToday);
    el['save-reminder-button'].addEventListener('click', saveReminderSettings);
    el['request-notification-button'].addEventListener('click', requestNotificationPermission);
    el['test-notification-button'].addEventListener('click', testReminderNotification);
    el['export-pdf-button'].addEventListener('click', exportPdf);
    el['export-word-button'].addEventListener('click', exportWord);
    el['export-json-button'].addEventListener('click', exportJson);
    el['export-csv-button'].addEventListener('click', exportCsv);
    el['import-button'].addEventListener('click', () => el['import-file'].click());
    el['import-file'].addEventListener('change', importJson);
    el['clear-data-button'].addEventListener('click', clearAllEntries);

    el['permission-microphone-button'].addEventListener('click', requestMicrophonePermission);
    el['permission-notification-button'].addEventListener('click', requestNotificationPermission);
    el['permission-storage-button'].addEventListener('click', requestPersistentStorage);
    el['permissions-finish-button'].addEventListener('click', finishPermissionsOnboarding);
    el['open-permissions-button'].addEventListener('click', openPermissionsDialog);
    el['permissions-dialog'].addEventListener('cancel', (event) => {
      if (!data.meta.onboardingCompleted) event.preventDefault();
    });

    [el['header-install-button'], el['desktop-install-button'], el['settings-install-button']].forEach((button) => {
      button.addEventListener('click', installPwa);
    });

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateOnlineInstallState();
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      updateOnlineInstallState();
      showToast('Aplikacja została zainstalowana.', 'success');
    });

    document.addEventListener('keydown', handleGlobalKeyboard);
    window.addEventListener('focus', handleAppResume);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleAppResume();
    });
    window.addEventListener('hashchange', () => switchView(viewFromHash(), { updateHash: false, focus: false, smooth: false }));
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        data = loadData();
        resetQuickDraftForToday();
        renderAll();
        showToast('Dane odświeżono z innej karty.', 'success');
      }
    });
  }

  function loadData() {
    const primaryRaw = safeStorageGet(STORAGE_KEY);
    const backupRaw = safeStorageGet(BACKUP_STORAGE_KEY);

    for (const [raw, source] of [[primaryRaw, 'głównej pamięci'], [backupRaw, 'kopii zapasowej']]) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const result = normalizeStoredData(parsed);
        if (source === 'kopii zapasowej') {
          startupWarnings.push('Odzyskano dane z lokalnej kopii zapasowej, ponieważ główny zapis był niedostępny lub uszkodzony.');
        }
        if (result.removedDuplicates > 0) {
          safeStorageSet(BACKUP_STORAGE_KEY, raw);
          startupWarnings.push(`Wykryto ${result.removedDuplicates} zduplikowanych wpisów. Zachowano po jednym, najnowszym wpisie dla każdego dnia.`);
        }
        return result.data;
      } catch (error) {
        console.error(`Nie udało się odczytać danych z ${source}:`, error);
      }
    }

    if (primaryRaw || backupRaw) startupWarnings.push('Nie udało się odczytać zapisanej historii. Uruchomiono pusty dzienniczek.');
    return structuredCloneSafe(defaultData);
  }

  function normalizeStoredData(parsed) {
    const entriesInput = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const sanitized = entriesInput.map(sanitizeEntry).filter(Boolean);
    const { entries, removedDuplicates } = keepOneEntryPerDate(sanitized);
    return {
      removedDuplicates,
      data: {
        version: 5,
        settings: sanitizeSettings(parsed?.settings),
        meta: sanitizeMeta(parsed?.meta),
        entries
      }
    };
  }

  function sanitizeSettings(settings = {}) {
    const dose = normalizeDose(settings.defaultDose) || defaultData.settings.defaultDose;
    return {
      defaultDose: dose,
      unit: ALLOWED_UNITS.has(settings.unit) ? settings.unit : defaultData.settings.unit,
      defaultTime: isValidTime(settings.defaultTime) ? settings.defaultTime : defaultData.settings.defaultTime,
      voiceFeedback: typeof settings.voiceFeedback === 'boolean' ? settings.voiceFeedback : defaultData.settings.voiceFeedback,
      voiceConfirm: typeof settings.voiceConfirm === 'boolean' ? settings.voiceConfirm : defaultData.settings.voiceConfirm,
      reminderEnabled: typeof settings.reminderEnabled === 'boolean' ? settings.reminderEnabled : defaultData.settings.reminderEnabled,
      reminderTime: isValidTime(settings.reminderTime) ? settings.reminderTime : defaultData.settings.reminderTime,
      ampouleStartDate: isValidIsoDate(settings.ampouleStartDate) ? settings.ampouleStartDate : defaultData.settings.ampouleStartDate,
      ampouleStartNumber: normalizeAmpouleNumber(settings.ampouleStartNumber),
      ampouleVolumeMl: normalizePositiveDecimal(settings.ampouleVolumeMl) || defaultData.settings.ampouleVolumeMl,
      ampouleDoseMl: normalizeOptionalPositiveDecimal(settings.ampouleDoseMl)
    };
  }

  function sanitizeMeta(meta = {}) {
    return {
      onboardingCompleted: Boolean(meta.onboardingCompleted),
      lastReminderDate: isValidIsoDate(meta.lastReminderDate) ? meta.lastReminderDate : ''
    };
  }

  function sanitizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const id = typeof entry.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(entry.id) ? entry.id : '';
    const date = isValidIsoDate(entry.date) ? entry.date : '';
    const time = isValidTime(entry.time) ? entry.time : '';
    const status = ALLOWED_STATUSES.has(entry.status) ? entry.status : '';
    if (!id || !date || !time || !status) return null;

    const base = {
      id,
      date,
      time,
      status,
      note: typeof entry.note === 'string' ? entry.note.trim().slice(0, MAX_NOTE_LENGTH) : '',
      createdAt: isValidDateTime(entry.createdAt) ? entry.createdAt : new Date(`${date}T${time}:00`).toISOString(),
      updatedAt: isValidDateTime(entry.updatedAt) ? entry.updatedAt : ''
    };

    if (status === 'skipped') {
      return { ...base, dose: '', unit: '', side: '', site: '' };
    }

    const dose = normalizeDose(entry.dose);
    const unit = ALLOWED_UNITS.has(entry.unit) ? entry.unit : '';
    const side = ALLOWED_SIDES.has(entry.side) ? entry.side : '';
    const site = ALLOWED_SITES.has(entry.site) ? entry.site : '';
    if (!dose || !unit || !side || !site) return null;
    return { ...base, dose, unit, side, site };
  }

  function keepOneEntryPerDate(entries) {
    const sorted = [...entries].sort((a, b) => entryFreshnessKey(b).localeCompare(entryFreshnessKey(a)));
    const seenDates = new Set();
    const unique = [];
    let removedDuplicates = 0;
    sorted.forEach((entry) => {
      if (seenDates.has(entry.date)) {
        removedDuplicates += 1;
        return;
      }
      seenDates.add(entry.date);
      unique.push(entry);
    });
    return { entries: unique, removedDuplicates };
  }

  function entryFreshnessKey(entry) {
    return entry.updatedAt || entry.createdAt || `${entry.date}T${entry.time}:00`;
  }

  function persistData({ notifyError = true } = {}) {
    try {
      const previous = localStorage.getItem(STORAGE_KEY);
      if (previous) localStorage.setItem(BACKUP_STORAGE_KEY, previous);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      window.queueMicrotask(() => {
        scheduleDailyReminder();
        syncReminderStateWithServiceWorker();
      });
      return true;
    } catch (error) {
      console.error('Nie udało się zapisać danych:', error);
      if (notifyError && el['toast-region']) showToast('Nie udało się zapisać danych w pamięci urządzenia. Wykonaj eksport kopii JSON.', 'error');
      else startupWarnings.push('Nie udało się zapisać danych w pamięci urządzenia.');
      return false;
    }
  }

  function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }

  function structuredCloneSafe(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function isValidEntry(entry) {
    return Boolean(sanitizeEntry(entry));
  }

  function isValidIsoDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return Boolean(match && isValidDateParts(Number(match[1]), Number(match[2]), Number(match[3])));
  }

  function isValidTime(value) {
    const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return Boolean(match);
  }

  function isValidDateTime(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }

  function createDefaultDraft(overrides = {}) {
    const now = new Date();
    return {
      id: '',
      date: localDateISO(now),
      time: localTime(now),
      dose: data.settings.defaultDose,
      unit: data.settings.unit,
      side: '',
      site: '',
      status: 'given',
      note: '',
      ...overrides
    };
  }

  function createInitialQuickDraft() {
    const todayEntry = getEntryForDate(localDateISO());
    return todayEntry ? { ...todayEntry } : createDefaultDraft();
  }

  function resetQuickDraftForToday() {
    quickDraft = createInitialQuickDraft();
    quickDraftTouched = false;
    lastRecognizedText = '';
  }

  function getEntryForDate(date, excludeId = '') {
    return data.entries.find((entry) => entry.date === date && entry.id !== excludeId) || null;
  }

  function flushStartupWarnings() {
    if (!startupWarnings.length) return;
    const message = startupWarnings.join(' ');
    startupWarnings.length = 0;
    showToast(message, 'error', 9000);
  }

  function handleAppResume() {
    refreshDayState();
    checkReminderDue();
  }

  function refreshDayState() {
    updateCurrentDateHeader();
    const currentDate = localDateISO();
    if (currentDate === lastKnownLocalDate) return;

    const previousDate = lastKnownLocalDate;
    lastKnownLocalDate = currentDate;
    if (!quickDraftTouched && (!quickDraft.id || quickDraft.date === previousDate)) {
      resetQuickDraftForToday();
    } else if (quickDraft.date === previousDate) {
      showToast('Zmienił się dzień. Sprawdź datę przygotowanego wpisu przed zapisaniem.', 'error', 7000);
    }
    if (activeView === 'today') {
      selectedCalendarDate = currentDate;
      calendarCursor = startOfMonth(new Date());
    }
    renderAll();
    scheduleDailyReminder();
    syncReminderStateWithServiceWorker();
    scheduleMidnightRefresh();
  }

  function scheduleMidnightRefresh() {
    if (midnightTimer) window.clearTimeout(midnightTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
    midnightTimer = window.setTimeout(() => refreshDayState(), Math.max(1000, next.getTime() - now.getTime()));
  }

  function renderAll() {
    renderToday();
    renderMiniCalendar();
    renderRecent();
    renderCalendar();
    renderSelectedDay();
    renderHistory();
    renderSettings();
    updateNavigation();
  }

  function updateCurrentDateHeader() {
    el['current-date-label'].textContent = capitalize(new Intl.DateTimeFormat('pl-PL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date()));
  }

  function renderToday() {
    const today = localDateISO();
    const todayEntry = getEntryForDate(today);
    const editingExisting = Boolean(quickDraft.id && data.entries.some((entry) => entry.id === quickDraft.id));

    el['today-entry-date'].textContent = quickDraft.date === today ? 'Dzisiaj' : formatDateShort(quickDraft.date);
    el['today-dose'].textContent = quickDraft.status === 'skipped'
      ? '—'
      : `${formatDose(quickDraft.dose)} ${quickDraft.unit}`;
    el['today-time'].textContent = quickDraft.time;
    el['selected-place'].textContent = quickDraft.status === 'skipped'
      ? 'Dawka pominięta'
      : (quickDraft.side && quickDraft.site ? formatPlace(quickDraft.side, quickDraft.site) : 'Nie wybrano');

    const ready = quickDraft.status === 'skipped' || Boolean(quickDraft.side && quickDraft.site && normalizeDose(quickDraft.dose));
    el['save-button'].disabled = !ready;
    el['save-button'].innerHTML = editingExisting
      ? '<span aria-hidden="true">✓</span> Zapisz zmiany'
      : '<span aria-hidden="true">✓</span> Zapisz';

    if (todayEntry) {
      el['today-status-badge'].className = `status-badge status-badge--${todayEntry.status}`;
      el['today-status-badge'].textContent = todayEntry.status === 'given' ? 'Podano' : 'Pominięto';
      el['today-status-heading'].textContent = todayEntry.status === 'given'
        ? `Zapisano o ${todayEntry.time}`
        : 'Dawka oznaczona jako pominięta';
    } else {
      el['today-status-badge'].className = 'status-badge status-badge--neutral';
      el['today-status-badge'].textContent = 'Brak wpisu';
      el['today-status-heading'].textContent = ready ? 'Sprawdź i zapisz' : 'Uzupełnij wpis';
    }

    if (lastRecognizedText) {
      el['voice-result'].classList.remove('is-hidden');
      el['voice-result-text'].textContent = lastRecognizedText;
    } else {
      el['voice-result'].classList.add('is-hidden');
      el['voice-result-text'].textContent = '';
    }

    const latestGiven = getLatestGivenBefore(new Date());
    el['last-place'].textContent = latestGiven
      ? `${formatPlace(latestGiven.side, latestGiven.site)} · ${formatDateShort(latestGiven.date)}`
      : 'Brak wcześniejszych wpisów';

    const suggestion = getSuggestedPlace(new Date());
    el['suggested-place'].textContent = capitalize(formatPlace(suggestion.side, suggestion.site));

    const ampouleInfo = getAmpouleInfo();
    renderMainRecommendation({ todayEntry, ready, suggestion, ampouleInfo, editingExisting });
  }

  function renderMainRecommendation({ todayEntry, ready, suggestion, ampouleInfo, editingExisting }) {
    const suggestedPlace = capitalize(formatPlace(suggestion.side, suggestion.site));
    const doseText = `${formatDose(quickDraft.dose)} ${quickDraft.unit}`;

    el['recommended-save-button'].classList.remove('is-hidden');
    el['recommended-save-button'].disabled = false;
    el['recommended-manual-button'].classList.add('is-hidden');
    el['recommended-manual-button'].textContent = 'Ustaw ampułkę';
    el['ampoule-start-main-button'].classList.add('is-hidden');

    if (todayEntry?.status === 'given') {
      el['main-action-heading'].textContent = `Dzisiaj zapisano: ${capitalize(formatPlace(todayEntry.side, todayEntry.site))}`;
      el['main-action-text'].textContent = `${formatDateShort(todayEntry.date)}, ${todayEntry.time}. Dawka: ${formatDose(todayEntry.dose)} ${todayEntry.unit}.`;
      el['recommended-save-button'].textContent = 'Edytuj dzisiejszy wpis';
    } else if (todayEntry?.status === 'skipped') {
      el['main-action-heading'].textContent = 'Dzisiaj dawka jest oznaczona jako pominięta';
      el['main-action-text'].textContent = 'Jeżeli to pomyłka, otwórz edycję i popraw dzisiejszy wpis.';
      el['recommended-save-button'].textContent = 'Edytuj dzisiejszy wpis';
    } else {
      el['main-action-heading'].textContent = `Proponowane miejsce: ${suggestedPlace}`;
      el['main-action-text'].textContent = `Dawka: ${doseText}. Godzina: ${quickDraft.time}. Przed zapisem możesz zmienić dawkę, godzinę albo miejsce.`;
      el['recommended-save-button'].textContent = 'Przygotuj wpis';
    }

    if (!ampouleInfo.configured && ampouleInfo.reason === 'start') {
      el['recommended-manual-button'].classList.remove('is-hidden');
      el['recommended-manual-button'].textContent = 'Ustaw datę ampułki';
    } else if (!ampouleInfo.configured && ampouleInfo.reason === 'dose') {
      el['recommended-manual-button'].classList.remove('is-hidden');
      el['recommended-manual-button'].textContent = 'Ustaw dawkę ampułki';
    } else if (ampouleInfo.todayIsLast) {
      el['recommended-manual-button'].classList.remove('is-hidden');
      el['recommended-manual-button'].textContent = 'Ustawienia ampułki';
    }

    const ampouleMessage = ampouleSummary(ampouleInfo);
    el['ampoule-status'].textContent = ampouleMessage.short;
    el['ampoule-alert-title'].textContent = ampouleMessage.title;
    el['ampoule-alert-text'].textContent = ampouleMessage.text;
    el['ampoule-alert'].className = `ampoule-alert ampoule-alert--${ampouleMessage.level}`;
  }

  function renderMiniCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1);
    const offset = mondayIndex(first.getDay());
    const days = new Date(year, month + 1, 0).getDate();
    const entriesByDate = groupEntriesByDate();

    let html = '<div class="mini-calendar-head"><span>Pn</span><span>Wt</span><span>Śr</span><span>Cz</span><span>Pt</span><span>So</span><span>Nd</span></div><div class="mini-calendar-grid">';
    for (let i = 0; i < offset; i += 1) html += '<span class="mini-day is-outside"></span>';
    for (let day = 1; day <= days; day += 1) {
      const iso = datePartsToISO(year, month + 1, day);
      const entries = entriesByDate.get(iso) || [];
      const hasGiven = entries.some((entry) => entry.status === 'given');
      const hasSkipped = entries.some((entry) => entry.status === 'skipped');
      const classes = ['mini-day'];
      if (iso === localDateISO()) classes.push('is-today');
      if (hasGiven) classes.push('has-given');
      else if (hasSkipped) classes.push('has-skipped');
      html += `<span class="${classes.join(' ')}" title="${escapeHtml(formatDateLong(iso))}">${day}</span>`;
    }
    html += '</div>';
    el['mini-calendar'].innerHTML = html;
  }

  function renderRecent() {
    const entries = getEntriesSorted().slice(0, 5);
    if (!entries.length) {
      el['recent-list'].innerHTML = '<div class="empty-state"><strong>Brak wpisów</strong><span>Dodaj pierwsze podanie.</span></div>';
      return;
    }
    el['recent-list'].innerHTML = entries.map((entry) => `
      <div class="recent-item">
        <span>${escapeHtml(formatDateShort(entry.date))}</span>
        <span>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : '—'}</span>
        <strong>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : 'Pominięto'}</strong>
      </div>
    `).join('');
  }

  function renderCalendar() {
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    el['calendar-month-label'].textContent = capitalize(new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(calendarCursor));

    const firstVisible = new Date(year, month, 1 - mondayIndex(new Date(year, month, 1).getDay()));
    const entriesByDate = groupEntriesByDate();
    let html = '';

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(firstVisible);
      date.setDate(firstVisible.getDate() + index);
      const iso = localDateISO(date);
      const entries = entriesByDate.get(iso) || [];
      const classes = ['calendar-day'];
      if (date.getMonth() !== month) classes.push('is-outside');
      if (iso === selectedCalendarDate) classes.push('is-selected');
      if (iso === localDateISO()) classes.push('is-today');
      const markers = entries.slice(0, 1).map((entry) => `<i class="day-marker day-marker--${entry.status}" aria-hidden="true"></i>`).join('');
      const statusText = entries.length ? ', zapisano jeden wpis' : ', brak wpisu';
      html += `
        <button class="${classes.join(' ')}" type="button" role="gridcell" data-date="${iso}" aria-label="${escapeHtml(formatDateLong(iso) + statusText)}" aria-selected="${iso === selectedCalendarDate}">
          <span class="day-number">${date.getDate()}</span>
          <span class="day-markers">${markers}</span>
        </button>
      `;
    }

    el['calendar-grid'].innerHTML = html;
    el['calendar-grid'].querySelectorAll('[data-date]').forEach((button) => {
      button.addEventListener('click', () => selectCalendarDate(button.dataset.date));
    });
  }

  function renderSelectedDay() {
    el['selected-day-label'].textContent = capitalize(formatDateLong(selectedCalendarDate));
    const entry = getEntryForDate(selectedCalendarDate);
    el['add-for-selected-day'].textContent = entry ? 'Edytuj' : 'Dodaj';
    if (!entry) {
      el['selected-day-entries'].innerHTML = '<div class="empty-state"><strong>Brak wpisu</strong><span>W tym dniu nie zapisano podania.</span></div>';
      return;
    }
    el['selected-day-entries'].innerHTML = `
      <article class="day-entry-card">
        <strong>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : 'Dawka pominięta'}</strong>
        <div class="day-entry-card-meta">
          <span>${escapeHtml(entry.time)}</span>
          <span>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : 'bez dawki'}</span>
          <span>${entry.status === 'given' ? 'Podano' : 'Pominięto'}</span>
        </div>
        ${entry.note ? `<span class="muted">${escapeHtml(entry.note)}</span>` : ''}
        <button class="text-button" type="button" data-edit-id="${entry.id}">Edytuj wpis</button>
      </article>
    `;
  }

  function renderHistory() {
    const query = normalizeText(el['history-search']?.value || '');
    const status = el['status-filter']?.value || 'all';
    const site = el['site-filter']?.value || 'all';

    const entries = getEntriesSorted().filter((entry) => {
      if (status !== 'all' && entry.status !== status) return false;
      if (site !== 'all' && entry.site !== site) return false;
      if (!query) return true;
      const haystack = normalizeText([
        entry.date, formatDateShort(entry.date), entry.time, entry.dose, entry.unit,
        entry.side, entry.site, formatPlace(entry.side, entry.site), entry.note,
        entry.status === 'given' ? 'podano' : 'pominięto'
      ].filter(Boolean).join(' '));
      return haystack.includes(query);
    });

    el['history-table-body'].innerHTML = entries.map((entry) => `
      <tr>
        <td><strong>${escapeHtml(formatDateShort(entry.date))}</strong><br><span class="muted">${escapeHtml(entry.time)}</span></td>
        <td>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : '—'}</td>
        <td>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : '—'}</td>
        <td><span class="status-pill status-pill--${entry.status}">${entry.status === 'given' ? 'Podano' : 'Pominięto'}</span></td>
        <td>${entry.note ? escapeHtml(entry.note) : '<span class="muted">—</span>'}</td>
        <td>
          <div class="table-actions">
            <button class="table-action" type="button" data-edit-id="${entry.id}">Edytuj</button>
            <button class="table-action table-action--danger" type="button" data-delete-id="${entry.id}">Usuń</button>
          </div>
        </td>
      </tr>
    `).join('');

    el['history-empty'].classList.toggle('is-hidden', entries.length > 0);
  }

  function renderSettings() {
    el['settings-dose'].value = data.settings.defaultDose;
    el['settings-unit'].value = data.settings.unit;
    el['settings-time'].value = data.settings.defaultTime;
    el['ampoule-start-date'].value = data.settings.ampouleStartDate || '';
    el['ampoule-start-number'].value = data.settings.ampouleStartNumber || 1;
    el['ampoule-volume'].value = data.settings.ampouleVolumeMl || DEFAULT_AMPOULE_VOLUME_ML;
    el['ampoule-dose-ml'].value = data.settings.ampouleDoseMl || '';
    el['voice-feedback-toggle'].checked = Boolean(data.settings.voiceFeedback);
    el['voice-confirm-toggle'].checked = Boolean(data.settings.voiceConfirm);
    el['reminder-enabled-toggle'].checked = Boolean(data.settings.reminderEnabled);
    el['reminder-time'].value = data.settings.reminderTime || '21:00';
    updatePermissionStatuses();
  }

  function switchView(view, { updateHash = true, focus = true, smooth = true } = {}) {
    if (!['today', 'calendar', 'history', 'more'].includes(view)) return;
    activeView = view;
    document.querySelectorAll('.view').forEach((section) => {
      const active = section.id === `view-${view}`;
      section.hidden = !active;
      section.classList.toggle('is-active', active);
    });
    updateNavigation();
    if (view === 'calendar') {
      renderCalendar();
      renderSelectedDay();
    }
    if (view === 'history') renderHistory();
    if (view === 'more') renderSettings();
    if (updateHash && window.location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
    if (focus) document.getElementById(`view-${view}`)?.querySelector('h1, [tabindex]')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  }

  function viewFromHash() {
    const value = window.location.hash.replace('#', '').trim();
    return ['today', 'calendar', 'history', 'more'].includes(value) ? value : 'today';
  }

  function updateNavigation() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === activeView;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function openEntryForDate(date, focusId = null) {
    const existing = getEntryForDate(date);
    if (existing) {
      showToast('Dla tego dnia istnieje już wpis. Otwieram go do edycji.');
      openEntryDialog(existing.id, null, focusId);
      return;
    }
    openEntryDialog(null, { date }, focusId);
  }

  function openOrEditSelectedDay() {
    openEntryForDate(selectedCalendarDate);
  }

  function openEntryDialog(entryId = null, draftOverride = null, focusId = null) {
    const entry = entryId ? data.entries.find((item) => item.id === entryId) : null;
    const source = entry
      ? { ...entry, ...(draftOverride || {}) }
      : { ...createDefaultDraft({ time: data.settings.defaultTime }), ...(draftOverride || {}) };
    el['entry-dialog-title'].textContent = entry ? 'Edytuj wpis' : 'Dodaj wpis';
    el['entry-id'].value = source.id || '';
    el['entry-date'].value = source.date || localDateISO();
    el['entry-time'].value = source.time || localTime();
    el['entry-dose'].value = source.dose || data.settings.defaultDose;
    el['entry-unit'].value = source.unit || data.settings.unit;
    el['entry-side'].value = source.side || '';
    el['entry-site'].value = source.site || '';
    el['entry-status'].value = source.status || 'given';
    el['entry-note'].value = source.note || '';
    el['delete-entry-button'].classList.toggle('is-hidden', !entry);
    updateEntryRequirements();
    el['entry-dialog'].showModal();
    window.setTimeout(() => document.getElementById(focusId || 'entry-date')?.focus(), 50);
  }

  function closeEntryDialog() {
    if (el['entry-dialog'].open) el['entry-dialog'].close();
  }

  function updateEntryRequirements() {
    const given = el['entry-status'].value === 'given';
    el['entry-side'].required = given;
    el['entry-site'].required = given;
    el['entry-dose'].required = given;
  }

  function handleEntrySubmit(event) {
    event.preventDefault();
    const existingById = data.entries.find((item) => item.id === el['entry-id'].value) || null;
    const status = el['entry-status'].value;
    const entry = sanitizeEntry({
      id: existingById?.id || createId(),
      date: el['entry-date'].value,
      time: el['entry-time'].value,
      dose: status === 'given' ? el['entry-dose'].value : '',
      unit: status === 'given' ? el['entry-unit'].value : '',
      side: status === 'given' ? el['entry-side'].value : '',
      site: status === 'given' ? el['entry-site'].value : '',
      status,
      note: el['entry-note'].value,
      createdAt: existingById?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    if (!entry) {
      showToast(status === 'given'
        ? 'Uzupełnij prawidłową datę, godzinę, dawkę, stronę i miejsce wkłucia.'
        : 'Uzupełnij prawidłową datę i godzinę.', 'error');
      return;
    }

    const conflictingEntry = getEntryForDate(entry.date, entry.id);
    if (conflictingEntry) {
      showToast('Dla tej daty istnieje już wpis. Aplikacja pozwala tylko na jeden wpis dziennie.', 'error');
      return;
    }

    const existingIndex = data.entries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) data.entries[existingIndex] = entry;
    else data.entries.push(entry);
    if (!persistData()) return;
    closeEntryDialog();
    selectedCalendarDate = entry.date;
    calendarCursor = startOfMonth(parseISODate(entry.date));
    resetQuickDraftForToday();
    renderAll();
    const message = existingIndex >= 0 ? 'Wpis został poprawiony.' : 'Wpis został zapisany.';
    showToast(message, 'success');
    speakIfEnabled(message);
  }

  function saveRecommendedDraft() {
    const today = localDateISO();
    const todayEntry = getEntryForDate(today);
    if (todayEntry) {
      openEntryDialog(todayEntry.id);
      return;
    }
    const suggestion = getSuggestedPlace(new Date());
    quickDraft = createDefaultDraft({
      date: today,
      time: data.settings.defaultTime,
      side: suggestion.side,
      site: suggestion.site,
      status: 'given'
    });
    quickDraftTouched = true;
    lastRecognizedText = `Propozycja: ${formatPlace(suggestion.side, suggestion.site)}`;
    renderToday();
    document.querySelector('.injection-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el['save-button'].focus({ preventScroll: true });
    showToast('Propozycja została przygotowana. Możesz zmienić dawkę lub miejsce, albo nacisnąć „Zapisz”.', 'success');
  }

  function openAmpouleSettings() {
    switchView('more');
    window.setTimeout(() => {
      const field = el['ampoule-start-date'];
      if (!field) return;
      field.focus({ preventScroll: false });
      try { field.showPicker?.(); } catch {}
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
  }

  function setAmpouleStartToday() {
    data.settings.ampouleStartDate = localDateISO();
    if (el['ampoule-start-date']) el['ampoule-start-date'].value = data.settings.ampouleStartDate;
    if (!persistData()) return;
    renderAll();
    showToast('Ustawiono dzisiejszą datę rozpoczęcia ampułki.', 'success');
  }

  function saveQuickDraft() {
    if (quickDraft.status === 'given' && (!quickDraft.side || !quickDraft.site || !normalizeDose(quickDraft.dose))) {
      showToast('Najpierw wybierz lub powiedz miejsce wkłucia oraz sprawdź dawkę.', 'error');
      return;
    }

    const existingById = quickDraft.id ? data.entries.find((item) => item.id === quickDraft.id) : null;
    const conflictingEntry = getEntryForDate(quickDraft.date, quickDraft.id || '');
    if (conflictingEntry) {
      showToast('Dla tej daty istnieje już wpis. Otwieram istniejący wpis do edycji.', 'error');
      openEntryDialog(conflictingEntry.id);
      return;
    }

    const entry = sanitizeEntry({
      ...quickDraft,
      id: existingById?.id || createId(),
      dose: quickDraft.status === 'given' ? quickDraft.dose : '',
      unit: quickDraft.status === 'given' ? quickDraft.unit : '',
      side: quickDraft.status === 'given' ? quickDraft.side : '',
      site: quickDraft.status === 'given' ? quickDraft.site : '',
      createdAt: existingById?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (!entry) {
      showToast('Przygotowany wpis zawiera nieprawidłowe dane.', 'error');
      return;
    }

    const existingIndex = data.entries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) data.entries[existingIndex] = entry;
    else data.entries.push(entry);
    if (!persistData()) return;
    selectedCalendarDate = entry.date;
    calendarCursor = startOfMonth(parseISODate(entry.date));
    resetQuickDraftForToday();
    renderAll();
    const message = entry.status === 'given'
      ? `${existingIndex >= 0 ? 'Zmieniono' : 'Zapisano'}: ${formatPlace(entry.side, entry.site)}.`
      : `${existingIndex >= 0 ? 'Zmieniono wpis na' : 'Zapisano'} pominięcie dawki.`;
    showToast(message, 'success');
    speakIfEnabled(message);
  }

  function prepareSkippedDraft() {
    const today = localDateISO();
    const existing = getEntryForDate(today);
    quickDraft = existing
      ? { ...existing, status: 'skipped', dose: '', unit: '', side: '', site: '' }
      : createDefaultDraft({ status: 'skipped', dose: '', unit: '', side: '', site: '' });
    quickDraftTouched = true;
    lastRecognizedText = 'dawka pominięta dzisiaj';
    renderToday();
    showToast(existing
      ? 'Przygotowano zmianę dzisiejszego wpisu na „Pominięto”. Naciśnij „Zapisz zmiany”.'
      : 'Przygotowano wpis „Pominięto”. Naciśnij „Zapisz”, aby potwierdzić.');
  }

  function useSuggestedPlace() {
    const reference = dateTimeFromEntry(quickDraft) || new Date();
    const suggestion = getSuggestedPlace(reference);
    quickDraft.side = suggestion.side;
    quickDraft.site = suggestion.site;
    quickDraft.status = 'given';
    if (!quickDraft.unit) quickDraft.unit = data.settings.unit;
    if (!quickDraft.dose) quickDraft.dose = data.settings.defaultDose;
    quickDraftTouched = true;
    lastRecognizedText = formatPlace(suggestion.side, suggestion.site);
    renderToday();
    el['save-button'].focus();
  }

  function getAmpouleInfo() {
    const today = localDateISO();
    const todayEntry = getEntryForDate(today);
    const timeline = buildAmpouleTimeline({ includePlannedToday: todayEntry?.status !== 'skipped' });

    if (!timeline.configured) {
      return {
        configured: false,
        reason: timeline.reason,
        volumeMl: timeline.volumeMl,
        doseMl: timeline.doseMl,
        startDate: timeline.startDate
      };
    }

    const todayRow = [...timeline.rows].reverse().find((row) => row.entry.date === today);
    const latestRow = timeline.rows[timeline.rows.length - 1] || null;
    const referenceRow = todayRow || latestRow;
    const remainingBeforeToday = todayRow ? todayRow.remainingBefore : timeline.remainingMl;
    const remainingAfterToday = todayRow ? todayRow.remainingAfter : timeline.remainingMl;
    const todayDoseMl = todayRow ? todayRow.doseMl : 0;
    const approximateDosesLeftAfterToday = Math.floor((remainingAfterToday + 0.000001) / timeline.doseMl);

    return {
      configured: true,
      reason: '',
      startDate: timeline.startDate,
      volumeMl: timeline.volumeMl,
      doseMl: timeline.doseMl,
      usedBeforeToday: Math.max(0, timeline.volumeMl - remainingBeforeToday),
      remainingBeforeToday,
      remainingAfterToday,
      ampouleNumber: referenceRow?.ampouleNumber ?? timeline.ampouleNumber,
      ampouleStartDate: referenceRow?.ampouleStartDate || timeline.ampouleStartDate,
      nextAmpouleStartDate: todayRow?.nextAmpouleStartDate || timeline.nextAmpouleStartDate || '',
      todayIsLast: Boolean(todayRow?.isLastDose),
      todayStartsNewAmpoule: Boolean(todayRow?.startsNewAmpoule),
      todayEntryStatus: todayEntry?.status || '',
      todayDoseMl,
      approximateDosesLeftAfterToday
    };
  }

  function ampouleSummary(info) {
    if (!info.configured && info.reason === 'start') {
      return {
        level: 'warning',
        short: 'Brak daty rozpoczęcia',
        title: 'Ampułka: ustaw datę rozpoczęcia',
        text: 'Ustaw datę rozpoczęcia obecnej ampułki i jej numer. Potem aplikacja pokaże stan ampułki po zapisanych podaniach.'
      };
    }
    if (!info.configured && info.reason === 'dose') {
      return {
        level: 'warning',
        short: 'Brak dawki w ml',
        title: 'Ampułka: brak dawki w ml',
        text: 'Aby liczyć zużycie ampułki 10 ml, ustaw zużycie na jedno podanie w ml albo wybierz jednostkę ml.'
      };
    }
    if (info.todayIsLast) {
      const prefix = info.todayEntryStatus === 'given' ? 'Dzisiejszy wpis był' : 'Dzisiaj jest';
      return {
        level: 'danger',
        short: `Ampułka ${info.ampouleNumber}: ostatni zastrzyk`,
        title: `Ampułka ${info.ampouleNumber}: ostatni zastrzyk`,
        text: `${prefix} ostatnim zastrzykiem z ampułki ${info.ampouleNumber}. Następna ampułka zacznie się przy kolejnym podaniu, planowo ${formatDateShort(info.nextAmpouleStartDate)}.`
      };
    }
    if (info.todayStartsNewAmpoule) {
      return {
        level: 'ok',
        short: `Ampułka ${info.ampouleNumber}: rozpoczęta dzisiaj`,
        title: `Ampułka ${info.ampouleNumber}: nowa ampułka`,
        text: `Ta ampułka zaczyna się dzisiaj. Po dzisiejszej dawce zostanie około ${formatMl(info.remainingAfterToday)} ml.`
      };
    }
    return {
      level: 'ok',
      short: `Ampułka ${info.ampouleNumber}: zostanie ${formatMl(info.remainingAfterToday)} ml`,
      title: `Ampułka ${info.ampouleNumber}`,
      text: `Start tej ampułki: ${formatDateShort(info.ampouleStartDate)}. Po dzisiejszej dawce zostanie około ${formatMl(info.remainingAfterToday)} ml, czyli około ${info.approximateDosesLeftAfterToday} kolejnych pełnych podań.`
    };
  }

  function ampouleNotificationText(info) {
    if (!info.configured) return '';
    if (info.todayIsLast) return `Dzisiaj jest ostatni zastrzyk z tej ampułki. Nowa ampułka zacznie się planowo ${formatDateShort(info.nextAmpouleStartDate)}.`;
    if (info.todayStartsNewAmpoule) return `Ta ampułka zaczyna się dzisiaj. Po dzisiejszej dawce zostanie około ${formatMl(info.remainingAfterToday)} ml.`;
    return `Po dzisiejszej dawce zostanie około ${formatMl(info.remainingAfterToday)} ml w ampułce.`;
  }

  function getConfiguredAmpouleDoseMl() {
    if (data.settings.unit === 'ml') return decimalToNumber(data.settings.defaultDose);
    return decimalToNumber(data.settings.ampouleDoseMl);
  }

  function getEntryAmpouleDoseMl(entry, fallbackDoseMl) {
    if (entry?.unit === 'ml') return decimalToNumber(entry.dose) || fallbackDoseMl;
    return fallbackDoseMl;
  }

  function addDaysISO(iso, days) {
    const date = parseISODate(iso);
    date.setDate(date.getDate() + days);
    return localDateISO(date);
  }

  function ampouleSortKey(entry) {
    return `${entry.date}T${entry.time || '00:00'}`;
  }

  function buildAmpouleTimeline({ includePlannedToday = false } = {}) {
    const startDate = data.settings.ampouleStartDate || '';
    const volumeMl = decimalToNumber(data.settings.ampouleVolumeMl) || decimalToNumber(DEFAULT_AMPOULE_VOLUME_ML);
    const configuredDoseMl = getConfiguredAmpouleDoseMl();

    if (!startDate || !isValidIsoDate(startDate)) {
      return { configured: false, reason: 'start', startDate: '', volumeMl, doseMl: configuredDoseMl, rows: [] };
    }
    if (!configuredDoseMl) {
      return { configured: false, reason: 'dose', startDate, volumeMl, doseMl: 0, rows: [] };
    }

    const today = localDateISO();
    const sourceEntries = getEntriesAscending().filter((entry) => entry.date >= startDate);
    const hasTodayEntry = sourceEntries.some((entry) => entry.date === today);
    const timelineEntries = includePlannedToday && !hasTodayEntry
      ? [...sourceEntries, createDefaultDraft({ id: 'planned-today', date: today, time: data.settings.defaultTime, status: 'given' })]
      : sourceEntries;

    let ampouleNumber = normalizeAmpouleNumber(data.settings.ampouleStartNumber);
    let ampouleStartDate = startDate;
    let remainingMl = volumeMl;
    let nextAmpouleStartDate = '';
    const rows = [];

    timelineEntries
      .filter((entry) => entry.date >= startDate)
      .sort((a, b) => ampouleSortKey(a).localeCompare(ampouleSortKey(b)))
      .forEach((entry) => {
        const isGiven = entry.status === 'given';
        const doseMl = isGiven ? getEntryAmpouleDoseMl(entry, configuredDoseMl) : 0;
        let startsNewAmpoule = false;

        if (isGiven && remainingMl <= 0.000001) {
          ampouleNumber += 1;
          ampouleStartDate = entry.date;
          remainingMl = volumeMl;
          startsNewAmpoule = true;
          nextAmpouleStartDate = '';
        }

        const remainingBefore = remainingMl;
        const remainingAfter = isGiven ? Math.max(0, remainingBefore - doseMl) : remainingBefore;
        const isLastDose = isGiven && doseMl > 0 && doseMl >= remainingBefore - 0.000001;
        if (isLastDose) nextAmpouleStartDate = addDaysISO(entry.date, 1);

        rows.push({
          entry,
          planned: entry.id === 'planned-today',
          ampouleNumber,
          ampouleStartDate,
          doseMl,
          remainingBefore,
          remainingAfter,
          startsNewAmpoule,
          isLastDose,
          nextAmpouleStartDate
        });

        remainingMl = remainingAfter;
      });

    return {
      configured: true,
      reason: '',
      startDate,
      volumeMl,
      doseMl: configuredDoseMl,
      rows,
      ampouleNumber,
      ampouleStartDate,
      remainingMl,
      nextAmpouleStartDate
    };
  }

  function formatMl(value) {
    const rounded = Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
    return String(rounded).replace('.', ',');
  }

  function getLatestGivenBefore(referenceDate = new Date()) {
    const referenceMs = referenceDate.getTime();
    return getEntriesSorted().find((entry) => {
      if (entry.status !== 'given' || !entry.side || !entry.site) return false;
      const value = dateTimeFromEntry(entry);
      return value && value.getTime() <= referenceMs;
    }) || null;
  }

  function getSuggestedPlace(referenceDate = new Date()) {
    const latest = getLatestGivenBefore(referenceDate);
    if (!latest) return { side: ROTATION[0][0], site: ROTATION[0][1] };
    const index = ROTATION.findIndex(([side, site]) => side === latest.side && site === latest.site);
    const safeIndex = index >= 0 ? index : -1;
    const next = ROTATION[(safeIndex + 1) % ROTATION.length];
    return { side: next[0], site: next[1] };
  }

  function dateTimeFromEntry(entry) {
    if (!entry?.date || !entry?.time || !isValidIsoDate(entry.date) || !isValidTime(entry.time)) return null;
    const [year, month, day] = entry.date.split('-').map(Number);
    const [hour, minute] = entry.time.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  }

  function selectCalendarDate(iso) {
    selectedCalendarDate = iso;
    const selected = parseISODate(iso);
    if (selected.getMonth() !== calendarCursor.getMonth() || selected.getFullYear() !== calendarCursor.getFullYear()) {
      calendarCursor = startOfMonth(selected);
    }
    renderCalendar();
    renderSelectedDay();
  }

  function changeCalendarMonth(delta) {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + delta, 1);
    selectedCalendarDate = localDateISO(calendarCursor);
    renderCalendar();
    renderSelectedDay();
  }

  function handleCalendarKeydown(event) {
    if (!event.target.matches('[data-date]')) return;
    const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(event.key in deltas)) return;
    event.preventDefault();
    const date = parseISODate(event.target.dataset.date);
    date.setDate(date.getDate() + deltas[event.key]);
    const iso = localDateISO(date);
    selectCalendarDate(iso);
    window.setTimeout(() => el['calendar-grid'].querySelector(`[data-date="${iso}"]`)?.focus(), 0);
  }

  function handleHistoryAction(event) {
    const editButton = event.target.closest('[data-edit-id]');
    const deleteButton = event.target.closest('[data-delete-id]');
    if (editButton) openEntryDialog(editButton.dataset.editId);
    if (deleteButton) deleteEntry(deleteButton.dataset.deleteId);
  }

  function handleDayDetailsAction(event) {
    const editButton = event.target.closest('[data-edit-id]');
    if (editButton) openEntryDialog(editButton.dataset.editId);
  }

  function deleteEntryFromDialog() {
    const id = el['entry-id'].value;
    if (id) deleteEntry(id, true);
  }

  function deleteEntry(id, closeDialogAfter = false) {
    const entry = data.entries.find((item) => item.id === id);
    if (!entry) return;
    if (!window.confirm(`Usunąć wpis z ${formatDateShort(entry.date)}?`)) return;
    data.entries = data.entries.filter((item) => item.id !== id);
    if (!persistData()) return;
    if (closeDialogAfter) closeEntryDialog();
    resetQuickDraftForToday();
    renderAll();
    showToast('Wpis został usunięty.', 'success');
  }

  function saveSettings() {
    const dose = normalizeDose(el['settings-dose'].value);
    if (!dose) {
      showToast('Podaj prawidłową dawkę domyślną.', 'error');
      return;
    }
    const ampouleStartNumber = normalizeAmpouleNumber(el['ampoule-start-number'].value);
    const ampouleVolume = normalizePositiveDecimal(el['ampoule-volume'].value) || DEFAULT_AMPOULE_VOLUME_ML;
    const ampouleDoseMl = normalizeOptionalPositiveDecimal(el['ampoule-dose-ml'].value);
    const ampouleStartDate = el['ampoule-start-date'].value;
    if (ampouleStartDate && !isValidIsoDate(ampouleStartDate)) {
      showToast('Podaj prawidłową datę rozpoczęcia ampułki.', 'error');
      return;
    }
    if (el['ampoule-dose-ml'].value.trim() && !ampouleDoseMl) {
      showToast('Podaj prawidłową wartość ml na jedno podanie.', 'error');
      return;
    }

    data.settings.defaultDose = dose;
    data.settings.unit = ALLOWED_UNITS.has(el['settings-unit'].value) ? el['settings-unit'].value : 'mg';
    data.settings.defaultTime = isValidTime(el['settings-time'].value) ? el['settings-time'].value : '20:00';
    data.settings.ampouleStartDate = ampouleStartDate || '';
    data.settings.ampouleStartNumber = ampouleStartNumber;
    data.settings.ampouleVolumeMl = ampouleVolume;
    data.settings.ampouleDoseMl = ampouleDoseMl;
    data.settings.voiceFeedback = el['voice-feedback-toggle'].checked;
    data.settings.voiceConfirm = el['voice-confirm-toggle'].checked;
    if (!persistData()) return;
    if (!quickDraftTouched && !quickDraft.id) resetQuickDraftForToday();
    renderAll();
    showToast(quickDraftTouched
      ? 'Ustawienia zostały zapisane. Przygotowany wpis pozostał bez zmian.'
      : 'Ustawienia zostały zapisane.', 'success');
  }

  async function saveReminderSettings() {
    const time = el['reminder-time'].value || '21:00';
    const enabled = el['reminder-enabled-toggle'].checked;
    if (enabled && (!('Notification' in window) || Notification.permission !== 'granted')) {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        el['reminder-enabled-toggle'].checked = false;
        showToast('Nie można włączyć przypomnienia bez zgody na powiadomienia.', 'error');
        return;
      }
    }
    data.settings.reminderEnabled = enabled;
    data.settings.reminderTime = isValidTime(time) ? time : '21:00';
    if (!persistData()) return;
    await registerPeriodicReminder();
    checkReminderDue();
    renderSettings();
    showToast(enabled ? `Przypomnienie ustawiono na ${time}.` : 'Przypomnienie zostało wyłączone.', 'success');
  }

  function getAmpouleRowsByEntryId() {
    const timeline = buildAmpouleTimeline({ includePlannedToday: false });
    const rowsById = new Map();
    if (timeline.configured) {
      timeline.rows.forEach((row) => {
        if (row.entry?.id) rowsById.set(row.entry.id, row);
      });
    }
    return { timeline, rowsById };
  }

  function formatReportAmpouleCell(row) {
    if (!row) return '—';
    const suffixes = [];
    if (row.startsNewAmpoule) suffixes.push('rozpoczęcie');
    if (row.isLastDose) suffixes.push('koniec');
    return suffixes.length ? `${row.ampouleNumber} — ${suffixes.join(', ')}` : String(row.ampouleNumber);
  }

  function formatReportRemainingCell(row) {
    if (!row) return '—';
    if (row.entry.status !== 'given') return `bez zmian, ${formatMl(row.remainingAfter)} ml`;
    return `${formatMl(row.remainingAfter)} ml`;
  }

  function buildReportTableRows() {
    const { rowsById } = getAmpouleRowsByEntryId();
    return getEntriesAscending().map((entry) => {
      const ampouleRow = rowsById.get(entry.id);
      return `
      <tr>
        <td>${escapeHtml(formatDateShort(entry.date))}</td>
        <td>${escapeHtml(entry.time || '—')}</td>
        <td>${entry.status === 'given' ? `${escapeHtml(formatDose(entry.dose))} ${escapeHtml(entry.unit)}` : '—'}</td>
        <td>${entry.status === 'given' ? escapeHtml(formatPlace(entry.side, entry.site)) : '—'}</td>
        <td>${entry.status === 'given' ? 'Podano' : 'Pominięto'}</td>
        <td>${escapeHtml(formatReportAmpouleCell(ampouleRow))}</td>
        <td>${ampouleRow ? escapeHtml(formatDateShort(ampouleRow.ampouleStartDate)) : '—'}</td>
        <td>${escapeHtml(formatReportRemainingCell(ampouleRow))}</td>
        <td>${entry.note ? escapeHtml(entry.note) : '—'}</td>
      </tr>`;
    }).join('');
  }

  function ampouleReportSummary(info) {
    if (!info.configured) {
      return { number: '—', text: info.reason === 'dose' ? 'brak dawki w ml do obliczeń' : 'brak daty startu ampułki' };
    }
    if (info.todayIsLast) {
      return {
        number: String(info.ampouleNumber),
        text: `start ${formatDateShort(info.ampouleStartDate)}, dzisiaj ostatni zastrzyk, następna ampułka planowo od ${formatDateShort(info.nextAmpouleStartDate)}`
      };
    }
    if (info.todayStartsNewAmpoule) {
      return {
        number: String(info.ampouleNumber),
        text: `nowa ampułka od ${formatDateShort(info.ampouleStartDate)}, po dzisiejszej dawce ok. ${formatMl(info.remainingAfterToday)} ml`
      };
    }
    return {
      number: String(info.ampouleNumber),
      text: `start ${formatDateShort(info.ampouleStartDate)}, po dzisiejszej dawce ok. ${formatMl(info.remainingAfterToday)} ml`
    };
  }

  function getReportPeriodText(entries) {
    if (!entries.length) return 'brak wpisów';
    return `${formatDateShort(entries[0].date)} – ${formatDateShort(entries[entries.length - 1].date)}`;
  }

  function buildReportBody() {
    const entries = getEntriesAscending();
    const given = entries.filter((entry) => entry.status === 'given').length;
    const skipped = entries.filter((entry) => entry.status === 'skipped').length;
    const ampouleInfo = getAmpouleInfo();
    const ampouleReport = ampouleReportSummary(ampouleInfo);
    return `
      <h1>Dzienniczek hormonu wzrostu</h1>
      <p class="generated">Raport wygenerowano: ${escapeHtml(new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date()))}</p>
      <p class="generated">Zakres wpisów: ${escapeHtml(getReportPeriodText(entries))}</p>
      <div class="summary">
        <div><strong>${entries.length}</strong><span>wszystkich wpisów</span></div>
        <div><strong>${given}</strong><span>podań</span></div>
        <div><strong>${skipped}</strong><span>pominiętych</span></div>
        <div><strong>${escapeHtml(ampouleReport.number)}</strong><span>${escapeHtml(ampouleReport.text)}</span></div>
      </div>
      <table>
        <thead><tr><th>Data</th><th>Godzina</th><th>Dawka</th><th>Miejsce</th><th>Status</th><th>Ampułka</th><th>Start ampułki</th><th>Pozostało po wpisie</th><th>Uwagi</th></tr></thead>
        <tbody>${buildReportTableRows() || '<tr><td colspan="9">Brak wpisów.</td></tr>'}</tbody>
      </table>
      <p class="footer">Aplikacja nie dobiera dawki i nie zastępuje zaleceń lekarza.</p>`;
  }

  function reportDocumentHtml({ forWord = false } = {}) {
    return `<!doctype html><html lang="pl"${forWord ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"' : ''}>
      <head><meta charset="utf-8"><title>Raport – Dzienniczek hormonu wzrostu</title>
      <style>
        @page { size: A4 landscape; margin: 14mm; }
        body { font-family: Arial, sans-serif; color: #17324d; margin: 24px; }
        h1 { margin: 0 0 4px; font-size: 24px; }
        .generated, .footer { color: #60768a; font-size: 12px; }
        .summary { display: flex; gap: 12px; margin: 18px 0; }
        .summary div { border: 1px solid #d9e5ed; border-radius: 10px; padding: 10px 14px; min-width: 130px; }
        .summary strong { display: block; font-size: 20px; color: #0e927f; }
        .summary span { font-size: 12px; color: #60768a; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 11px; }
        th, td { border: 1px solid #cfdce5; padding: 7px; text-align: left; vertical-align: top; }
        th { background: #e9f7f4; }
        tr:nth-child(even) td { background: #f8fbfd; }
        .print-button { margin-bottom: 16px; padding: 10px 14px; border: 0; border-radius: 9px; color: white; background: #0e927f; font-weight: bold; }
        @media print { .print-button { display: none; } body { margin: 0; } }
      </style></head><body>${forWord ? '' : '<button class="print-button" onclick="window.print()">Zapisz jako PDF / drukuj</button>'}${buildReportBody()}</body></html>`;
  }

  function exportPdf() {
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      showToast('Przeglądarka zablokowała okno raportu. Zezwól na wyskakujące okna.', 'error');
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(reportDocumentHtml());
    reportWindow.document.close();
    reportWindow.focus();
    window.setTimeout(() => reportWindow.print(), 450);
    showToast('Otworzono raport. Wybierz „Zapisz jako PDF”.', 'success');
  }

  function exportWord() {
    try {
      const blob = createDocxBlob();
      downloadBlob(`dzienniczek-raport-${localDateISO()}.docx`, blob);
      showToast('Pobrano prawidłowy dokument Word .docx.', 'success');
    } catch (error) {
      console.error('Nie udało się utworzyć DOCX:', error);
      showToast('Nie udało się utworzyć dokumentu Word.', 'error');
    }
  }

  function createDocxBlob() {
    const files = [
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
          <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
          <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
          <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
        </Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
          <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
        </Relationships>`],
      ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
        </Relationships>`],
      ['word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:lang w:val="pl-PL"/></w:rPr></w:style>
        </w:styles>`],
      ['word/document.xml', buildDocxDocumentXml()],
      ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <dc:title>Dzienniczek hormonu wzrostu</dc:title><dc:creator>Dzienniczek hormonu wzrostu</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
        </cp:coreProperties>`],
      ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Dzienniczek hormonu wzrostu</Application></Properties>`]
    ];
    return new Blob([buildStoredZip(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  function buildDocxDocumentXml() {
    const entries = getEntriesAscending();
    const { rowsById } = getAmpouleRowsByEntryId();
    const rows = [
      ['Data', 'Godzina', 'Dawka', 'Miejsce', 'Status', 'Ampułka', 'Start ampułki', 'Pozostało po wpisie', 'Uwagi'],
      ...entries.map((entry) => {
        const ampouleRow = rowsById.get(entry.id);
        return [
          formatDateShort(entry.date),
          entry.time,
          entry.status === 'given' ? `${formatDose(entry.dose)} ${entry.unit}` : '—',
          entry.status === 'given' ? formatPlace(entry.side, entry.site) : '—',
          entry.status === 'given' ? 'Podano' : 'Pominięto',
          formatReportAmpouleCell(ampouleRow),
          ampouleRow ? formatDateShort(ampouleRow.ampouleStartDate) : '—',
          formatReportRemainingCell(ampouleRow),
          entry.note || '—'
        ];
      })
    ];
    const tableRows = entries.length
      ? rows.map((row, rowIndex) => `<w:tr>${row.map((cell) => docxCell(cell, rowIndex === 0)).join('')}</w:tr>`).join('')
      : `<w:tr>${docxCell('Brak wpisów.', false)}</w:tr>`;
    const generated = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const ampouleReport = ampouleReportSummary(getAmpouleInfo());
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          ${docxParagraph('Dzienniczek hormonu wzrostu', true, 32)}
          ${docxParagraph(`Raport wygenerowano: ${generated}`, false, 18)}
          ${docxParagraph(`Zakres wpisów: ${getReportPeriodText(entries)}`, false, 18)}
          ${docxParagraph(`Liczba wpisów: ${entries.length}. Podano: ${entries.filter((entry) => entry.status === 'given').length}. Pominięto: ${entries.filter((entry) => entry.status === 'skipped').length}.`, false, 20)}
          ${docxParagraph(`Ampułka: ${ampouleReport.number} — ${ampouleReport.text}`, false, 20)}
          <w:tbl>
            <w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7C9D6"/><w:left w:val="single" w:sz="4" w:color="B7C9D6"/><w:bottom w:val="single" w:sz="4" w:color="B7C9D6"/><w:right w:val="single" w:sz="4" w:color="B7C9D6"/><w:insideH w:val="single" w:sz="4" w:color="D8E3EA"/><w:insideV w:val="single" w:sz="4" w:color="D8E3EA"/></w:tblBorders></w:tblPr>
            ${tableRows}
          </w:tbl>
          ${docxParagraph('Aplikacja nie dobiera dawki i nie zastępuje zaleceń lekarza.', false, 18)}
          <w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>
        </w:body>
      </w:document>`;
  }

  function docxParagraph(text, bold = false, size = 20) {
    return `<w:p><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  }

  function docxCell(text, bold = false) {
    return `<w:tc><w:tcPr><w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar></w:tcPr>${docxParagraph(String(text), bold, 18)}</w:tc>`;
  }

  function escapeXml(value) {
    return String(value ?? '').replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[character]));
  }

  function buildStoredZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const dataBytes = typeof content === 'string' ? encoder.encode(content) : content;
      const crc = crc32(dataBytes);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, dataBytes.length, true);
      localView.setUint32(22, dataBytes.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localHeader.set(nameBytes, 30);
      localParts.push(localHeader, dataBytes);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, dataBytes.length, true);
      centralView.setUint32(24, dataBytes.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);
      offset += localHeader.length + dataBytes.length;
    });

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    return concatUint8Arrays([...localParts, ...centralParts, end]);
  }

  function concatUint8Arrays(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    parts.forEach((part) => { result.set(part, offset); offset += part.length; });
    return result;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function exportJson() {
    const payload = {
      application: 'Dzienniczek hormonu wzrostu',
      exportedAt: new Date().toISOString(),
      data
    };
    downloadFile(`dzienniczek-kopia-${localDateISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    showToast('Pobrano kopię danych JSON.', 'success');
  }

  function exportCsv() {
    const header = ['Data', 'Godzina', 'Dawka', 'Jednostka', 'Strona', 'Miejsce', 'Status', 'Ampułka', 'Start ampułki', 'Pozostało po wpisie', 'Uwagi'];
    const { rowsById } = getAmpouleRowsByEntryId();
    const rows = getEntriesAscending().map((entry) => {
      const ampouleRow = rowsById.get(entry.id);
      return [
        entry.date, entry.time, entry.status === 'given' ? formatDose(entry.dose) : '', entry.unit,
        entry.side, entry.site, entry.status === 'given' ? 'Podano' : 'Pominięto',
        formatReportAmpouleCell(ampouleRow),
        ampouleRow ? ampouleRow.ampouleStartDate : '',
        formatReportRemainingCell(ampouleRow),
        entry.note || ''
      ];
    });
    const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    downloadFile(`dzienniczek-historia-${localDateISO()}.csv`, csv, 'text/csv;charset=utf-8');
    showToast('Pobrano historię CSV.', 'success');
  }

  async function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Plik jest zbyt duży.');
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = parsed.data || parsed;
      if (!imported || !Array.isArray(imported.entries)) throw new Error('Nieprawidłowa struktura pliku.');
      const sanitizedEntries = imported.entries.map(sanitizeEntry).filter(Boolean);
      if (sanitizedEntries.length !== imported.entries.length) {
        throw new Error('Plik zawiera nieprawidłowe lub niekompletne wpisy.');
      }
      const unique = keepOneEntryPerDate(sanitizedEntries);
      if (unique.removedDuplicates > 0) {
        throw new Error('Plik zawiera więcej niż jeden wpis dla tego samego dnia. Usuń duplikaty przed importem.');
      }
      if (!window.confirm(`Import zawiera ${unique.entries.length} ${plural(unique.entries.length, 'wpis', 'wpisy', 'wpisów')}. Zastąpić obecne dane?`)) return;
      const previousData = data;
      data = {
        version: 5,
        settings: sanitizeSettings(imported.settings),
        meta: { ...sanitizeMeta(imported.meta), onboardingCompleted: true },
        entries: unique.entries
      };
      if (!persistData()) {
        data = previousData;
        return;
      }
      resetQuickDraftForToday();
      renderAll();
      showToast('Kopia została zaimportowana.', 'success');
    } catch (error) {
      console.error(error);
      showToast(`Nie udało się zaimportować pliku JSON. ${error.message || ''}`.trim(), 'error', 7000);
    }
  }

  function clearAllEntries() {
    if (!data.entries.length) {
      showToast('Historia jest już pusta.');
      return;
    }
    if (!window.confirm('Usunąć wszystkie wpisy? Tej operacji nie można cofnąć.')) return;
    const previousEntries = data.entries;
    data.entries = [];
    if (!persistData()) {
      data.entries = previousEntries;
      return;
    }
    resetQuickDraftForToday();
    renderAll();
    showToast('Wszystkie wpisy zostały usunięte.', 'success');
  }

  function maybeShowFirstRunPermissions() {
    if (data.meta.onboardingCompleted || !el['permissions-dialog']) return;
    window.setTimeout(() => openPermissionsDialog(), 250);
  }

  async function openPermissionsDialog() {
    await updatePermissionStatuses();
    if (!el['permissions-dialog'].open) el['permissions-dialog'].showModal();
  }

  function finishPermissionsOnboarding() {
    data.meta.onboardingCompleted = true;
    if (!persistData()) return;
    if (el['permissions-dialog'].open) el['permissions-dialog'].close();
    scheduleDailyReminder();
    showToast('Ustawienia zgód zostały zapisane.', 'success');
  }

  async function requestMicrophonePermission() {
    let state = 'unsupported';
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      state = 'granted';
      showToast('Dostęp do mikrofonu został przyznany.', 'success');
    } catch (error) {
      state = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError' ? 'denied' : 'unsupported';
      showToast(state === 'denied' ? 'Dostęp do mikrofonu został zablokowany.' : 'Mikrofon nie jest dostępny w tej przeglądarce.', 'error');
    }
    await updatePermissionStatuses({ microphone: state });
    return state;
  }

  async function requestNotificationPermission() {
    let state = 'unsupported';
    try {
      if (!('Notification' in window)) throw new Error('unsupported');
      state = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (state === 'granted') {
        showToast('Powiadomienia zostały włączone.', 'success');
        await registerPeriodicReminder();
        scheduleDailyReminder();
        checkReminderDue();
      } else {
        showToast('Powiadomienia nie zostały włączone.', 'error');
      }
    } catch (error) {
      console.warn(error);
      state = 'unsupported';
      showToast('Ta przeglądarka nie obsługuje powiadomień.', 'error');
    }
    await updatePermissionStatuses({ notification: state });
    return state;
  }

  async function requestPersistentStorage() {
    let state = 'unsupported';
    try {
      if (!navigator.storage?.persist) throw new Error('unsupported');
      state = await navigator.storage.persist() ? 'granted' : 'denied';
      showToast(state === 'granted' ? 'Włączono trwałe przechowywanie danych.' : 'Przeglądarka nie przyznała trwałego przechowywania.', state === 'granted' ? 'success' : 'error');
    } catch (error) {
      state = 'unsupported';
      showToast('Trwałe przechowywanie nie jest obsługiwane.', 'error');
    }
    await updatePermissionStatuses({ storage: state });
    return state;
  }

  async function readMicrophonePermission() {
    try {
      if (!navigator.permissions?.query) return navigator.mediaDevices?.getUserMedia ? 'prompt' : 'unsupported';
      const result = await navigator.permissions.query({ name: 'microphone' });
      return result.state;
    } catch {
      return navigator.mediaDevices?.getUserMedia ? 'prompt' : 'unsupported';
    }
  }

  async function readStoragePermission() {
    try {
      if (!navigator.storage?.persisted) return 'unsupported';
      return await navigator.storage.persisted() ? 'granted' : 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  function permissionText(state) {
    return ({ granted: 'Zezwolono', denied: 'Zablokowano', prompt: 'Wymaga zgody', default: 'Wymaga zgody', unsupported: 'Brak obsługi' })[state] || 'Nie sprawdzono';
  }

  function setPermissionLabel(node, state) {
    if (!node) return;
    node.textContent = permissionText(state);
    node.dataset.state = state;
  }

  async function updatePermissionStatuses(overrides = {}) {
    const microphone = overrides.microphone || await readMicrophonePermission();
    const notification = overrides.notification || (('Notification' in window) ? Notification.permission : 'unsupported');
    const storage = overrides.storage || await readStoragePermission();
    [el['permission-microphone-status'], el['microphone-permission-settings']].forEach((node) => setPermissionLabel(node, microphone));
    [el['permission-notification-status'], el['notification-permission-settings'], el['notification-permission-status']].forEach((node) => setPermissionLabel(node, notification));
    [el['permission-storage-status'], el['storage-permission-settings']].forEach((node) => setPermissionLabel(node, storage));
    if (el['request-notification-button']) el['request-notification-button'].disabled = notification === 'granted' || notification === 'unsupported' || notification === 'denied';
    if (el['test-notification-button']) el['test-notification-button'].disabled = notification !== 'granted';
    if (el['permission-microphone-button']) el['permission-microphone-button'].disabled = microphone === 'granted' || microphone === 'unsupported' || microphone === 'denied';
    if (el['permission-notification-button']) el['permission-notification-button'].disabled = notification === 'granted' || notification === 'unsupported' || notification === 'denied';
    if (el['permission-storage-button']) el['permission-storage-button'].disabled = storage === 'granted' || storage === 'unsupported';
  }

  function todayHasEntry() {
    const today = localDateISO();
    return data.entries.some((entry) => entry.date === today);
  }

  function reminderBody() {
    const suggestion = getSuggestedPlace();
    const ampouleInfo = getAmpouleInfo();
    const ampouleText = ampouleNotificationText(ampouleInfo);
    return `Dzisiaj: ${formatPlace(suggestion.side, suggestion.site)}. Dawka: ${formatDose(data.settings.defaultDose)} ${data.settings.unit}.${ampouleText ? ` ${ampouleText}` : ''}`;
  }

  async function showReminderNotification({ test = false } = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    let registration = serviceWorkerRegistration;
    if (!registration && 'serviceWorker' in navigator) {
      try { registration = await navigator.serviceWorker.ready; } catch { registration = null; }
    }
    const title = test ? 'Test przypomnienia' : 'Czas na zastrzyk';
    const options = {
      body: reminderBody(),
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: test ? 'gh-reminder-test' : `gh-reminder-${localDateISO()}`,
      renotify: false,
      requireInteraction: false,
      data: { url: './#today' }
    };
    if (registration?.showNotification) await registration.showNotification(title, options);
    else new Notification(title, options);
    if (!test) {
      data.meta.lastReminderDate = localDateISO();
      persistData({ notifyError: false });
    }
    return true;
  }

  async function testReminderNotification() {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') return;
    }
    await showReminderNotification({ test: true });
    showToast('Wysłano testowe powiadomienie.', 'success');
  }

  function checkReminderDue() {
    if (!data.settings.reminderEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const today = localDateISO();
    if (todayHasEntry() || data.meta.lastReminderDate === today) return;
    if (localTime() >= (data.settings.reminderTime || '21:00')) showReminderNotification();
  }

  function scheduleDailyReminder() {
    if (reminderTimer) window.clearTimeout(reminderTimer);
    reminderTimer = null;
    if (!data.settings.reminderEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const [hour, minute] = (data.settings.reminderTime || '21:00').split(':').map(Number);
    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target <= now || todayHasEntry() || data.meta.lastReminderDate === localDateISO()) target.setDate(target.getDate() + 1);
    const delay = Math.max(1000, target.getTime() - now.getTime());
    reminderTimer = window.setTimeout(async () => {
      checkReminderDue();
      scheduleDailyReminder();
    }, Math.min(delay, 2147483647));
  }

  async function syncReminderStateWithServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = serviceWorkerRegistration || await navigator.serviceWorker.ready;
      const suggestion = getSuggestedPlace();
      registration.active?.postMessage({
        type: 'REMINDER_STATE',
        payload: {
          enabled: Boolean(data.settings.reminderEnabled),
          time: data.settings.reminderTime || '21:00',
          lastReminderDate: data.meta.lastReminderDate || '',
          today: localDateISO(),
          todayHasEntry: todayHasEntry(),
          body: reminderBody(),
          url: './#today',
          suggestion: formatPlace(suggestion.side, suggestion.site)
        }
      });
    } catch (error) {
      console.warn('Nie udało się przekazać ustawień przypomnienia:', error);
    }
  }

  async function registerPeriodicReminder() {
    if (!('Notification' in window) || !serviceWorkerRegistration?.periodicSync || !data.settings.reminderEnabled || Notification.permission !== 'granted') return;
    try {
      await serviceWorkerRegistration.periodicSync.register('daily-injection-reminder', { minInterval: 6 * 60 * 60 * 1000 });
    } catch (error) {
      console.info('Okresowa praca w tle nie została przyznana:', error);
    }
  }

  function configureSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognition = new SpeechRecognition();
    recognition.lang = 'pl-PL';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.addEventListener('start', () => {
      isListening = true;
      el['voice-button'].classList.add('is-listening');
      el['voice-button'].setAttribute('aria-pressed', 'true');
      el['voice-button'].querySelector('.voice-button-label').textContent = 'Słucham…';
      announce('Rozpoznawanie głosu uruchomione.');
    });

    recognition.addEventListener('end', () => {
      isListening = false;
      el['voice-button'].classList.remove('is-listening');
      el['voice-button'].setAttribute('aria-pressed', 'false');
      el['voice-button'].querySelector('.voice-button-label').textContent = 'Powiedz miejsce';
    });

    recognition.addEventListener('result', (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) processVoiceCommand(transcript);
    });

    recognition.addEventListener('error', (event) => {
      const messages = {
        'not-allowed': 'Brak dostępu do mikrofonu. Zezwól przeglądarce na jego użycie.',
        'audio-capture': 'Nie wykryto mikrofonu.',
        'no-speech': 'Nie rozpoznano mowy. Spróbuj ponownie.',
        network: 'Rozpoznawanie głosu wymaga połączenia obsługiwanego przez przeglądarkę.'
      };
      showToast(messages[event.error] || 'Nie udało się rozpoznać polecenia.', 'error');
    });
  }

  function toggleVoiceRecognition() {
    if (!recognition) {
      showToast('Ta przeglądarka nie udostępnia rozpoznawania mowy. Użyj wpisu ręcznego.', 'error');
      return;
    }
    if (isListening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch (error) {
      console.warn(error);
    }
  }

  function stopVoiceRecognition() {
    if (recognition && isListening) recognition.stop();
  }

  function processVoiceCommand(transcript) {
    const normalized = normalizeText(transcript);
    lastRecognizedText = transcript;

    if (/\b(anuluj|nie zapisuj|wyczysc)\b/.test(normalized)) {
      resetQuickDraftForToday();
      renderToday();
      showToast('Anulowano przygotowane zmiany.');
      speakIfEnabled('Anulowano.');
      return;
    }

    if (/\b(zapisz|potwierdz|tak)\b/.test(normalized) && (quickDraft.status === 'skipped' || (quickDraft.side && quickDraft.site))) {
      saveQuickDraft();
      return;
    }

    if (/\b(kalendarz|pokaz kalendarz)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      switchView('calendar');
      speakIfEnabled('Otwieram kalendarz.');
      return;
    }
    if (/\b(historia|pokaz historie|ostatni zastrzyk)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      switchView('history');
      speakIfEnabled('Otwieram historię.');
      return;
    }
    if (/\b(ustawienia|wiecej)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      switchView('more');
      speakIfEnabled('Otwieram ustawienia.');
      return;
    }
    if (/\b(dzisiaj|strona glowna)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      resetQuickDraftForToday();
      switchView('today');
      return;
    }
    if (/\b(popraw|edytuj|wpisz recznie)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      openEntryDialog(quickDraft.id || null, quickDraft);
      return;
    }

    const parsed = parseVoiceEntry(normalized);
    if (!Object.keys(parsed).length) {
      showToast('Nie rozpoznano daty, dawki ani miejsca wkłucia.', 'error');
      speakIfEnabled('Nie rozpoznano polecenia.');
      return;
    }
    applyVoiceEntryToDraft(parsed);
    quickDraftTouched = true;
    renderToday();

    if (quickDraft.status === 'skipped') {
      const message = `Rozpoznano pominięcie dawki ${formatDateSpeech(quickDraft.date)}.`;
      showToast(`${message} Potwierdź przyciskiem „Zapisz” lub powiedz „zapisz”.`, 'success');
      speakIfEnabled(`${message} Powiedz zapisz, aby potwierdzić.`);
      if (!data.settings.voiceConfirm) saveQuickDraft();
      return;
    }

    if (!quickDraft.side || !quickDraft.site) {
      const missing = !quickDraft.side && !quickDraft.site ? 'stronę i miejsce' : (!quickDraft.side ? 'stronę' : 'miejsce');
      const message = `Rozpoznano częściowo. Data wpisu: ${formatDateSpeech(quickDraft.date)}. Podaj jeszcze ${missing}.`;
      showToast(message, 'error');
      speakIfEnabled(message);
      return;
    }

    const message = `Rozpoznano ${formatPlace(quickDraft.side, quickDraft.site)}, dawka ${formatDose(quickDraft.dose)} ${quickDraft.unit}, ${formatDateSpeech(quickDraft.date)}.`;
    showToast(`${message} Potwierdź zapis.`, 'success');
    speakIfEnabled(`${message} Powiedz zapisz, aby potwierdzić.`);
    if (!data.settings.voiceConfirm) saveQuickDraft();
  }

  function applyVoiceEntryToDraft(parsed) {
    let base = quickDraft;
    if (parsed.date && parsed.date !== quickDraft.date) {
      const existing = getEntryForDate(parsed.date);
      base = existing
        ? { ...existing }
        : createDefaultDraft({ date: parsed.date, time: parsed.time || localTime() });
    }
    quickDraft = { ...base, ...parsed };

    if (parsed.status === 'skipped') {
      quickDraft.dose = '';
      quickDraft.unit = '';
      quickDraft.side = '';
      quickDraft.site = '';
      return;
    }

    if (parsed.status === 'given') {
      quickDraft.status = 'given';
      if (!quickDraft.dose) quickDraft.dose = data.settings.defaultDose;
      if (!quickDraft.unit) quickDraft.unit = data.settings.unit;
    }
  }

  function parseVoiceEntry(normalized) {
    const now = new Date();
    const result = {};
    const date = parseDateFromSpeech(normalized, now);
    const time = parseTimeFromSpeech(normalized);
    if (date) result.date = date;
    if (time) result.time = time;

    const skipped = /\b(pomin|pomini|nie podano|bez dawki)\w*/.test(normalized);
    if (skipped) result.status = 'skipped';

    if (/\blew\w*/.test(normalized)) result.side = 'lewa';
    else if (/\bpraw\w*/.test(normalized)) result.side = 'prawa';

    if (/brzuch|brzusz/.test(normalized)) result.site = 'brzuch';
    else if (/\budo\b|\buda\b|\bnog\w*/.test(normalized)) result.site = 'udo';
    else if (/ramie|ramienia/.test(normalized)) result.site = 'ramię';
    else if (/poslad/.test(normalized)) result.site = 'pośladek';
    else if (/lopatk/.test(normalized)) result.site = 'łopatka';

    const dose = parseDoseFromSpeech(normalized);
    if (dose) result.dose = dose;
    if (!skipped && (result.side || result.site || result.dose)) result.status = 'given';
    return result;
  }

  function parseDateFromSpeech(text, now = new Date()) {
    if (/przedwczoraj/.test(text)) {
      const date = new Date(now); date.setDate(date.getDate() - 2); return localDateISO(date);
    }
    if (/wczoraj/.test(text)) {
      const date = new Date(now); date.setDate(date.getDate() - 1); return localDateISO(date);
    }
    if (/dzis/.test(text)) return localDateISO(now);

    const numeric = text.match(/\b(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?\b/);
    if (numeric) {
      const day = Number(numeric[1]);
      const month = Number(numeric[2]);
      let year = numeric[3] ? Number(numeric[3]) : now.getFullYear();
      if (year < 100) year += 2000;
      if (isValidDateParts(year, month, day)) return datePartsToISO(year, month, day);
    }

    const monthPattern = Object.keys(MONTHS_NORMALIZED).join('|');
    const words = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthPattern})(?:\\s+(\\d{4}))?\\b`));
    if (words) {
      const day = Number(words[1]);
      const month = MONTHS_NORMALIZED[words[2]] + 1;
      const year = words[3] ? Number(words[3]) : now.getFullYear();
      if (isValidDateParts(year, month, day)) return datePartsToISO(year, month, day);
    }
    return '';
  }

  function parseTimeFromSpeech(text) {
    const match = text.match(/(?:godzina|godzine|\bo)\s+(\d{1,2})(?:(?::|\s)(\d{2}))?\b/);
    if (!match) return '';
    const hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    if (hour > 23 || minute > 59) return '';
    return `${pad(hour)}:${pad(minute)}`;
  }

  function parseDoseFromSpeech(text) {
    const numeric = text.match(/dawk\w*\s+(\d+(?:[.,]\d+)?)/);
    if (numeric) return normalizeDose(numeric[1]);

    const wordMatch = text.match(/dawk\w*\s+([a-z\s]+?)(?=\s+(?:lew|praw|brzuch|udo|nog|ramie|poslad|lopatk|dzis|wczoraj|godzin)|$)/);
    if (!wordMatch) return '';
    const phrase = wordMatch[1].trim();
    const numberWords = {
      zero: '0', jeden: '1', jedna: '1', jedno: '1', dwa: '2', dwie: '2', trzy: '3', cztery: '4',
      piec: '5', szesc: '6', siedem: '7', osiem: '8', dziewiec: '9', dziesiec: '10'
    };
    const parts = phrase.split(/\s+(?:przecinek|kropka)\s+/);
    const left = numberWords[parts[0]] ?? '';
    if (!left) return '';
    if (parts.length === 1) return `${left},0`;
    const rightTokens = parts[1].split(/\s+/).map((token) => numberWords[token]).filter((token) => token !== undefined);
    return rightTokens.length ? `${left},${rightTokens.join('')}` : '';
  }

  function containsInjectionDetails(text) {
    return /brzuch|udo|nog|ramie|poslad|lopatk|dawk|pomin|lew\w*|praw\w*/.test(text);
  }

  function speakIfEnabled(text) {
    if (!data.settings.voiceFeedback || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pl-PL';
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function handleGlobalKeyboard(event) {
    const key = event.key.toLowerCase();
    const targetIsField = event.target.matches('input, textarea, select, [contenteditable="true"]');

    if (event.key === 'Escape') {
      if (el['entry-dialog'].open) closeEntryDialog();
      else if (el['permissions-dialog'].open && data.meta.onboardingCompleted) el['permissions-dialog'].close();
      else stopVoiceRecognition();
      return;
    }

    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const viewMap = { '1': 'today', '2': 'calendar', '3': 'history', '4': 'more' };
      if (viewMap[event.key]) {
        event.preventDefault();
        switchView(viewMap[event.key]);
        return;
      }
      if (key === 'm') {
        event.preventDefault();
        switchView('today');
        toggleVoiceRecognition();
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        openEntryForDate(localDateISO());
        return;
      }
      if (key === 'p') {
        event.preventDefault();
        exportPdf();
        return;
      }
      if (key === 'w') {
        event.preventDefault();
        exportWord();
        return;
      }
    }

    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      if (el['entry-dialog'].open) el['entry-form'].requestSubmit();
      else if (!el['save-button'].disabled) saveQuickDraft();
      return;
    }

    if (!targetIsField && key === '/' && activeView === 'history') {
      event.preventDefault();
      el['history-search'].focus();
    }
  }

  function installPwa() {
    if (!deferredInstallPrompt) {
      showToast('Opcja instalacji pojawi się w obsługiwanej przeglądarce po otwarciu aplikacji przez HTTPS.');
      return;
    }
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      deferredInstallPrompt = null;
      updateOnlineInstallState();
    });
  }

  function updateOnlineInstallState() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const visible = Boolean(deferredInstallPrompt) && !standalone;
    [el['header-install-button'], el['desktop-install-button'], el['settings-install-button']].forEach((button) => {
      button.classList.toggle('is-hidden', !visible);
    });
  }

  async function loadVersion() {
    try {
      const response = await fetch('./app-version.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Brak pliku wersji');
      const version = await response.json();
      el['version-label'].textContent = `Wersja ${version.version}`;
    } catch (error) {
      el['version-label'].textContent = 'Wersja 1.2';
    }
  }

  async function readReminderStateFromServiceWorker() {
    if (!serviceWorkerRegistration?.active || !('MessageChannel' in window)) return null;
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => resolve(null), 1200);
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        resolve(event.data || null);
      };
      serviceWorkerRegistration.active.postMessage({ type: 'GET_REMINDER_STATE' }, [channel.port2]);
    });
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register('./service-worker.js');
      serviceWorkerRegistration = await navigator.serviceWorker.ready;
      const workerState = await readReminderStateFromServiceWorker();
      if (workerState?.lastReminderDate && workerState.lastReminderDate > (data.meta.lastReminderDate || '')) {
        data.meta.lastReminderDate = workerState.lastReminderDate;
        persistData({ notifyError: false });
      }
      await syncReminderStateWithServiceWorker();
      await registerPeriodicReminder();
      return serviceWorkerRegistration;
    } catch (error) {
      console.warn('Nie udało się zarejestrować service workera:', error);
      return null;
    }
  }

  function getEntriesAscending() {
    return [...data.entries].sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`));
  }

  function getEntriesSorted() {
    return [...data.entries].sort((a, b) => `${b.date}T${b.time || '00:00'}`.localeCompare(`${a.date}T${a.time || '00:00'}`));
  }

  function groupEntriesByDate() {
    const map = new Map();
    data.entries.forEach((entry) => {
      if (!map.has(entry.date)) map.set(entry.date, []);
      map.get(entry.date).push(entry);
    });
    return map;
  }

  function formatPlace(side, site) {
    if (!side || !site) return 'nie wybrano';
    const adjectives = {
      brzuch: side === 'lewa' ? 'lewy' : 'prawy',
      udo: side === 'lewa' ? 'lewe' : 'prawe',
      'ramię': side === 'lewa' ? 'lewe' : 'prawe',
      'pośladek': side === 'lewa' ? 'lewy' : 'prawy',
      'łopatka': side === 'lewa' ? 'lewa' : 'prawa'
    };
    return `${adjectives[site] || side} ${SITE_LABELS[site] || site}`;
  }

  function formatDose(value) {
    return String(value ?? '').replace('.', ',');
  }

  function normalizeDose(value) {
    const cleaned = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return '';
    const number = Number(cleaned);
    if (!Number.isFinite(number) || number <= 0 || number > 1000) return '';
    return cleaned.replace('.', ',');
  }

  function normalizeAmpouleNumber(value) {
    const number = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(number) && number >= 1 && number <= 999 ? number : 1;
  }

  function normalizePositiveDecimal(value) {
    const normalized = normalizeDose(value);
    if (!normalized) return '';
    const number = decimalToNumber(normalized);
    if (!Number.isFinite(number) || number <= 0 || number > 1000) return '';
    return normalized;
  }

  function normalizeOptionalPositiveDecimal(value) {
    return String(value ?? '').trim() ? normalizePositiveDecimal(value) : '';
  }

  function decimalToNumber(value) {
    const number = Number(String(value ?? '').trim().replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function formatDateShort(iso) {
    const date = parseISODate(iso);
    return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  function formatDateLong(iso) {
    const date = parseISODate(iso);
    return new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }

  function formatDateSpeech(iso) {
    if (iso === localDateISO()) return 'dzisiaj';
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (iso === localDateISO(yesterday)) return 'wczoraj';
    const date = parseISODate(iso);
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  }

  function localDateISO(date = new Date()) {
    return datePartsToISO(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function localTime(date = new Date()) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function datePartsToISO(year, month, day) {
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  function parseISODate(iso) {
    const [year, month, day] = String(iso).split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function isValidDateParts(year, month, day) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
  }

  function mondayIndex(jsDay) {
    return (jsDay + 6) % 7;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[!?;,]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function plural(number, one, few, many) {
    if (number === 1) return one;
    const last = number % 10;
    const lastTwo = number % 100;
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
    return many;
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function csvCell(value) {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
  }

  function downloadFile(filename, content, type) {
    downloadBlob(filename, new Blob([content], { type }));
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showToast(message, type = '', duration = 4200) {
    const toast = document.createElement('div');
    toast.className = `toast${type ? ` toast--${type}` : ''}`;
    toast.textContent = message;
    el['toast-region'].appendChild(toast);
    window.setTimeout(() => toast.remove(), duration);
  }

  function announce(message) {
    el['live-region'].textContent = '';
    window.setTimeout(() => { el['live-region'].textContent = message; }, 20);
  }
})();
