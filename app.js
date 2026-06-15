(() => {
  'use strict';

  const STORAGE_KEY = 'dzienniczek-hormonu-wzrostu-v1';
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
    version: 1,
    settings: {
      defaultDose: '1,0',
      unit: 'mg',
      defaultTime: '20:00',
      voiceFeedback: false,
      voiceConfirm: true
    },
    entries: []
  };

  let data = loadData();
  let activeView = 'today';
  let selectedCalendarDate = localDateISO();
  let calendarCursor = startOfMonth(new Date());
  let deferredInstallPrompt = null;
  let recognition = null;
  let isListening = false;
  let lastRecognizedText = '';
  let quickDraft = createDefaultDraft();

  const el = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindEvents();
    configureSpeechRecognition();
    updateCurrentDateHeader();
    loadVersion();
    renderAll();
    registerServiceWorker();
    updateOnlineInstallState();
  }

  function cacheElements() {
    const ids = [
      'current-date-label', 'today-dose', 'today-time', 'today-status-heading', 'today-status-badge',
      'voice-button', 'voice-result', 'voice-result-text', 'selected-place', 'save-button', 'edit-button',
      'skip-button', 'last-place', 'suggested-place', 'use-suggestion-button', 'mini-calendar', 'recent-list',
      'quick-add-button', 'dose-chip', 'time-chip', 'place-field', 'entry-dialog', 'entry-form',
      'entry-dialog-title', 'entry-id', 'entry-date', 'entry-time', 'entry-dose', 'entry-unit', 'entry-side',
      'entry-site', 'entry-status', 'entry-note', 'delete-entry-button', 'dialog-close-button',
      'dialog-cancel-button', 'toast-region', 'live-region', 'calendar-prev', 'calendar-next',
      'calendar-month-label', 'calendar-grid', 'selected-day-label', 'selected-day-entries',
      'add-for-selected-day', 'history-search', 'status-filter', 'site-filter', 'history-table-body',
      'history-empty', 'settings-dose', 'settings-unit', 'settings-time', 'voice-feedback-toggle',
      'voice-confirm-toggle', 'save-settings-button', 'export-json-button', 'export-csv-button',
      'import-button', 'import-file', 'clear-data-button', 'header-install-button', 'desktop-install-button',
      'settings-install-button', 'version-label'
    ];
    ids.forEach((id) => { el[id] = document.getElementById(id); });
  }

  function bindEvents() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => switchView(button.dataset.view));
    });

    document.querySelectorAll('[data-open-entry]').forEach((button) => {
      button.addEventListener('click', () => openEntryDialog());
    });

    el['quick-add-button'].addEventListener('click', () => openEntryDialog());
    el['edit-button'].addEventListener('click', () => openEntryDialog(null, quickDraft));
    el['place-field'].addEventListener('click', () => openEntryDialog(null, quickDraft));
    el['dose-chip'].addEventListener('click', () => openEntryDialog(null, quickDraft, 'entry-dose'));
    el['time-chip'].addEventListener('click', () => openEntryDialog(null, quickDraft, 'entry-time'));
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
    el['add-for-selected-day'].addEventListener('click', () => openEntryDialog(null, { date: selectedCalendarDate }));
    el['calendar-grid'].addEventListener('keydown', handleCalendarKeydown);

    [el['history-search'], el['status-filter'], el['site-filter']].forEach((control) => {
      control.addEventListener('input', renderHistory);
      control.addEventListener('change', renderHistory);
    });
    el['history-table-body'].addEventListener('click', handleHistoryAction);
    el['selected-day-entries'].addEventListener('click', handleDayDetailsAction);

    el['save-settings-button'].addEventListener('click', saveSettings);
    el['export-json-button'].addEventListener('click', exportJson);
    el['export-csv-button'].addEventListener('click', exportCsv);
    el['import-button'].addEventListener('click', () => el['import-file'].click());
    el['import-file'].addEventListener('change', importJson);
    el['clear-data-button'].addEventListener('click', clearAllEntries);

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
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        data = loadData();
        quickDraft = createDefaultDraft();
        renderAll();
        showToast('Dane odświeżono z innej karty.', 'success');
      }
    });
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredCloneSafe(defaultData);
      const parsed = JSON.parse(raw);
      return {
        version: 1,
        settings: { ...defaultData.settings, ...(parsed.settings || {}) },
        entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isValidEntry) : []
      };
    } catch (error) {
      console.error('Nie udało się odczytać danych:', error);
      return structuredCloneSafe(defaultData);
    }
  }

  function persistData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function structuredCloneSafe(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function isValidEntry(entry) {
    return entry && typeof entry.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date || '');
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
    const todaysEntries = getEntriesSorted().filter((entry) => entry.date === today);
    const latestToday = todaysEntries[0];

    el['today-dose'].textContent = `${formatDose(quickDraft.dose)} ${quickDraft.unit}`;
    el['today-time'].textContent = quickDraft.time;
    el['selected-place'].textContent = quickDraft.status === 'skipped'
      ? 'Dawka pominięta'
      : (quickDraft.side && quickDraft.site ? formatPlace(quickDraft.side, quickDraft.site) : 'Nie wybrano');

    const ready = quickDraft.status === 'skipped' || Boolean(quickDraft.side && quickDraft.site && normalizeDose(quickDraft.dose));
    el['save-button'].disabled = !ready;

    if (latestToday) {
      el['today-status-badge'].className = `status-badge status-badge--${latestToday.status}`;
      el['today-status-badge'].textContent = latestToday.status === 'given' ? 'Podano' : 'Pominięto';
      el['today-status-heading'].textContent = latestToday.status === 'given'
        ? `Zapisano o ${latestToday.time}`
        : 'Dawka oznaczona jako pominięta';
    } else {
      el['today-status-badge'].className = 'status-badge status-badge--neutral';
      el['today-status-badge'].textContent = 'Brak wpisu';
      el['today-status-heading'].textContent = ready ? 'Sprawdź i zapisz' : 'Gotowe do zapisania';
    }

    if (lastRecognizedText) {
      el['voice-result'].classList.remove('is-hidden');
      el['voice-result-text'].textContent = lastRecognizedText;
    } else {
      el['voice-result'].classList.add('is-hidden');
      el['voice-result-text'].textContent = '';
    }

    const latestGiven = getEntriesSorted().find((entry) => entry.status === 'given' && entry.side && entry.site);
    el['last-place'].textContent = latestGiven
      ? `${formatPlace(latestGiven.side, latestGiven.site)} · ${formatDateShort(latestGiven.date)}`
      : 'Brak wcześniejszych wpisów';

    const suggestion = getSuggestedPlace();
    el['suggested-place'].textContent = capitalize(formatPlace(suggestion.side, suggestion.site));
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
      const markers = entries.slice(0, 4).map((entry) => `<i class="day-marker day-marker--${entry.status}" aria-hidden="true"></i>`).join('');
      const statusText = entries.length ? `, ${entries.length} ${plural(entries.length, 'wpis', 'wpisy', 'wpisów')}` : ', brak wpisów';
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
    const entries = getEntriesSorted().filter((entry) => entry.date === selectedCalendarDate);
    if (!entries.length) {
      el['selected-day-entries'].innerHTML = '<div class="empty-state"><strong>Brak wpisu</strong><span>W tym dniu nie zapisano podania.</span></div>';
      return;
    }
    el['selected-day-entries'].innerHTML = entries.map((entry) => `
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
    `).join('');
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
    el['voice-feedback-toggle'].checked = Boolean(data.settings.voiceFeedback);
    el['voice-confirm-toggle'].checked = Boolean(data.settings.voiceConfirm);
  }

  function switchView(view) {
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
    document.getElementById(`view-${view}`)?.querySelector('h1, [tabindex]')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateNavigation() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === activeView;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function openEntryDialog(entryId = null, draftOverride = null, focusId = null) {
    const entry = entryId ? data.entries.find((item) => item.id === entryId) : null;
    const source = entry
      ? { ...entry }
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
    const entry = {
      id: el['entry-id'].value || createId(),
      date: el['entry-date'].value,
      time: el['entry-time'].value,
      dose: normalizeDose(el['entry-dose'].value) || data.settings.defaultDose,
      unit: el['entry-unit'].value,
      side: el['entry-status'].value === 'given' ? el['entry-side'].value : '',
      site: el['entry-status'].value === 'given' ? el['entry-site'].value : '',
      status: el['entry-status'].value,
      note: el['entry-note'].value.trim(),
      createdAt: new Date().toISOString()
    };

    if (!entry.date || !entry.time) {
      showToast('Podaj datę i godzinę.', 'error');
      return;
    }
    if (entry.status === 'given' && (!entry.side || !entry.site || !entry.dose)) {
      showToast('Uzupełnij dawkę, stronę i miejsce wkłucia.', 'error');
      return;
    }

    const existingIndex = data.entries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) data.entries[existingIndex] = entry;
    else data.entries.push(entry);
    persistData();
    closeEntryDialog();
    quickDraft = createDefaultDraft();
    lastRecognizedText = '';
    selectedCalendarDate = entry.date;
    calendarCursor = startOfMonth(parseISODate(entry.date));
    renderAll();
    showToast(existingIndex >= 0 ? 'Wpis został poprawiony.' : 'Wpis został zapisany.', 'success');
    speakIfEnabled(existingIndex >= 0 ? 'Wpis został poprawiony.' : 'Wpis został zapisany.');
  }

  function saveQuickDraft() {
    if (quickDraft.status === 'given' && (!quickDraft.side || !quickDraft.site)) {
      showToast('Najpierw wybierz lub powiedz miejsce wkłucia.', 'error');
      return;
    }

    const sameDateEntries = data.entries.filter((entry) => entry.date === quickDraft.date);
    if (sameDateEntries.length && !window.confirm('Dla tego dnia istnieje już wpis. Czy dodać kolejny?')) return;

    const entry = {
      ...quickDraft,
      id: createId(),
      dose: normalizeDose(quickDraft.dose) || data.settings.defaultDose,
      createdAt: new Date().toISOString()
    };
    data.entries.push(entry);
    persistData();
    selectedCalendarDate = entry.date;
    calendarCursor = startOfMonth(parseISODate(entry.date));
    quickDraft = createDefaultDraft();
    lastRecognizedText = '';
    renderAll();
    const message = entry.status === 'given'
      ? `Zapisano: ${formatPlace(entry.side, entry.site)}.`
      : 'Zapisano pominięcie dawki.';
    showToast(message, 'success');
    speakIfEnabled(message);
  }

  function prepareSkippedDraft() {
    quickDraft = createDefaultDraft({ status: 'skipped', side: '', site: '' });
    lastRecognizedText = 'dawka pominięta dzisiaj';
    renderToday();
    showToast('Przygotowano wpis „Pominięto”. Naciśnij Zapisz, aby potwierdzić.');
  }

  function useSuggestedPlace() {
    const suggestion = getSuggestedPlace();
    quickDraft.side = suggestion.side;
    quickDraft.site = suggestion.site;
    quickDraft.status = 'given';
    lastRecognizedText = formatPlace(suggestion.side, suggestion.site);
    renderToday();
    el['save-button'].focus();
  }

  function getSuggestedPlace() {
    const latest = getEntriesSorted().find((entry) => entry.status === 'given' && entry.side && entry.site);
    if (!latest) return { side: ROTATION[0][0], site: ROTATION[0][1] };
    const index = ROTATION.findIndex(([side, site]) => side === latest.side && site === latest.site);
    const next = ROTATION[(index + 1 + ROTATION.length) % ROTATION.length];
    return { side: next[0], site: next[1] };
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
    persistData();
    if (closeDialogAfter) closeEntryDialog();
    renderAll();
    showToast('Wpis został usunięty.', 'success');
  }

  function saveSettings() {
    const dose = normalizeDose(el['settings-dose'].value);
    if (!dose) {
      showToast('Podaj prawidłową dawkę domyślną.', 'error');
      return;
    }
    data.settings.defaultDose = dose;
    data.settings.unit = el['settings-unit'].value;
    data.settings.defaultTime = el['settings-time'].value || '20:00';
    data.settings.voiceFeedback = el['voice-feedback-toggle'].checked;
    data.settings.voiceConfirm = el['voice-confirm-toggle'].checked;
    persistData();
    quickDraft = createDefaultDraft();
    renderAll();
    showToast('Ustawienia zostały zapisane.', 'success');
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
    const header = ['Data', 'Godzina', 'Dawka', 'Jednostka', 'Strona', 'Miejsce', 'Status', 'Uwagi'];
    const rows = getEntriesSorted().map((entry) => [
      entry.date, entry.time, entry.status === 'given' ? formatDose(entry.dose) : '', entry.unit,
      entry.side, entry.site, entry.status === 'given' ? 'Podano' : 'Pominięto', entry.note || ''
    ]);
    const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    downloadFile(`dzienniczek-historia-${localDateISO()}.csv`, csv, 'text/csv;charset=utf-8');
    showToast('Pobrano historię CSV.', 'success');
  }

  async function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = parsed.data || parsed;
      if (!imported || !Array.isArray(imported.entries)) throw new Error('Nieprawidłowa struktura pliku.');
      const validEntries = imported.entries.filter(isValidEntry);
      if (!window.confirm(`Import zawiera ${validEntries.length} ${plural(validEntries.length, 'wpis', 'wpisy', 'wpisów')}. Zastąpić obecne dane?`)) return;
      data = {
        version: 1,
        settings: { ...defaultData.settings, ...(imported.settings || {}) },
        entries: validEntries
      };
      persistData();
      quickDraft = createDefaultDraft();
      renderAll();
      showToast('Kopia została zaimportowana.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Nie udało się zaimportować pliku JSON.', 'error');
    }
  }

  function clearAllEntries() {
    if (!data.entries.length) {
      showToast('Historia jest już pusta.');
      return;
    }
    if (!window.confirm('Usunąć wszystkie wpisy? Tej operacji nie można cofnąć.')) return;
    data.entries = [];
    persistData();
    quickDraft = createDefaultDraft();
    lastRecognizedText = '';
    renderAll();
    showToast('Wszystkie wpisy zostały usunięte.', 'success');
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
      quickDraft = createDefaultDraft();
      lastRecognizedText = '';
      renderToday();
      showToast('Anulowano przygotowany wpis.');
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
      switchView('today');
      return;
    }
    if (/\b(popraw|edytuj|wpisz recznie)\b/.test(normalized) && !containsInjectionDetails(normalized)) {
      openEntryDialog(null, quickDraft);
      return;
    }

    const parsed = parseVoiceEntry(normalized);
    quickDraft = { ...quickDraft, ...parsed };
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
      const message = `Rozpoznano częściowo. Podaj jeszcze ${missing}.`;
      showToast(message, 'error');
      speakIfEnabled(message);
      return;
    }

    const message = `Rozpoznano ${formatPlace(quickDraft.side, quickDraft.site)}, dawka ${formatDose(quickDraft.dose)} ${quickDraft.unit}, ${formatDateSpeech(quickDraft.date)}.`;
    showToast(`${message} Potwierdź zapis.`, 'success');
    speakIfEnabled(`${message} Powiedz zapisz, aby potwierdzić.`);
    if (!data.settings.voiceConfirm) saveQuickDraft();
  }

  function parseVoiceEntry(normalized) {
    const now = new Date();
    const result = {
      date: parseDateFromSpeech(normalized, now),
      time: parseTimeFromSpeech(normalized) || localTime(now),
      status: /\b(pomin|pomini|nie podano|bez dawki)\w*/.test(normalized) ? 'skipped' : 'given'
    };

    if (/\blew\w*/.test(normalized)) result.side = 'lewa';
    else if (/\bpraw\w*/.test(normalized)) result.side = 'prawa';

    if (/brzuch|brzusz/.test(normalized)) result.site = 'brzuch';
    else if (/\budo\b|\buda\b|\bnog\w*/.test(normalized)) result.site = 'udo';
    else if (/ramie|ramienia/.test(normalized)) result.site = 'ramię';
    else if (/poslad/.test(normalized)) result.site = 'pośladek';
    else if (/lopatk/.test(normalized)) result.site = 'łopatka';

    const dose = parseDoseFromSpeech(normalized);
    if (dose) result.dose = dose;
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
    return localDateISO(now);
  }

  function parseTimeFromSpeech(text) {
    const match = text.match(/(?:godzina|godzine|\bo)\s+(\d{1,2})(?::|\s)(\d{2})\b/);
    if (!match) return '';
    const hour = Number(match[1]);
    const minute = Number(match[2]);
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
        openEntryDialog();
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
      el['version-label'].textContent = 'Wersja 1.0';
    }
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((error) => {
        console.warn('Nie udało się zarejestrować service workera:', error);
      });
    });
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
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function showToast(message, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast${type ? ` toast--${type}` : ''}`;
    toast.textContent = message;
    el['toast-region'].appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  function announce(message) {
    el['live-region'].textContent = '';
    window.setTimeout(() => { el['live-region'].textContent = message; }, 20);
  }
})();
