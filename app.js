/* app.js — DiaryWell main controller.
   Wires the UI, IndexedDB, charts, and PDF builder together.
*/
(function () {
  'use strict';

  var DB = window.DiaryDB;
  var UI = window.DiaryUI;
  var Chart = window.DiaryChart;
  var Report = window.DiaryReport;

  /* ---------- Defaults ---------- */

  var DEFAULT_SYMPTOMS = [
    { name: 'Headache', color: 'rose' },
    { name: 'Nausea', color: 'amber' },
    { name: 'Fatigue', color: 'violet' },
    { name: 'Dizziness', color: 'teal' },
    { name: 'Joint pain', color: 'rose' },
    { name: 'Brain fog', color: 'violet' },
    { name: 'Anxiety', color: 'sky' },
    { name: 'Low mood', color: 'sky' }
  ];

  var DEFAULT_TRIGGERS = [
    { name: 'Poor sleep', color: 'violet' },
    { name: 'Stress', color: 'rose' },
    { name: 'Weather change', color: 'teal' },
    { name: 'Missed meal', color: 'amber' },
    { name: 'Alcohol', color: 'amber' },
    { name: 'Caffeine', color: 'amber' },
    { name: 'Menstrual', color: 'rose' },
    { name: 'Exercise', color: 'lime' }
  ];

  var PAIN_ANCHORS = [
    'none', 'very mild', 'mild', 'mild', 'moderate',
    'moderate', 'moderate-severe', 'severe', 'severe', 'very severe', 'worst imaginable'
  ];

  /* ---------- App state ---------- */

  var state = {
    todayDate: UI.isoToday(),
    currentView: 'today',
    mood: null,
    pain: 0,
    energy: 5,
    sleepHours: null,
    sleepQuality: null,
    symptoms: new Set(),
    triggers: new Set(),
    meds: new Set(),
    medOther: '',
    note: '',
    tags: { symptom: [], trigger: [], med: [] },
    settings: {
      theme: 'system',
      largeText: false,
      reminderOn: false,
      reminderTime: '20:00',
      defaultRange: 30,
      sleepUnits: 'hours',
      pinSalt: null,
      pinHash: null
    },
    trendsRange: 30,
    deferredInstall: null,
    pinUnlocked: false
  };

  /* ---------- Boot ---------- */

  document.addEventListener('DOMContentLoaded', boot);

  function boot() {
    DB.open()
      .then(loadSettings)
      .then(applyTheme)
      .then(loadTags)
      .then(maybeSeedDefaults)
      .then(loadTags) // refresh after seed
      .then(handlePinLock)
      .then(loadTodayEntryIfAny)
      .then(setupUI)
      .then(registerSW)
      .then(setupInstallPrompt)
      .then(maybeShowOnboarding)
      .then(hideBoot)
      .catch(function (err) {
        console.warn('Boot error:', err);
        hideBoot();
        UI.toast('Something went wrong starting the app. Reload to try again.');
      });
  }

  function hideBoot() {
    var boot = document.getElementById('boot');
    if (boot) boot.hidden = true;
  }

  /* ---------- Settings ---------- */

  function loadSettings() {
    return Promise.all([
      DB.getMeta('theme', 'system'),
      DB.getMeta('largeText', false),
      DB.getMeta('reminderOn', false),
      DB.getMeta('reminderTime', '20:00'),
      DB.getMeta('defaultRange', 30),
      DB.getMeta('sleepUnits', 'hours'),
      DB.getMeta('pinSalt', null),
      DB.getMeta('pinHash', null)
    ]).then(function (vals) {
      state.settings = {
        theme: vals[0],
        largeText: !!vals[1],
        reminderOn: !!vals[2],
        reminderTime: vals[3],
        defaultRange: parseInt(vals[4], 10) || 30,
        sleepUnits: vals[5] || 'hours',
        pinSalt: vals[6],
        pinHash: vals[7]
      };
      state.trendsRange = state.settings.defaultRange;
    });
  }

  function applyTheme() {
    var theme = state.settings.theme;
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    if (state.settings.largeText) {
      document.documentElement.setAttribute('data-large', '1');
    } else {
      document.documentElement.removeAttribute('data-large');
    }
  }

  /* ---------- Tags ---------- */

  function loadTags() {
    return Promise.all([
      DB.getTagsByKind('symptom'),
      DB.getTagsByKind('trigger'),
      DB.getTagsByKind('med')
    ]).then(function (vals) {
      state.tags.symptom = vals[0];
      state.tags.trigger = vals[1];
      state.tags.med = vals[2];
    });
  }

  function maybeSeedDefaults() {
    return DB.getMeta('seeded', false).then(function (seeded) {
      if (seeded) return null;
      var ops = [];
      DEFAULT_SYMPTOMS.forEach(function (s) {
        ops.push(DB.addTag('symptom', s.name, s.color));
      });
      DEFAULT_TRIGGERS.forEach(function (s) {
        ops.push(DB.addTag('trigger', s.name, s.color));
      });
      return Promise.all(ops).then(function () { return DB.setMeta('seeded', true); });
    });
  }

  /* ---------- PIN lock ---------- */

  function handlePinLock() {
    if (!state.settings.pinHash) {
      state.pinUnlocked = true;
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      var lock = document.getElementById('pinLock');
      var input = document.getElementById('pinInput');
      var btn = document.getElementById('pinSubmit');
      var err = document.getElementById('pinError');
      lock.hidden = false;
      input.value = '';
      setTimeout(function () { input.focus(); }, 50);

      function tryUnlock() {
        var v = input.value.trim();
        if (!/^\d{4}$/.test(v)) {
          err.textContent = 'Enter your 4-digit PIN.';
          err.hidden = false;
          return;
        }
        DB.hashPin(v, state.settings.pinSalt).then(function (h) {
          if (h === state.settings.pinHash) {
            lock.hidden = true;
            state.pinUnlocked = true;
            err.hidden = true;
            resolve();
          } else {
            err.textContent = "That PIN didn't match. Try again.";
            err.hidden = false;
            input.value = '';
            input.focus();
          }
        });
      }

      btn.onclick = tryUnlock;
      input.onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
      };
    });
  }

  /* ---------- Onboarding ---------- */

  function maybeShowOnboarding() {
    return DB.getMeta('onboarded', false).then(function (done) {
      if (done) return;
      runOnboarding();
    });
  }

  function runOnboarding() {
    var modal = document.getElementById('onboarding');
    var steps = modal.querySelectorAll('.onb-step');
    var dots = modal.querySelectorAll('.onb-dot');
    var nextBtn = document.getElementById('onbNext');
    var backBtn = document.getElementById('onbBack');
    var idx = 0;
    modal.hidden = false;

    // Populate step 2 with seeded tags
    var symGrid = document.getElementById('onbSymptoms');
    var trigGrid = document.getElementById('onbTriggers');
    symGrid.innerHTML = '';
    trigGrid.innerHTML = '';
    state.tags.symptom.forEach(function (t) {
      symGrid.appendChild(buildPill(t, 'on'));
    });
    state.tags.trigger.forEach(function (t) {
      trigGrid.appendChild(buildPill(t, 'on'));
    });

    function show(i) {
      for (var s = 0; s < steps.length; s++) {
        steps[s].hidden = (s !== i);
        dots[s].classList.toggle('active', s === i);
      }
      backBtn.hidden = i === 0;
      nextBtn.textContent = (i === steps.length - 1) ? 'Start' : 'Next';
    }

    nextBtn.onclick = function () {
      if (idx === steps.length - 1) {
        // Save onboarding choices
        var disabledSyms = Array.from(symGrid.querySelectorAll('.pill:not(.on)')).map(function (p) { return p.dataset.id; });
        var disabledTrigs = Array.from(trigGrid.querySelectorAll('.pill:not(.on)')).map(function (p) { return p.dataset.id; });

        var ops = [];
        state.tags.symptom.forEach(function (t) {
          if (disabledSyms.indexOf(t.id) !== -1) {
            t.enabled = false;
            ops.push(DB.updateTag(t));
          }
        });
        state.tags.trigger.forEach(function (t) {
          if (disabledTrigs.indexOf(t.id) !== -1) {
            t.enabled = false;
            ops.push(DB.updateTag(t));
          }
        });

        var rmOn = document.getElementById('onbReminderOn').checked;
        var rmTime = document.getElementById('onbReminderTime').value || '20:00';
        ops.push(DB.setMeta('reminderOn', rmOn));
        ops.push(DB.setMeta('reminderTime', rmTime));
        ops.push(DB.setMeta('onboarded', true));
        state.settings.reminderOn = rmOn;
        state.settings.reminderTime = rmTime;

        Promise.all(ops).then(function () {
          modal.hidden = true;
          if (rmOn) requestNotificationPermission();
          loadTags().then(function () {
            renderSymptomGrid();
            renderTriggerGrid();
          });
        });
      } else {
        idx++;
        show(idx);
      }
    };
    backBtn.onclick = function () {
      if (idx > 0) { idx--; show(idx); }
    };

    // Pill toggle handlers
    [symGrid, trigGrid].forEach(function (g) {
      g.addEventListener('click', function (e) {
        var pill = e.target.closest('.pill');
        if (!pill) return;
        var on = pill.classList.toggle('on');
        pill.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });

    show(0);
  }

  /* ---------- Build pill element ---------- */

  function buildPill(tag, initialState) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill pal-' + (tag.color || 'violet');
    if (initialState === 'on') btn.classList.add('on');
    btn.dataset.id = tag.id;
    btn.setAttribute('aria-pressed', initialState === 'on' ? 'true' : 'false');
    var dot = document.createElement('span');
    dot.className = 'pill-dot';
    btn.appendChild(dot);
    var label = document.createElement('span');
    label.textContent = tag.name;
    btn.appendChild(label);
    return btn;
  }

  /* ---------- Today: load if exists ---------- */

  function loadTodayEntryIfAny() {
    return DB.getEntry(state.todayDate).then(function (e) {
      if (!e) return;
      state.mood = e.mood || null;
      state.pain = e.pain || 0;
      state.energy = e.energy != null ? e.energy : 5;
      state.sleepHours = e.sleepHours != null ? e.sleepHours : null;
      state.sleepQuality = e.sleepQuality || null;
      state.symptoms = new Set(e.symptoms || []);
      state.triggers = new Set(e.triggers || []);
      state.meds = new Set(e.meds || []);
      state.medOther = e.medOther || '';
      state.note = e.note || '';
    });
  }

  /* ---------- Set up UI ---------- */

  function setupUI() {
    // Date header
    document.getElementById('todayDate').textContent = UI.friendlyDate(state.todayDate);

    // Mood
    var moodBtns = document.querySelectorAll('.mood-face');
    moodBtns.forEach(function (b) {
      var v = parseInt(b.dataset.mood, 10);
      if (state.mood === v) b.setAttribute('aria-checked', 'true');
      b.addEventListener('click', function () {
        state.mood = v;
        moodBtns.forEach(function (x) { x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
        UI.vibrate(8);
      });
    });

    // Pain
    var painSlider = document.getElementById('painSlider');
    var painValue = document.getElementById('painValue');
    var painAnchor = document.getElementById('painAnchor');
    painSlider.value = state.pain;
    updatePainUI();
    painSlider.addEventListener('input', function () {
      state.pain = parseInt(painSlider.value, 10);
      updatePainUI();
    });
    function updatePainUI() {
      painValue.textContent = state.pain;
      painAnchor.textContent = PAIN_ANCHORS[state.pain];
      painSlider.setAttribute('aria-valuetext', state.pain + ', ' + PAIN_ANCHORS[state.pain]);
      painSlider.style.setProperty('--p', (state.pain * 10) + '%');
    }

    // Energy
    var en = document.getElementById('energySlider');
    var enVal = document.getElementById('energyValue');
    en.value = state.energy;
    updateEnergyUI();
    en.addEventListener('input', function () {
      state.energy = parseInt(en.value, 10);
      updateEnergyUI();
    });
    function updateEnergyUI() {
      enVal.textContent = state.energy;
      en.setAttribute('aria-valuetext', state.energy + ' out of 10');
      en.style.setProperty('--p', (state.energy * 10) + '%');
    }

    // Sleep
    var sleepHours = document.getElementById('sleepHours');
    sleepHours.value = state.sleepHours != null ? state.sleepHours : '';
    sleepHours.addEventListener('input', function () {
      var v = parseFloat(sleepHours.value);
      state.sleepHours = isNaN(v) ? null : v;
    });
    var stars = document.querySelectorAll('.star');
    stars.forEach(function (s) {
      var v = parseInt(s.dataset.q, 10);
      if (state.sleepQuality === v) s.setAttribute('aria-checked', 'true');
      s.addEventListener('click', function () {
        state.sleepQuality = v;
        stars.forEach(function (x) {
          var xv = parseInt(x.dataset.q, 10);
          x.setAttribute('aria-checked', xv <= v ? 'true' : 'false');
        });
      });
    });
    // Init stars visual
    stars.forEach(function (x) {
      var xv = parseInt(x.dataset.q, 10);
      if (state.sleepQuality && xv <= state.sleepQuality) x.setAttribute('aria-checked', 'true');
    });

    // Symptom / trigger / med grids
    renderSymptomGrid();
    renderTriggerGrid();
    renderMedGrid();

    document.getElementById('medOther').value = state.medOther;
    document.getElementById('medOther').addEventListener('input', function (e) {
      state.medOther = e.target.value;
    });

    document.getElementById('noteField').value = state.note;
    document.getElementById('noteField').addEventListener('input', function (e) {
      state.note = e.target.value;
    });

    // Save button
    document.getElementById('saveBtn').addEventListener('click', saveToday);

    // Tabbar
    var tabbarBtns = document.querySelectorAll('.tabbar-btn');
    tabbarBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        switchView(b.dataset.view);
      });
    });

    // Quick "Manage" buttons that jump into Settings sections
    document.querySelectorAll('[data-go]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchView('settings');
        var target = document.getElementById(btn.dataset.go);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // History tabs
    document.getElementById('tab-heatmap').addEventListener('click', function () { switchHistoryTab('heatmap'); });
    document.getElementById('tab-trends').addEventListener('click', function () { switchHistoryTab('trends'); });
    document.getElementById('tab-triggers').addEventListener('click', function () { switchHistoryTab('triggers'); });

    // Trend ranges
    document.querySelectorAll('.range-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.range-btn').forEach(function (x) {
          x.classList.remove('active');
          x.setAttribute('aria-checked', 'false');
        });
        b.classList.add('active');
        b.setAttribute('aria-checked', 'true');
        state.trendsRange = parseInt(b.dataset.range, 10);
        renderTrends();
      });
    });

    // Heatmap click + keyboard
    document.getElementById('heatmapCanvas').addEventListener('click', onHeatmapClick);
    document.getElementById('heatmapWrap').addEventListener('keydown', onHeatmapKey);

    // Report
    document.getElementById('reportPreviewBtn').addEventListener('click', buildReportPreview);
    document.getElementById('reportPrintBtn').addEventListener('click', function () {
      buildReportPreview().then(function () {
        setTimeout(function () { window.print(); }, 250);
      });
    });
    document.getElementById('reportShareBtn').addEventListener('click', shareReport);

    // Default report date range = last 30 days
    var to = UI.isoToday();
    var from = UI.daysAgo(29);
    document.getElementById('reportFrom').value = from;
    document.getElementById('reportTo').value = to;

    // Settings: reminder
    var rOn = document.getElementById('setReminderOn');
    var rTime = document.getElementById('setReminderTime');
    rOn.checked = state.settings.reminderOn;
    rTime.value = state.settings.reminderTime;
    rOn.addEventListener('change', function () {
      state.settings.reminderOn = rOn.checked;
      DB.setMeta('reminderOn', rOn.checked).then(function () {
        if (rOn.checked) requestNotificationPermission();
        sendReminderSettingsToSW();
      });
    });
    rTime.addEventListener('change', function () {
      state.settings.reminderTime = rTime.value;
      DB.setMeta('reminderTime', rTime.value).then(sendReminderSettingsToSW);
    });

    // Settings: appearance
    var setTheme = document.getElementById('setTheme');
    setTheme.value = state.settings.theme;
    setTheme.addEventListener('change', function () {
      state.settings.theme = setTheme.value;
      DB.setMeta('theme', setTheme.value).then(applyTheme);
    });
    var lt = document.getElementById('setLargeText');
    lt.checked = state.settings.largeText;
    lt.addEventListener('change', function () {
      state.settings.largeText = lt.checked;
      DB.setMeta('largeText', lt.checked).then(applyTheme);
    });

    // Settings: preferences
    var setRange = document.getElementById('setRange');
    setRange.value = String(state.settings.defaultRange);
    setRange.addEventListener('change', function () {
      var v = parseInt(setRange.value, 10);
      state.settings.defaultRange = v;
      state.trendsRange = v;
      DB.setMeta('defaultRange', v);
    });
    var setSleepUnits = document.getElementById('setSleepUnits');
    setSleepUnits.value = state.settings.sleepUnits;
    setSleepUnits.addEventListener('change', function () {
      state.settings.sleepUnits = setSleepUnits.value;
      DB.setMeta('sleepUnits', setSleepUnits.value);
    });

    // Settings: tag editors
    renderTagEditor('symptom', 'settingSymptoms');
    renderTagEditor('trigger', 'settingTriggers');
    renderTagEditor('med', 'settingMeds');

    document.getElementById('addSymptomBtn').addEventListener('click', function () {
      addTagFromForm('symptom', 'newSymptom', 'newSymptomColor', 'settingSymptoms');
    });
    document.getElementById('addTriggerBtn').addEventListener('click', function () {
      addTagFromForm('trigger', 'newTrigger', 'newTriggerColor', 'settingTriggers');
    });
    document.getElementById('addMedBtn').addEventListener('click', function () {
      var input = document.getElementById('newMed');
      var name = input.value.trim();
      if (!name) return;
      DB.addTag('med', name, 'sky').then(function () {
        input.value = '';
        return loadTags();
      }).then(function () {
        renderTagEditor('med', 'settingMeds');
        renderMedGrid();
      });
    });

    // Settings: PIN
    var pinOn = document.getElementById('setPinOn');
    var pinRow = document.getElementById('pinSetupRow');
    pinOn.checked = !!state.settings.pinHash;
    pinRow.hidden = !pinOn.checked;
    pinOn.addEventListener('change', function () {
      if (!pinOn.checked && state.settings.pinHash) {
        UI.confirm({
          title: 'Turn off PIN lock?',
          body: 'Your data will be accessible whenever the app is opened.',
          okText: 'Turn off', okStyle: 'warn'
        }).then(function (ok) {
          if (ok) {
            state.settings.pinHash = null;
            state.settings.pinSalt = null;
            Promise.all([DB.setMeta('pinHash', null), DB.setMeta('pinSalt', null)]);
            UI.toast('PIN lock turned off.');
          } else {
            pinOn.checked = true;
          }
        });
      } else {
        pinRow.hidden = !pinOn.checked;
      }
    });
    document.getElementById('savePinBtn').addEventListener('click', function () {
      var a = document.getElementById('newPin').value;
      var b = document.getElementById('newPinConfirm').value;
      if (!/^\d{4}$/.test(a)) { UI.toast('PIN must be 4 digits.'); return; }
      if (a !== b) { UI.toast("Those PINs don't match."); return; }
      var salt = DB.randomSalt();
      DB.hashPin(a, salt).then(function (hash) {
        state.settings.pinSalt = salt;
        state.settings.pinHash = hash;
        return Promise.all([DB.setMeta('pinSalt', salt), DB.setMeta('pinHash', hash)]);
      }).then(function () {
        document.getElementById('newPin').value = '';
        document.getElementById('newPinConfirm').value = '';
        UI.toast('PIN saved.');
      });
    });

    // Settings: backup
    document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
    document.getElementById('importJsonBtn').addEventListener('click', function () {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importJsonFromFile);
    document.getElementById('clearDataBtn').addEventListener('click', confirmClearAll);

    // Install banner buttons
    document.getElementById('installBtn').addEventListener('click', triggerInstall);
    document.getElementById('installBannerBtn').addEventListener('click', triggerInstall);
    document.getElementById('installDismiss').addEventListener('click', function () {
      document.getElementById('installBanner').hidden = true;
      DB.setMeta('installDismissed', Date.now());
    });

    // Search notes
    document.getElementById('searchNotes').addEventListener('input', debounce(doSearch, 200));

    // Hashchange routing
    window.addEventListener('hashchange', routeFromHash);
    routeFromHash();

    // Render streak text
    renderStreak();
  }

  /* ---------- Render grids ---------- */

  function renderSymptomGrid() {
    var grid = document.getElementById('symptomGrid');
    grid.innerHTML = '';
    var enabled = state.tags.symptom.filter(function (t) { return t.enabled !== false; });
    if (enabled.length === 0) {
      grid.innerHTML = '<p class="muted small">No symptoms set up. Add some in Settings.</p>';
      return;
    }
    enabled.forEach(function (t) {
      var p = buildPill(t, state.symptoms.has(t.id) ? 'on' : 'off');
      p.addEventListener('click', function () {
        if (state.symptoms.has(t.id)) state.symptoms.delete(t.id);
        else state.symptoms.add(t.id);
        var on = state.symptoms.has(t.id);
        p.classList.toggle('on', on);
        p.setAttribute('aria-pressed', on ? 'true' : 'false');
        UI.vibrate(5);
      });
      grid.appendChild(p);
    });
  }

  function renderTriggerGrid() {
    var grid = document.getElementById('triggerGrid');
    grid.innerHTML = '';
    var enabled = state.tags.trigger.filter(function (t) { return t.enabled !== false; });
    if (enabled.length === 0) {
      grid.innerHTML = '<p class="muted small">No triggers set up. Add some in Settings.</p>';
      return;
    }
    enabled.forEach(function (t) {
      var p = buildPill(t, state.triggers.has(t.id) ? 'on' : 'off');
      p.addEventListener('click', function () {
        if (state.triggers.has(t.id)) state.triggers.delete(t.id);
        else state.triggers.add(t.id);
        var on = state.triggers.has(t.id);
        p.classList.toggle('on', on);
        p.setAttribute('aria-pressed', on ? 'true' : 'false');
        UI.vibrate(5);
      });
      grid.appendChild(p);
    });
  }

  function renderMedGrid() {
    var grid = document.getElementById('medGrid');
    grid.innerHTML = '';
    var meds = state.tags.med;
    if (meds.length === 0) {
      grid.innerHTML = '<p class="muted small">No medications saved yet. Add names in Settings.</p>';
      return;
    }
    meds.forEach(function (t) {
      var p = buildPill(t, state.meds.has(t.id) ? 'on' : 'off');
      p.addEventListener('click', function () {
        if (state.meds.has(t.id)) state.meds.delete(t.id);
        else state.meds.add(t.id);
        var on = state.meds.has(t.id);
        p.classList.toggle('on', on);
        p.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      grid.appendChild(p);
    });
  }

  /* ---------- Tag editor ---------- */

  function renderTagEditor(kind, containerId) {
    var c = document.getElementById(containerId);
    c.innerHTML = '';
    var list = state.tags[kind];
    if (list.length === 0) {
      var p = document.createElement('p');
      p.className = 'muted small';
      p.textContent = 'None yet. Add one below.';
      c.appendChild(p);
      return;
    }
    list.forEach(function (t) {
      var chip = document.createElement('span');
      chip.className = 'tag-chip pal-' + (t.color || 'violet');
      if (t.enabled === false) chip.style.opacity = '0.55';
      var sw = document.createElement('span'); sw.className = 'swatch'; chip.appendChild(sw);
      var name = document.createElement('span'); name.textContent = t.name; chip.appendChild(name);
      var x = document.createElement('button');
      x.className = 'x'; x.type = 'button'; x.textContent = '×';
      x.setAttribute('aria-label', 'Remove ' + t.name);
      x.addEventListener('click', function () {
        UI.confirm({
          title: 'Remove "' + t.name + '"?',
          body: 'Past entries that include this tag will keep showing the name. You can re-add it any time.',
          okText: 'Remove', okStyle: 'warn'
        }).then(function (ok) {
          if (!ok) return;
          DB.deleteTag(t.id).then(loadTags).then(function () {
            renderTagEditor(kind, containerId);
            if (kind === 'symptom') renderSymptomGrid();
            if (kind === 'trigger') renderTriggerGrid();
            if (kind === 'med') renderMedGrid();
          });
        });
      });
      chip.appendChild(x);
      c.appendChild(chip);
    });
  }

  function addTagFromForm(kind, nameId, colorId, containerId) {
    var input = document.getElementById(nameId);
    var color = document.getElementById(colorId).value;
    var name = input.value.trim();
    if (!name) { UI.toast('Type a name first.'); return; }
    DB.addTag(kind, name, color).then(function () {
      input.value = '';
      return loadTags();
    }).then(function () {
      renderTagEditor(kind, containerId);
      if (kind === 'symptom') renderSymptomGrid();
      if (kind === 'trigger') renderTriggerGrid();
      UI.toast('Added "' + name + '".');
    });
  }

  /* ---------- Save today ---------- */

  function saveToday() {
    var entry = {
      date: state.todayDate,
      mood: state.mood,
      pain: state.pain,
      energy: state.energy,
      sleepHours: state.sleepHours,
      sleepQuality: state.sleepQuality,
      symptoms: Array.from(state.symptoms),
      triggers: Array.from(state.triggers),
      meds: Array.from(state.meds),
      medOther: state.medOther,
      note: state.note
    };
    DB.putEntry(entry).then(function () {
      UI.vibrate([20, 40, 20]);
      var status = document.getElementById('saveStatus');
      status.textContent = 'Saved · ' + new Date().toLocaleTimeString();
      UI.toast('Saved. Nice work showing up today.');
      renderStreak();
    }).catch(function (err) {
      console.warn(err);
      UI.toast("Couldn't save. Please try again.");
    });
  }

  /* ---------- Streak ---------- */

  function renderStreak() {
    DB.getAllEntries().then(function (rows) {
      var el = document.getElementById('streakText');
      if (rows.length === 0) {
        el.textContent = 'Welcome — log your first check-in below.';
        return;
      }
      // Count logs in current calendar month
      var now = new Date();
      var yyyy = now.getFullYear();
      var mm = String(now.getMonth() + 1).padStart(2, '0');
      var prefix = yyyy + '-' + mm + '-';
      var monthLogged = rows.filter(function (e) { return e.date.indexOf(prefix) === 0; }).length;
      var totalLogged = rows.length;
      var loggedToday = rows.some(function (e) { return e.date === state.todayDate; });
      var monthName = now.toLocaleDateString(undefined, { month: 'long' });
      var parts = [];
      parts.push(monthLogged + ' day' + (monthLogged === 1 ? '' : 's') + ' logged in ' + monthName);
      if (loggedToday) parts.push('Today is recorded — thanks for checking in.');
      else parts.push('Take a moment for today whenever you can.');
      parts.push(totalLogged + ' total entr' + (totalLogged === 1 ? 'y' : 'ies') + ' on this device.');
      el.textContent = parts.join(' · ');
    });
  }

  /* ---------- View switching ---------- */

  function switchView(name) {
    state.currentView = name;
    ['today', 'history', 'report', 'settings'].forEach(function (v) {
      document.getElementById('view-' + v).hidden = v !== name;
    });
    document.querySelectorAll('.tabbar-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    if (name === 'history') {
      renderHeatmap();
      renderTrends();
      renderTriggerAnalysis();
    }
    if (name === 'today') renderStreak();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    var hash = '#' + name;
    if (location.hash !== hash) {
      history.replaceState(null, '', hash);
    }
    document.getElementById('main').focus();
  }

  function routeFromHash() {
    var h = (location.hash || '#today').replace('#', '');
    if (['today', 'history', 'report', 'settings'].indexOf(h) !== -1) {
      switchView(h);
    }
  }

  function switchHistoryTab(which) {
    ['heatmap', 'trends', 'triggers'].forEach(function (k) {
      var tab = document.getElementById('tab-' + k);
      var pan = document.getElementById('panel-' + k);
      var on = k === which;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      pan.hidden = !on;
    });
    if (which === 'heatmap') renderHeatmap();
    if (which === 'trends') renderTrends();
    if (which === 'triggers') renderTriggerAnalysis();
  }

  /* ---------- History: heatmap ---------- */

  var heatmapModel = null;
  var heatmapFocus = null; // index into cells

  function renderHeatmap() {
    DB.getAllEntries().then(function (rows) {
      var canvas = document.getElementById('heatmapCanvas');
      heatmapModel = Chart.heatmap(canvas, rows, { weeks: 12 });
      heatmapFocus = null;
      if (rows.length === 0) {
        showDayDetail(null, 'No entries yet — your first check-in shows up here.');
      }
    });
  }

  function onHeatmapClick(e) {
    if (!heatmapModel) return;
    var canvas = document.getElementById('heatmapCanvas');
    var rect = canvas.getBoundingClientRect();
    var px = e.clientX - rect.left;
    var py = e.clientY - rect.top;
    // Convert from CSS pixels to logical (we set transform; coordinates already CSS px)
    var cell = heatmapModel.cellAt(px, py);
    if (!cell) return;
    heatmapFocus = heatmapModel.cells.indexOf(cell);
    showDayDetail(cell.entry, cell.date);
  }

  function onHeatmapKey(e) {
    if (!heatmapModel || !heatmapModel.cells || heatmapModel.cells.length === 0) return;
    var keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '];
    if (keys.indexOf(e.key) === -1) return;
    e.preventDefault();
    if (heatmapFocus == null) heatmapFocus = heatmapModel.cells.length - 1;
    var c = heatmapModel.cells[heatmapFocus];
    var next = null;
    if (e.key === 'ArrowLeft') next = findCell(c.col - 1, c.row);
    else if (e.key === 'ArrowRight') next = findCell(c.col + 1, c.row);
    else if (e.key === 'ArrowUp') next = findCell(c.col, c.row - 1);
    else if (e.key === 'ArrowDown') next = findCell(c.col, c.row + 1);
    if (next) {
      heatmapFocus = heatmapModel.cells.indexOf(next);
      showDayDetail(next.entry, next.date);
    }
  }

  function findCell(col, row) {
    if (!heatmapModel) return null;
    for (var i = 0; i < heatmapModel.cells.length; i++) {
      var c = heatmapModel.cells[i];
      if (c.col === col && c.row === row) return c;
    }
    return null;
  }

  function showDayDetail(entry, date) {
    var el = document.getElementById('dayDetail');
    if (!entry) {
      el.hidden = false;
      el.innerHTML = '<p class="muted">' + UI.escapeHtml(date || '') + ' — no entry for this day.</p>';
      return;
    }
    var tagById = {};
    state.tags.symptom.concat(state.tags.trigger, state.tags.med).forEach(function (t) {
      tagById[t.id] = t;
    });
    var syms = (entry.symptoms || []).map(function (id) { return tagById[id] ? tagById[id].name : id; }).join(', ');
    var trigs = (entry.triggers || []).map(function (id) { return tagById[id] ? tagById[id].name : id; }).join(', ');
    var meds = (entry.meds || []).map(function (id) { return tagById[id] ? tagById[id].name : id; }).join(', ');
    var moodNames = ['', 'Very low', 'Low', 'Neutral', 'Good', 'Great'];
    el.hidden = false;
    var html = '<h3>' + UI.escapeHtml(UI.friendlyDate(entry.date)) + '</h3><dl>';
    if (entry.mood) html += '<dt>Mood</dt><dd>' + moodNames[entry.mood] + ' (' + entry.mood + '/5)</dd>';
    if (entry.pain != null) html += '<dt>Pain</dt><dd>' + entry.pain + '/10</dd>';
    if (entry.energy != null) html += '<dt>Energy</dt><dd>' + entry.energy + '/10</dd>';
    if (entry.sleepHours != null) html += '<dt>Sleep</dt><dd>' + entry.sleepHours + ' h' + (entry.sleepQuality ? ' · quality ' + entry.sleepQuality + '/5' : '') + '</dd>';
    if (syms) html += '<dt>Symptoms</dt><dd>' + UI.escapeHtml(syms) + '</dd>';
    if (trigs) html += '<dt>Triggers</dt><dd>' + UI.escapeHtml(trigs) + '</dd>';
    if (meds || entry.medOther) html += '<dt>Meds</dt><dd>' + UI.escapeHtml((meds + (entry.medOther ? (meds ? '; ' : '') + entry.medOther : '')) || '—') + '</dd>';
    if (entry.note) html += '<dt>Notes</dt><dd>' + UI.escapeHtml(entry.note) + '</dd>';
    html += '</dl>';
    el.innerHTML = html;
  }

  /* ---------- Trends ---------- */

  function renderTrends() {
    var n = state.trendsRange;
    var dates = UI.rangeOfDays(n);
    var from = dates[0], to = dates[dates.length - 1];
    DB.getEntriesInRange(from, to).then(function (rows) {
      var map = {};
      rows.forEach(function (e) { map[e.date] = e; });
      var moodPts = dates.map(function (d) { return { date: d, v: map[d] ? map[d].mood : null }; });
      var painPts = dates.map(function (d) { return { date: d, v: map[d] ? map[d].pain : null }; });
      var enPts = dates.map(function (d) { return { date: d, v: map[d] ? map[d].energy : null }; });
      var slPts = dates.map(function (d) { return { date: d, v: map[d] ? map[d].sleepHours : null }; });

      Chart.line(document.getElementById('moodChart'), moodPts, { min: 1, max: 5, yTicks: 4, stroke: '#0891B2' });
      Chart.line(document.getElementById('painChart'), painPts, { min: 0, max: 10, yTicks: 5, stroke: '#BE185D' });
      Chart.line(document.getElementById('energyChart'), enPts, { min: 0, max: 10, yTicks: 5, stroke: '#4D7C0F' });
      Chart.line(document.getElementById('sleepChart'), slPts, { min: 0, max: 12, yTicks: 4, stroke: '#7C3AED' });

      document.getElementById('moodSummary').textContent = summarize(moodPts, '/5');
      document.getElementById('painSummary').textContent = summarize(painPts, '/10');
      document.getElementById('energySummary').textContent = summarize(enPts, '/10');
      document.getElementById('sleepSummary').textContent = summarize(slPts, ' h');
    });
  }

  function summarize(points, suffix) {
    var vals = points.map(function (p) { return p.v; }).filter(function (v) { return v != null && !isNaN(v); });
    if (vals.length === 0) return 'No data in this range.';
    var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    return vals.length + ' day' + (vals.length === 1 ? '' : 's') + ' logged · avg ' +
      (Math.round(avg * 10) / 10) + suffix + ' · low ' + min + ' · high ' + max;
  }

  /* ---------- Trigger analysis ---------- */

  function renderTriggerAnalysis() {
    var n = 90;
    var dates = UI.rangeOfDays(n);
    DB.getEntriesInRange(dates[0], dates[dates.length - 1]).then(function (rows) {
      if (rows.length === 0) {
        document.getElementById('triggerAnalysis').innerHTML = '<p class="empty-state">Once you log a few days, your top triggers will appear here.</p>';
        document.getElementById('symptomAnalysis').innerHTML = '';
        return;
      }
      var painCutoff = 6; // pain ≥ 6 = tough day
      var hard = rows.filter(function (e) { return (e.pain != null && e.pain >= painCutoff); });
      var tagById = {};
      state.tags.symptom.concat(state.tags.trigger).forEach(function (t) { tagById[t.id] = t; });

      var trigCounts = {};
      hard.forEach(function (e) {
        (e.triggers || []).forEach(function (id) {
          trigCounts[id] = (trigCounts[id] || 0) + 1;
        });
      });
      var trigItems = Object.keys(trigCounts).map(function (id) {
        var t = tagById[id];
        return { label: t ? t.name : id, value: trigCounts[id], count: trigCounts[id] };
      }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10);

      if (hard.length === 0) {
        document.getElementById('triggerAnalysis').innerHTML =
          '<p class="empty-state">No high-pain days (pain ≥ ' + painCutoff + ') in the last 90 days. That\'s good news. We\'ll watch for patterns as you log more.</p>';
      } else {
        Chart.bars(document.getElementById('triggerAnalysis'), trigItems, { emptyText: 'No triggers logged on tough days yet.' });
      }

      var symCounts = {};
      rows.forEach(function (e) {
        (e.symptoms || []).forEach(function (id) {
          symCounts[id] = (symCounts[id] || 0) + 1;
        });
      });
      var symItems = Object.keys(symCounts).map(function (id) {
        var t = tagById[id];
        return { label: t ? t.name : id, value: symCounts[id], count: symCounts[id] };
      }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
      Chart.bars(document.getElementById('symptomAnalysis'), symItems, { emptyText: 'No symptoms logged yet.' });
    });
  }

  /* ---------- Search notes ---------- */

  function doSearch(e) {
    var q = (e && e.target ? e.target.value : '').trim().toLowerCase();
    var out = document.getElementById('searchResults');
    out.innerHTML = '';
    if (!q || q.length < 2) return;
    DB.getAllEntries().then(function (rows) {
      var hits = rows.filter(function (r) {
        return (r.note || '').toLowerCase().indexOf(q) !== -1;
      }).reverse().slice(0, 20);
      if (hits.length === 0) {
        out.innerHTML = '<p class="muted small">No matching notes.</p>';
        return;
      }
      hits.forEach(function (h) {
        var div = document.createElement('div');
        div.className = 'search-result';
        var date = document.createElement('div');
        date.className = 'date';
        date.textContent = UI.friendlyDate(h.date);
        var text = document.createElement('div');
        var noteHTML = UI.escapeHtml(h.note || '').replace(
          new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
          '<strong>$1</strong>'
        );
        text.innerHTML = noteHTML;
        div.appendChild(date);
        div.appendChild(text);
        div.addEventListener('click', function () {
          // Jump to history calendar and show the day
          switchView('history');
          switchHistoryTab('heatmap');
          DB.getEntry(h.date).then(function (entry) {
            showDayDetail(entry, h.date);
          });
        });
        out.appendChild(div);
      });
    });
  }

  /* ---------- Report ---------- */

  function buildReportPreview() {
    var name = document.getElementById('reportName').value.trim();
    var from = document.getElementById('reportFrom').value;
    var to = document.getElementById('reportTo').value;
    if (!from || !to) { UI.toast('Pick a date range first.'); return Promise.resolve(); }
    if (from > to) { UI.toast('"From" must be before "To".'); return Promise.resolve(); }
    return DB.getAllEntries().then(function (rows) {
      var html = Report.build({
        entries: rows,
        fromDate: from,
        toDate: to,
        name: name,
        tags: state.tags.symptom.concat(state.tags.trigger, state.tags.med),
        now: new Date()
      });
      var el = document.getElementById('reportPreview');
      el.innerHTML = html;
      el.hidden = false;
      // Show share if supported
      if (navigator.share) document.getElementById('reportShareBtn').hidden = false;
    });
  }

  function shareReport() {
    var el = document.getElementById('reportPreview');
    if (el.hidden) {
      UI.toast('Preview the report first.');
      return;
    }
    var name = document.getElementById('reportName').value.trim();
    var from = document.getElementById('reportFrom').value;
    var to = document.getElementById('reportTo').value;
    // Build a text-only version of the report for sharing.
    DB.getAllEntries().then(function (rows) {
      var inRange = rows.filter(function (e) { return e.date >= from && e.date <= to; });
      var tagById = {};
      state.tags.symptom.concat(state.tags.trigger, state.tags.med).forEach(function (t) { tagById[t.id] = t; });
      var text = buildShareText(inRange, from, to, name, tagById);
      var data = { title: 'DiaryWell report', text: text };
      if (navigator.share) {
        navigator.share(data).catch(function () { /* user cancelled */ });
      } else {
        UI.toast('Sharing not available on this device.');
      }
    });
  }

  function buildShareText(entries, from, to, name, tagById) {
    var lines = [];
    lines.push('DiaryWell Report');
    if (name) lines.push('For: ' + name);
    lines.push('Period: ' + from + ' to ' + to);
    lines.push('Days logged: ' + entries.length);
    var pains = entries.map(function (e) { return e.pain; }).filter(function (v) { return v != null; });
    var moods = entries.map(function (e) { return e.mood; }).filter(function (v) { return v != null; });
    var sleeps = entries.map(function (e) { return e.sleepHours; }).filter(function (v) { return v != null; });
    if (pains.length) lines.push('Avg pain: ' + (pains.reduce(function (a, b) { return a + b; }, 0) / pains.length).toFixed(1) + '/10');
    if (moods.length) lines.push('Avg mood: ' + (moods.reduce(function (a, b) { return a + b; }, 0) / moods.length).toFixed(1) + '/5');
    if (sleeps.length) lines.push('Avg sleep: ' + (sleeps.reduce(function (a, b) { return a + b; }, 0) / sleeps.length).toFixed(1) + ' h');
    lines.push('');
    lines.push('Generated by DiaryWell. All data stayed on device.');
    return lines.join('\n');
  }

  /* ---------- Backup ---------- */

  function exportJson() {
    DB.exportAll().then(function (payload) {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var filename = 'diarywell-backup-' + UI.isoToday() + '.json';
      // Try File System Access API
      if (window.showSaveFilePicker) {
        window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
        }).then(function (handle) {
          return handle.createWritable().then(function (w) {
            return w.write(blob).then(function () { return w.close(); });
          });
        }).then(function () {
          UI.toast('Backup saved.');
        }).catch(function () { downloadFallback(blob, filename); });
      } else {
        downloadFallback(blob, filename);
      }
    });
  }

  function downloadFallback(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
      UI.toast('Backup downloaded.');
    }, 50);
  }

  function importJsonFromFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); }
      catch (err) {
        UI.toast("That file isn't valid JSON.");
        return;
      }
      UI.confirm({
        title: 'Import this backup?',
        body: 'This will merge ' + ((data.entries && data.entries.length) || 0) + ' entries with your existing data. Existing entries with the same date will be overwritten.',
        okText: 'Import', okStyle: 'primary'
      }).then(function (ok) {
        if (!ok) return;
        DB.importAll(data, { merge: true })
          .then(loadTags)
          .then(loadTodayEntryIfAny)
          .then(function () {
            renderSymptomGrid();
            renderTriggerGrid();
            renderMedGrid();
            renderStreak();
            UI.toast('Import complete.');
          })
          .catch(function (err) {
            UI.toast('Import failed: ' + err.message);
          });
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function confirmClearAll() {
    UI.confirm({
      title: 'Clear everything?',
      body: 'This deletes every entry, tag, and setting on this device. Cannot be undone.',
      okText: 'Continue', okStyle: 'warn'
    }).then(function (ok) {
      if (!ok) return;
      UI.confirm({
        title: 'Really clear everything?',
        body: 'Tap "Erase all" to confirm. We strongly suggest exporting a JSON backup first.',
        okText: 'Erase all', okStyle: 'warn'
      }).then(function (ok2) {
        if (!ok2) return;
        DB.clearAll().then(function () {
          UI.toast('All data cleared.');
          setTimeout(function () { location.reload(); }, 600);
        });
      });
    });
  }

  /* ---------- Install prompt ---------- */

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      state.deferredInstall = e;
      DB.getMeta('installDismissed', 0).then(function (when) {
        var now = Date.now();
        if (!when || (now - when) > 7 * 24 * 3600 * 1000) {
          document.getElementById('installBanner').hidden = false;
        }
        document.getElementById('installBtn').hidden = false;
      });
    });
    window.addEventListener('appinstalled', function () {
      document.getElementById('installBanner').hidden = true;
      document.getElementById('installBtn').hidden = true;
      UI.toast('Installed — see you tomorrow.');
    });
  }

  function triggerInstall() {
    var e = state.deferredInstall;
    if (!e) {
      UI.toast('To install: open your browser menu and pick "Add to Home Screen".');
      return;
    }
    e.prompt();
    e.userChoice.then(function () {
      state.deferredInstall = null;
      document.getElementById('installBanner').hidden = true;
      document.getElementById('installBtn').hidden = true;
    });
  }

  /* ---------- Notifications ---------- */

  function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') { sendReminderSettingsToSW(); return; }
    if (Notification.permission === 'denied') return;
    Notification.requestPermission().then(function (perm) {
      if (perm === 'granted') sendReminderSettingsToSW();
    });
  }

  function sendReminderSettingsToSW() {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({
      type: 'reminder',
      enabled: state.settings.reminderOn,
      time: state.settings.reminderTime
    });
  }

  /* ---------- Service Worker ---------- */

  function registerSW() {
    if (!('serviceWorker' in navigator)) return Promise.resolve();
    return navigator.serviceWorker.register('sw.js').then(function () {
      // Once controller is active, push reminder settings.
      if (navigator.serviceWorker.controller) sendReminderSettingsToSW();
      navigator.serviceWorker.addEventListener('controllerchange', sendReminderSettingsToSW);
    }).catch(function () {
      // SW failure is non-fatal.
    });
  }

  /* ---------- Misc helpers ---------- */

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }
})();
