// Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ---------- доступ: мягкие ворота подписки ----------
const ACCESS_KEY = 'kinoafisha_access';
const CHANNEL_URL = 'https://t.me/capitanKino1';

function showGate() {
  markSessionOpen();   // v127: заход в приложение считаем и у ворот подписки
  document.getElementById('gate').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('btn-gate-channel').onclick = () => tg.openTelegramLink(CHANNEL_URL);
  document.getElementById('btn-gate-check').onclick = () =>
    sendOrDeepLink({ action: 'access_check' });
  // v232: режим просмотра — афиша и трейлеры открыты, подписка нужна для кодов/игр
  const pv = document.getElementById('btn-gate-preview');
  if (pv) pv.onclick = () => { track('preview'); enterApp(true); };
}
// v232: баннер «режим просмотра» над шапкой (только без подтверждённой подписки)
function showPreviewBanner() {
  if (document.getElementById('preview-banner')) return;
  const b = document.createElement('div');
  b.id = 'preview-banner';
  b.className = 'preview-banner';
  b.innerHTML = '<span>👀 Режим просмотра — подпишись, чтобы открывать коды</span>' +
    '<button type="button" id="pv-sub">Подписаться</button>';
  const app = document.getElementById('app');
  app.insertBefore(b, app.firstChild);
  document.getElementById('pv-sub').onclick = () => {
    try { tg.openTelegramLink(CHANNEL_URL); } catch (e) { window.open(CHANNEL_URL, '_blank'); }
  };
}
function enterApp(preview) {
  if (preview !== true) localStorage.setItem(ACCESS_KEY, '1');
  markSessionOpen();   // v127: заход в приложение (новый, если прошёл >30 мин)
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  if (preview === true) showPreviewBanner();
  parseProfileHash();  // до parseUnlockedHash: тот очищает location.hash
  parseUnlockedHash();
  parseRestoreHash();  // v76: «☁️ Восстановить из бота» — до очистки хэша другими
parseMarathonHash(); // v78: «#marathon=…» — запуск марафона по ссылке от друга
  bumpDaily();         // v64: ежедневная серия заходит
  initHideToggle();
  initFiltersToggle();
  applyGridCols();
  initSearchHist();
  renderTimeChips(); renderMoodChips(); renderFsets();  // v77: чипы длительности
  initShelfArrows();  // v77: стрелки полок (ПК)
  initHeaderScroll(); // v77: стеклянная шапка
  showSeasonalBanner();  // v113: праздничное приветствие (в сезон)
  loadMovies();
  // v121: облачный профиль — новое устройство подтягивает «Моё» само
  restoreProfileFromCloud().then((r) => {
    if (!r) return;
    try { renderGrid(); } catch (e) {}
    try { updateHeaderProgress(); } catch (e) {}
    try { renderStreakStrip(); } catch (e) {}
    try { updateChallPane(); } catch (e) {}
    if (PROFILE && view === 'profile') { try { renderProfile(); } catch (e) {} }
    if (r.wasEmpty) {
      try {
        tg.showPopup({
          type: 'ok',
          title: '☁️ Профиль восстановлен',
          message: 'Твой список, оценки и заметки подтянулись из облака Telegram — они теперь с тобой на любом устройстве.',
        });
      } catch (e) { /* пусто */ }
    }
  });
}
// ВНИМАНИЕ: запуск (enterApp/showGate) перенесён в САМЫЙ КОНЕЦ файла —
// раньше он выполнялся здесь, до объявления ALL/COLLS/обработчиков, и любое
// падение верхнеуровневого кода оставляло приложение пустым (TDZ-гонка с fetch).

// ---------- тема: авто из Telegram + ручной переключатель (3 режима) ----------
const THEME_KEY = 'kinoafisha_theme';
// v123: режим «как в Telegram» — цвета берём из themeParams клиента, чтобы
// приложение сливалось с чатом (раньше тема была только своя: тёмная/светлая).
function tgThemeAvailable() {
  try { return !!(tg && tg.themeParams && tg.themeParams.bg_color); } catch (e) { return false; }
}
function readTelegramTheme() {
  try {
    const p = tg.themeParams || {};
    const root = document.documentElement.style;
    const set = (k, v) => { if (v) root.setProperty(k, v); };
    set('--tg-bg', p.bg_color);
    set('--tg-card', p.secondary_bg_color || p.section_bg_color || p.bg_color);
    set('--tg-text', p.text_color);
    set('--tg-muted', p.hint_color);
    set('--tg-accent', p.button_color || p.link_color || p.accent_text_color);
    set('--tg-line', p.section_separator_color);
  } catch (e) { /* пусто */ }
}
function applyTheme() {
  // Ручной переключатель имеет приоритет над авто-темой
  const saved = localStorage.getItem(THEME_KEY);
  let scheme = saved;
  if (!scheme) {
    // v94: авто-тема по времени суток, пока пользователь не выбрал вручную
    const h = new Date().getHours();
    scheme = (h >= 8 && h < 20) ? 'light' : 'dark';
  }
  if (scheme === 'tg' && !tgThemeAvailable()) scheme = 'dark';  // браузер без Telegram
  document.body.classList.toggle('light', scheme === 'light');
  document.body.classList.toggle('tgtheme', scheme === 'tg');
  if (scheme === 'tg') readTelegramTheme();
  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.textContent = scheme === 'light' ? '☀️' : (scheme === 'tg' ? '📱' : '🌙');
    btn.title = scheme === 'light' ? 'Тема: светлая'
      : (scheme === 'tg' ? 'Тема: как в Telegram' : 'Тема: тёмная');
  }
}
function currentTheme() {
  if (document.body.classList.contains('tgtheme')) return 'tg';
  return document.body.classList.contains('light') ? 'light' : 'dark';
}
function toggleTheme() {
  // Цикл: тёмная → светлая → «как в Telegram» (если клиент отдаёт themeParams)
  const order = tgThemeAvailable() ? ['dark', 'light', 'tg'] : ['dark', 'light'];
  const next = order[(order.indexOf(currentTheme()) + 1) % order.length];
  localStorage.setItem(THEME_KEY, next);
  applyTheme();
  haptic('light');
}
function manualTheme() {
  // Возврат к авто-теме (время суток / тема клиента)
  localStorage.removeItem(THEME_KEY);
  applyTheme();
  haptic('light');
}
applyTheme();
tg.onEvent('themeChanged', () => {
  // Авто-тема и режим «как в Telegram» подхватывают смену темы в клиенте
  const saved = localStorage.getItem(THEME_KEY);
  if (!saved || saved === 'tg') applyTheme();
});

// ---------- акцент-пресеты (classic / ocean / emerald / purple / neon / gold) ----------
// Наборы цвета оформления; стили описаны в style.css через body.accent-*.
const ACCENT_KEY = 'kinoafisha_accent';
const ACCENTS = ['classic', 'ocean', 'emerald', 'purple', 'neon', 'gold'];
const ACCENT_ICONS = { classic: '🎨', ocean: '🌊', emerald: '🌿', purple: '🔮', neon: '💠', gold: '✨' };
function applyAccent() {
  const cur = localStorage.getItem(ACCENT_KEY) || 'classic';
  document.body.classList.remove(...ACCENTS.filter(a => a !== 'classic').map(a => 'accent-' + a));
  if (cur !== 'classic') document.body.classList.add('accent-' + cur);
  const btn = document.getElementById('btn-accent');
  if (btn) btn.textContent = ACCENT_ICONS[cur] || '🎨';
  // подсветка выбранного кружка в панели
  document.querySelectorAll('.ap-swatch').forEach(s => s.classList.toggle('active', s.dataset.a === cur));
}
function setAccent(name) {
  localStorage.setItem(ACCENT_KEY, ACCENTS.includes(name) ? name : 'classic');
  applyAccent();
  haptic('light');
}
applyAccent();
// v74: кнопка 🎨 открывает панель выбора цвета (переключение кликом по кружку)
const accentPop = document.getElementById('accent-pop');
document.getElementById('btn-accent').addEventListener('click', (e) => {
  e.stopPropagation();
  const show = accentPop.classList.contains('hidden');
  accentPop.classList.toggle('hidden');
  if (show) haptic('light');
});
document.addEventListener('click', (e) => {
  if (accentPop && !accentPop.classList.contains('hidden') &&
      !accentPop.contains(e.target) && e.target.id !== 'btn-accent') {
    accentPop.classList.add('hidden');
  }
});
document.querySelectorAll('#more-accent .ap-swatch').forEach(s => s.addEventListener('click', () => setAccent(s.dataset.a)));
function syncMoreMute() {
  const m = document.getElementById('more-mute');
  if (m) m.innerHTML = hapticsEnabled() ? '<b>🔔 Звук и вибрация</b><i>включены</i>' : '<b>🔇 Звук и вибрация</b><i>выключены</i>';
}
setTimeout(syncMoreMute, 0);

// ---------- v113: сезонный режим — праздничное приветствие в особые даты ----------
// Новый год / 14 февраля / 8 марта / Хэллоуин: баннер-поздравление над афишей.
// Закрывается крестиком и больше не показывается в этом сезоне (localStorage).
function getSeason(d) {
  const dt = d || new Date();
  const md = (dt.getMonth() + 1) * 100 + dt.getDate();
  if (md >= 1225 || md <= 107) return { key: 'ny', emoji: '❄️', text: 'С Новым годом! Пусть все коды разгадаются 🎄' };
  if (md >= 213 && md <= 215) return { key: 'val', emoji: '💝', text: 'День всех влюблённых — загадай фильм тому, кто дорог 💘' };
  if (md >= 307 && md <= 309) return { key: 'mar8', emoji: '🌷', text: 'С 8 Марта! Кино и цветы — идеальный вечер 🌷' };
  if (md >= 1029 && md <= 1031) return { key: 'hal', emoji: '🎃', text: 'Хэллоуин! Ужасы в афише уже ждут 👻' };
  return null;
}
function showSeasonalBanner() {
  const el = document.getElementById('season-banner');
  if (!el) return;
  const s = getSeason();
  if (!s) { el.classList.add('hidden'); return; }
  try {
    if (localStorage.getItem('kinoafisha_season_seen_' + s.key) === '1') { el.classList.add('hidden'); return; }
  } catch (e) {}
  el.innerHTML = `<span class="sb-emoji">${s.emoji}</span><span class="sb-text">${esc(s.text)}</span>` +
    `<button class="sb-close" aria-label="Закрыть">✕</button>`;
  el.classList.remove('hidden');
  const close = () => {
    el.classList.add('hidden');
    try { localStorage.setItem('kinoafisha_season_seen_' + s.key, '1'); } catch (e) {}
  };
  el.querySelector('.sb-close').addEventListener('click', close);
}

// ---------- состояние ----------
let ALL = [];                       // все фильмы
let COLLS = [];                     // подборки
let NEWS = [];                      // последние новости кино
let PREMIERES = [];                 // v119: «Скоро в кино» — даты премьер из meta.json
let LEADERBOARD = [];               // топ игроков сезона
let LEADERBOARD_KIND = 'week';      // week | total — по чему ранжируем
let curTab = 'today';              // v183: активная вкладка нижней панели / раздел
let view = 'grid';                  // grid | cols | cols-detail | fav | detail | game | news | top | profile | trailers | achievements
let activeMood = '';                // v246: настроение ('' = любое)
const FMOODS = [
  ['fun', '😄 Развлечься', ['комедия', 'приключения', 'фэнтези', 'семейный', 'мюзикл', 'музыка']],
  ['thrill', '😰 Напрячься', ['триллер', 'ужасы', 'детектив', 'криминал', 'боевик']],
  ['feel', '🥲 Прочувствовать', ['драма', 'мелодрама', 'биография']],
  ['think', '🧠 Подумать', ['фантастика', 'история', 'военный', 'документальный']],
  ['family', '👨‍👩‍👧 Всей семьёй', ['семейный', 'приключения', 'фэнтези', 'комедия']],
];
function renderMoodChips() {
  let box = document.getElementById('mood-chips');
  if (!box) {
    const tc = document.getElementById('time-chips');
    if (!tc || !tc.parentNode) return;
    box = document.createElement('div'); box.id = 'mood-chips'; box.className = 'mood-chips';
    tc.parentNode.insertBefore(box, tc);
  }
  box.innerHTML = '<span class="mood-l">Настроение</span>' + FMOODS.map(m => `<button class="t-chip mood-chip${activeMood === m[0] ? ' active' : ''}" data-m="${m[0]}">${m[1]}</button>`).join('');
  box.querySelectorAll('.mood-chip').forEach(b => b.onclick = () => {
    activeMood = activeMood === b.dataset.m ? '' : b.dataset.m;
    haptic('light'); renderMoodChips(); renderGrid();
  });
}
function moodLabel(k) { const m = FMOODS.find(x => x[0] === k); return m ? m[1] : ''; }
let activeGenre = '';               // выбранный жанр-фильтр ('' = все)
let activeCountry = '';             // v89: выбранная страна-фильтр ('' = все)
let onlyTrailer = false;            // v90: показывать только фильмы с трейлером
let onlyOnline = false;             // v91: только фильмы с прямой ссылкой на просмотр
const GRID_PAGE_SIZE = 30;          // v93: афиша по 30 карточек + «Показать ещё»
let gridPage = 1;
let _gridFilterKey = '';            // ключ текущих фильтров — при смене сбрасываем страницу
// v94: режим афиши «Сетка» (по умолчанию) / «Список» — компактные строки
const LAYOUT_KEY = 'kinoafisha_layout';
let gridLayout = (localStorage.getItem(LAYOUT_KEY) || 'grid') === 'list' ? 'list' : 'grid';
let trailerGenre = '';              // жанр-фильтр для трейлеров
const FAV_KEY = 'kinoafisha_favs';
const FAV_MODE_KEY = 'kinoafisha_fav_mode';  // «Моё»: fav = хочу посмотреть | done = разгаданные
const getFavs = () => JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
const setFavs = (a) => {
  localStorage.setItem(FAV_KEY, JSON.stringify([...a]));
  scheduleCloudSync();   // v121: облачный профиль
};
const toggleFav = (code) => {
  const f = new Set(getFavs());
  const adding = !f.has(code);
  f.has(code) ? f.delete(code) : f.add(code);
  setFavs(f);
  haptic(adding ? 'ok' : 'light');
  if (adding) { challDone('add_fav'); bumpWeekStat('favs'); }
};

// ---------- «Я смотрел» (локальный список просмотренных) ----------
// Помечай фильм как просмотренный — список покажется в «Моё» третьим режимом,
// а рекомендации и статистика станут точнее.
const WATCHED_KEY = 'kinoafisha_watched';
const getWatched = () => JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]');
const setWatched = (a) => {
  localStorage.setItem(WATCHED_KEY, JSON.stringify([...a]));
  scheduleCloudSync();   // v121: облачный профиль
};
const toggleWatched = (code) => {
  const w = new Set(getWatched());
  w.has(code) ? w.delete(code) : w.add(code);
  setWatched(w);
  haptic(w.has(code) ? 'ok' : 'light');
  if (w.has(code)) { try { bumpWeekStat('watched'); } catch (e) {} }
  return w.has(code);
};

// ---------- заметки на фильмах (локально) ----------
// Короткая заметка на карточке: сохраняется состояние прямо в приложении.
const NOTES_KEY = 'kinoafisha_notes';
const getNotes = () => JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
const setNote = (code, text) => {
  const n = getNotes();
  const t = (text || '').trim();
  if (t) n[code] = t; else delete n[code];
  localStorage.setItem(NOTES_KEY, JSON.stringify(n));
  scheduleCloudSync();   // v121: облачный профиль
};

// ---------- v106: свои подборки (локально) ----------
// Пользователь собирает собственные коллекции фильмов. Хранятся на устройстве.
const MYCOLS_KEY = 'kinoafisha_mycols';
const getMyCols = () => JSON.parse(localStorage.getItem(MYCOLS_KEY) || '[]');
const setMyCols = (a) => {
  localStorage.setItem(MYCOLS_KEY, JSON.stringify(a));
  scheduleCloudSync();   // v121: облачный профиль
};
function newMyCol(title) {
  const cols = getMyCols();
  const id = 'mc' + Date.now().toString(36);
  cols.push({ id, title: (title || '').trim() || 'Моя подборка', codes: [] });
  setMyCols(cols);
  return id;
}
function myColById(id) { return getMyCols().find(c => c.id === id); }
function updateMyCol(id, fn) {
  setMyCols(getMyCols().map(c => c.id === id ? fn(c) : c));
}

// ---------- компактный режим афиши (2/3/4 колонки) ----------
const GRID_COLS_KEY = 'kinoafisha_grid_cols';
const getGridCols = () => {
  const v = parseInt(localStorage.getItem(GRID_COLS_KEY) || '0', 10);
  return [2, 3, 4].includes(v) ? v : 0;  // 0 = авто
};

// ---------- история поиска ----------
const SEARCH_HIST_KEY = 'kinoafisha_search_hist';
const MAX_SEARCH_HIST = 6;
const getSearchHist = () => JSON.parse(localStorage.getItem(SEARCH_HIST_KEY) || '[]');
const addSearchHist = (q) => {
  if (!q) return;
  const h = getSearchHist().filter(x => x.toLowerCase() !== q.toLowerCase());
  h.unshift(q);
  localStorage.setItem(SEARCH_HIST_KEY, JSON.stringify(h.slice(0, MAX_SEARCH_HIST)));
};

// ---------- ежедневные кино-челленджи (локальные, меняются каждый день) ----------
// Три задания на день, выполняются собственными действиями в приложении.
// Прогресс хранится локально и автоматически сбрасывается на новый день.
const CHALL_KEY = 'kinoafisha_challenges';
const CHALLENGE_LIST = [
  { id: 'watch_trailer', emoji: '🎥', name: 'Глянь трейлер', desc: 'Открой любой трейлер длиннее 2 минут', check: () => ((window._challTrailerWatched || 0) >= 1) },
  { id: 'open_movie', emoji: '🔍', name: 'Открой карточку', desc: 'Загляни в карточку любого фильма', check: () => (getRecent().length >= 1) },
  { id: 'add_fav', emoji: '❤️', name: 'Пополни «Моё»', desc: 'Добавь фильм в «Хочу посмотреть»', check: () => (getFavs().length >= 1) },
];
function challDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function getChallenges() {
  try {
    const raw = JSON.parse(localStorage.getItem(CHALL_KEY) || 'null');
    if (raw && raw.date === challDateKey()) return raw;
  } catch (e) {}
  return { date: challDateKey(), done: [] };
}
function setChallenges(c) { localStorage.setItem(CHALL_KEY, JSON.stringify(c)); }
function challDone(id) {
  const c = getChallenges();
  if (c.done.includes(id)) return;
  c.done.push(id);
  setChallenges(c);
  updateChallPane();
}

// ---------- история просмотров (для «🕘 Недавно смотрели») ----------
// Локальная история последних открытых карточек (макс 12). Используется
// в полке на главной — без сервера, как «Моё».
const RECENT_KEY = 'kinoafisha_recent';
const MAX_RECENT = 12;
const getRecent = () => JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
const addRecent = (code) => {
  const r = getRecent().filter(c => c !== code);
  r.unshift(code);
  localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, MAX_RECENT)));
};

// ---------- v93: счётчик открытий карточки ----------
// Показывает «👀 Открывал(а) N раз» в карточке фильма — приятная «память» приложения.
const OPEN_COUNT_KEY = 'kinoafisha_open_count';
const getOpenCounts = () => {
  try { return JSON.parse(localStorage.getItem(OPEN_COUNT_KEY) || '{}') || {}; }
  catch (e) { return {}; }
};
function bumpOpenCount(code) {
  const c = getOpenCounts();
  const k = String(code);
  c[k] = (c[k] || 0) + 1;
  try { localStorage.setItem(OPEN_COUNT_KEY, JSON.stringify(c)); } catch (e) {}
  return c[k];
}

// ---------- v74: история просмотренных трейлеров («Продолжить смотреть») ----------
// Отдельно от «Недавно смотрели» — здесь только те фильмы, чей трейлер реально
// открывали. Полка на главной позволяет продолжить с места остановки.
const TW_KEY = 'kinoafisha_trailer_watch';
const MAX_TW = 12;
const getTrailerWatches = () => {
  try { return JSON.parse(localStorage.getItem(TW_KEY) || '[]'); }
  catch (e) { return []; }
};
// v167: вечный набор «уже смотрел трейлер» (история выше обрезана до 12) — для фильтра «Не смотрел»
const TSEEN_KEY = 'kino_tr_seen';
const getTrailerSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(TSEEN_KEY) || '[]')); } catch (e) { return new Set(); } };
function markTrailerSeen(code) {
  try { const st = getTrailerSeen(); st.add(String(code)); localStorage.setItem(TSEEN_KEY, JSON.stringify([...st].slice(-600))); } catch (e) {}
}
function pushTrailerWatch(code) {
  markTrailerSeen(code);
  const now = Date.now();
  let w = getTrailerWatches().filter(x => String(x.c) !== String(code));
  w.unshift({ c: String(code), t: now });
  w = w.slice(0, MAX_TW);
  localStorage.setItem(TW_KEY, JSON.stringify(w));
}

// ---------- v109: «🎬 Смотрю сейчас» — прогресс просмотра трейлеров ----------
// Те же данные, что у «Продолжить смотреть», но с длительностью сессии:
// когда пользователь открывает трейлер, засекаем время; при закрытии пишем,
// сколько секунд реально смотрел. На главной полка показывает мини-прогресс.
const SESSION_KEY = 'kinoafisha_watch_session';
function startWatchSession(code) { localStorage.setItem(SESSION_KEY, JSON.stringify({ c: String(code), t: Date.now() })); }
function endWatchSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s) return;
    localStorage.removeItem(SESSION_KEY);
    const sec = Math.round((Date.now() - s.t) / 1000);
    if (sec < 2) return;                       // случайный клик — не считаем
    let w = getTrailerWatches().filter(x => String(x.c) !== s.c);
    w.unshift({ c: s.c, t: Date.now(), sec });
    localStorage.setItem(TW_KEY, JSON.stringify(w.slice(0, MAX_TW)));
  } catch (e) { localStorage.removeItem(SESSION_KEY); }
}
function watchProgress(code) {
  const w = getTrailerWatches().find(x => String(x.c) === String(code));
  return w ? (w.sec || 0) : 0;
}

// ---------- v109: «📌 закрепить трейлер» ----------
// Закреплённые поднимаются в начало сетки «Трейлеры» (поверх сортировки).
const TPIN_KEY = 'kinoafisha_trailer_pins';
const getTrailerPins = () => {
  try { return JSON.parse(localStorage.getItem(TPIN_KEY) || '[]'); }
  catch (e) { return []; }
};
function toggleTrailerPin(code) {
  const pins = getTrailerPins();
  const i = pins.indexOf(String(code));
  let nowPinned = true;
  if (i >= 0) { pins.splice(i, 1); nowPinned = false; }
  else pins.unshift(String(code));
  localStorage.setItem(TPIN_KEY, JSON.stringify(pins));
  haptic(nowPinned ? 'ok' : 'light');
  return nowPinned;
}

// ---------- v60: локальная активность («📊 Моя неделя» в профиле) ----------
// Счётчики по дням: открытых карточек, просмотренных трейлеров, добавлений в «Моё».
const WEEK_STATS_KEY = 'kinoafisha_week_stats';
const _wdayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const getWeekStats = () => {
  try { return JSON.parse(localStorage.getItem(WEEK_STATS_KEY) || '{}') || {}; }
  catch (e) { return {}; }
};
function bumpWeekStat(field, n = 1) {
  const s = getWeekStats();
  const k = _wdayKey();
  if (!s[k]) s[k] = { open: 0, trailers: 0, favs: 0 };
  s[k][field] = (s[k][field] || 0) + n;
  // храним только последние 14 дней
  const keys = Object.keys(s).sort();
  while (keys.length > 14) delete s[keys.shift()];
  localStorage.setItem(WEEK_STATS_KEY, JSON.stringify(s));
  bumpYearStat(field);   // v74: параллельно ведём «Мой кино-год»
}

// ---------- v74: «Мой кино-год» — помесячный журнал активности ----------
const YEAR_LOG_KEY = 'kinoafisha_year_stats';
const _ymKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}`;
const getYearStats = () => {
  try { return JSON.parse(localStorage.getItem(YEAR_LOG_KEY) || '{}') || {}; }
  catch (e) { return {}; }
};
function bumpYearStat(field, n = 1) {
  const s = getYearStats();
  const k = _ymKey();
  if (!s[k]) s[k] = { open: 0, trailers: 0, favs: 0, rated: 0 };
  s[k][field] = (s[k][field] || 0) + n;
  // храним только последние 24 месяца
  const keys = Object.keys(s).sort();
  while (keys.length > 24) delete s[keys.shift()];
  localStorage.setItem(YEAR_LOG_KEY, JSON.stringify(s));
}
function week7() {
  // последние 7 дней по порядку: старые → свежие
  const s = getWeekStats();
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = _wdayKey(d);
    const v = s[k] || {};
    out.push({ date: d, open: v.open || 0, trailers: v.trailers || 0, favs: v.favs || 0, rated: v.rated || 0, watched: v.watched || 0 });
  }
  return out;
}

// ---------- рекомендации («💫 Советуем вам») ----------
// Локально: на основе жанров из «Моё» и разгаданных выбираем похожие фильмы,
// которые пользователь ещё не смотрел и не сохранял.
const RECO_KEY = 'kinoafisha_reco';
const getRecoHide = () => JSON.parse(localStorage.getItem(RECO_KEY) || '[]');
const setRecoHide = (a) => localStorage.setItem(RECO_KEY, JSON.stringify([...a]));

// ---------- v64: мои оценки — прямо в приложении, без выброса в бота ----------
const RATINGS_KEY = 'kinoafisha_ratings';
const getRatings = () => {
  try { return JSON.parse(localStorage.getItem(RATINGS_KEY) || '{}') || {}; }
  catch (e) { return {}; }
};
const myRating = (code) => getRatings()[String(code)] || 0;
function setRating(code, r) {
  const all = getRatings();
  const k = String(code);
  if (r && all[k] === r) delete all[k];   // повторный тап по той же звезде — снять
  else if (r) all[k] = r;
  else delete all[k];
  localStorage.setItem(RATINGS_KEY, JSON.stringify(all));
  haptic(r ? 'ok' : 'light');
  if (r) bumpWeekStat('rated');
  scheduleCloudSync();   // v121: облачный профиль
}
function removeRating(code) {
  const all = getRatings();
  delete all[String(code)];
  localStorage.setItem(RATINGS_KEY, JSON.stringify(all));
  haptic('light');
  scheduleCloudSync();   // v121: облачный профиль
}
// «вес» фильма во вкусе пользователя: чем выше оценка — тем сильнее сигнал
const ratingWeight = (r) => 1 + (parseInt(r, 10) || 0) * 1.2;

// ---------- v109: «🔮 Инсайты» — персональные факты из локальной истории ----------
const HOUR_LOG_KEY = 'kinoafisha_hour_log';
function bumpHourLog() {
  try {
    const h = new Date().getHours();
    const log = JSON.parse(localStorage.getItem(HOUR_LOG_KEY) || '{}') || {};
    log[h] = (log[h] || 0) + 1;
    localStorage.setItem(HOUR_LOG_KEY, JSON.stringify(log));
  } catch (e) {}
}
function buildInsights() {
  const facts = [];
  // Любимое время заходов (нужен накопленный лог >= 10 открытий)
  try {
    const log = JSON.parse(localStorage.getItem(HOUR_LOG_KEY) || '{}') || {};
    const total = Object.values(log).reduce((a, b) => a + b, 0);
    if (total >= 10) {
      let bestH = 0, bestN = -1;
      for (let h = 0; h < 24; h++) if ((log[h] || 0) > bestN) { bestN = log[h] || 0; bestH = h; }
      const label = (bestH >= 6 && bestH < 12) ? 'утро ☀️'
        : (bestH >= 12 && bestH < 18) ? 'день 🌤'
        : (bestH >= 18 && bestH < 24) ? 'вечер 🌆' : 'ночь 🌙';
      facts.push(`🕐 Ты чаще заходишь <b>${label}</b> (в ${String(bestH).padStart(2, '0')}:00)`);
    }
  } catch (e) {}
  // Самый открываемый фильм
  try {
    const oc = getOpenCounts();
    const entries = Object.entries(oc).filter(([, n]) => n >= 2);
    if (entries.length) {
      entries.sort((a, b) => b[1] - a[1]);
      const m = ALL.find(x => String(x.code) === String(entries[0][0]));
      if (m) facts.push(`👀 Чаще всего открываешь <b>«${esc(m.title)}»</b> — ${entries[0][1]} раз(а)`);
    }
  } catch (e) {}
  // Суммарное время трейлеров
  try {
    const secSum = getTrailerWatches().reduce((a, w) => a + (w.sec || 0), 0);
    if (secSum >= 180) facts.push(`▶️ Посмотрел(а) трейлеров на <b>~${Math.round(secSum / 60)} мин</b>`);
  } catch (e) {}
  // Любимый жанр
  try {
    const fg = favouriteGenre();
    if (fg) facts.push(`🌟 Любимый жанр — <b>${esc(fg)}</b>`);
  } catch (e) {}
  if (!facts.length) return '';
  return `
    <div class="pf-week pf-insights">
      <div class="pf-ach-head"><span>🔮 Инсайты</span><b>из твоей истории</b></div>
      ${facts.map(f => `<div class="ins-fact">${f}</div>`).join('')}
    </div>`;
}

// ---------- v64: ежедневная серия («🔥 заходим каждый день») ----------
const DAILY_KEY = 'kinoafisha_daily';
const DAILY_MILESTONES = [3, 7, 14, 30, 60, 100];
const _daysWord = (n) => (n % 10 === 1 && n % 100 !== 11) ? 'день'
  : ([2, 3, 4].includes(n % 10) && (n % 100 < 10 || n % 100 >= 20)) ? 'дня' : 'дней';
function dailyState() {
  try {
    const s = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null') || {};
    return { last: s.last || '', series: s.series || 0, best: s.best || 0, done: s.done || [] };
  } catch (e) { return { last: '', series: 0, best: 0, done: [] }; }
}
function bumpDaily() {
  const s = dailyState();
  const today = _wdayKey();
  if (s.last === today) return s;                 // сегодня уже засчитали
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  s.series = (s.last === _wdayKey(yest)) ? s.series + 1 : 1;   // вчера был — серия живёт
  s.best = Math.max(s.best || 0, s.series);
  s.last = today;
  const reached = DAILY_MILESTONES.find(x => s.series >= x && !s.done.includes(x));
  if (reached) {
    s.done.push(reached);
    setTimeout(() => {
      haptic('ok');
      sparkBurst(document.getElementById('streak-strip'));   // v123: салют на вехе серии
      try {
        tg.showPopup({ type: 'ok', title: `🔥 Серия ${reached} ${_daysWord(reached)}!`,
          message: `Ты заходишь в «Киноафишу» ${reached} ${_daysWord(reached)} подряд — так держать! Заходи завтра, чтобы не потерять серию.` });
      } catch (e) {}
    }, 900);
  }
  localStorage.setItem(DAILY_KEY, JSON.stringify(s));
  return s;
}
function renderStreakStrip() {
  const el = document.getElementById('streak-strip');
  if (!el) return;
  const s = dailyState();
  if (!s.series) { el.classList.add('hidden'); return; }
  const next = DAILY_MILESTONES.find(x => x > s.series);
  // v123: прогресс к следующей вехе — кольцом (компактнее строки «до 7 🔥 — ещё 4»)
  const prevM = DAILY_MILESTONES.filter(x => x <= s.series).pop() || 0;
  const pct = next ? Math.round(100 * (s.series - prevM) / (next - prevM)) : 100;
  el.classList.remove('hidden');
  el.innerHTML = `<span class="streak-flame">🔥</span>` +
    `<span class="streak-num">${s.series}</span>` +
    `<span class="streak-label">${_daysWord(s.series)} подряд</span>` +
    (next
      ? `<span class="streak-ring" title="До ${next} 🔥 — ещё ${next - s.series}">` +
        ringHtml(pct, { size: 42, stroke: 4, label: pct + '%', tone: 'gold' }) + `</span>` +
        `<span class="streak-next">ещё ${next - s.series}</span>`
      : `<span class="streak-next">легенда афиши 🏆</span>`) +
    `<span class="streak-best" title="Твой рекорд">🏅 ${s.best}</span>`;
}

// ---------- разгаданные коды (для «🙈 Скрыть разгаданные») ----------
// Синхронизируются с ботом кнопкой 🔁: бот присылает сообщение с web_app
// кнопкой, у которой в URL хэш `#unlocked=код,код,…`. Здесь мы читаем этот
// хэш, сохраняем в localStorage и по чекбоксу прячем разгаданные карточки.
const UNLOCKED_KEY = 'kinoafisha_unlocked';
const HIDE_KEY = 'kinoafisha_hide_unlocked';
const getUnlocked = () => JSON.parse(localStorage.getItem(UNLOCKED_KEY) || '[]');

// ---------- профиль игрока (уровень/баллы/стрик) ----------
// Приезжает тем же хэшем от кнопки 🔁: `&profile=<urlencoded json>` — снимок
// из бота (storage.build_tma_profile): уровень, прогресс, баллы, стрик,
// разгадано кодов, место в топе. Храним в localStorage, показываем на вкладке
// «👤 Профиль».
const PROFILE_KEY = 'kinoafisha_profile';
let PROFILE = null;

function parseProfileHash() {
  // ВАЖНО: вызывается ДО parseUnlockedHash() — тот очищает location.hash.
  try {
    const params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const raw = params.get('profile');
    if (raw) {
      PROFILE = JSON.parse(raw);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(PROFILE));
    }
  } catch (e) { /* битый json — оставляем старый профиль */ }
  if (!PROFILE) {
    try { PROFILE = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); }
    catch (e) { PROFILE = null; }
  }
  if (PROFILE && view === 'profile') renderProfile();
  updateHeaderProgress();
}

function parseUnlockedHash() {
  try {
    const params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const raw = params.get('unlocked');
    if (!raw) return;
    const codes = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (codes.length) {
      localStorage.setItem(UNLOCKED_KEY, JSON.stringify([...new Set(codes)]));
      // v102: «⚡ Спидраннер» — разгадал 5+ кодов за один день (счётчик локальный)
      const SPEED_KEY = 'kinoafisha_speedrun';
      const today = new Date().toISOString().slice(0, 10);
      let sp = {};
      try { sp = JSON.parse(localStorage.getItem(SPEED_KEY) || '{}'); } catch (e) { sp = {}; }
      sp = sp.d === today ? sp : { d: today, n: 0 };
      sp.n = sp.n + 1;
      try { localStorage.setItem(SPEED_KEY, JSON.stringify(sp)); } catch (e) {}
      if (sp.n >= 5) {
        try {
          tg.showPopup({ type: 'ok', title: '⚡ Спидраннер!', message: '5+ кодов за день — ты разгадываешь их как профессионал! 🔥' });
        } catch (e) { /* пусто */ }
        try { localStorage.setItem(SPEED_KEY, JSON.stringify({ d: today, n: 999 })); } catch (e) {}
      }
      // очищаем хэш, чтобы повторные открытия не переписывали старым списком
      history.replaceState(null, '', location.pathname);
    }
  } catch (e) { /* пусто */ }
}

// v146: на телефоне вторичные фильтры (чипы времени/стран, «Разгаданные», «С трейлером»…)
// спрятаны под кнопку «Фильтры» — афиша видна с первого экрана. Включённые фильтры
// видны в полосе #filter-bar, так что состояние не теряется.
function initFiltersToggle() {
  const btn = document.getElementById('btn-filters');
  const view = document.getElementById('view-catalog');
  if (!btn || !view || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', () => {
    const open = view.classList.toggle('filters-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.classList.toggle('on', open);
    haptic('light');
  });
}

function initHideToggle() {
  const box = document.getElementById('hide-unlocked');
  if (!box) return;
  const wrap = document.getElementById('hide-toggle-wrap');
  const syncCls = () => { if (wrap) wrap.classList.toggle('on', box.checked); };
  box.checked = localStorage.getItem(HIDE_KEY) === '1';
  syncCls();
  box.addEventListener('change', () => {
    localStorage.setItem(HIDE_KEY, box.checked ? '1' : '');
    syncCls();
    haptic('light');
    renderGrid();
  });
  const btn = document.getElementById('btn-sync');
  if (btn) btn.addEventListener('click', () => {
    haptic('light');
    sendOrDeepLink({ action: 'sync_unlocked' });
  });
  // Компактность сетки: цикл 0 (авто) → 2 → 3 → 4 колонки
  const gridBtn = document.getElementById('btn-grid-cols');
  if (gridBtn) gridBtn.addEventListener('click', () => {
    const cur = getGridCols();
    const next = cur === 0 ? 2 : cur === 2 ? 3 : cur === 3 ? 4 : 0;
    localStorage.setItem(GRID_COLS_KEY, next ? String(next) : '0');
    applyGridCols();
    haptic('light');
    renderGrid();
  });
}

// Применяет класс колонок к контейнеру афиши
function applyGridCols() {
  const mc = document.getElementById('movies-container');
  if (!mc) return;
  const cur = getGridCols();
  mc.classList.toggle('grid-cols-2', cur === 2);
  mc.classList.toggle('grid-cols-3', cur === 3);
  mc.classList.toggle('grid-cols-4', cur === 4);
}

// ---------- история поиска: чипы под поиском (с автодополнением по вводу) ----------
function initSearchHist(prefix) {
  const chips = document.getElementById('search-hist');
  if (!chips) return;
  const p = (prefix || '').trim().toLowerCase();
  const hist = getSearchHist().filter(q => !p || q.toLowerCase().includes(p));
  if (!hist.length) { chips.classList.add('hidden'); return; }
  chips.innerHTML = hist.map(q => `<button class="sh-chip" data-q="${esc(q)}">${esc(q)} ✕</button>`).join('');
  chips.classList.remove('hidden');
  chips.querySelectorAll('.sh-chip').forEach(b => {
    b.addEventListener('click', () => {
      const q = b.dataset.q;
      const inp = document.getElementById('search');
      if (inp) inp.value = q;
      const hist2 = getSearchHist().filter(x => x.toLowerCase() !== q.toLowerCase());
      localStorage.setItem(SEARCH_HIST_KEY, JSON.stringify(hist2));
      initSearchHist('');
      renderGrid();
      haptic('light');
    });
  });
}

// ---------- утилиты ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// Haptic-отклик: вибрация на действиях (нет поддержки — тихо пропускаем).
// v109: «🔇 Без вибраций» — глобальный тумблер, хранится в localStorage.
const NO_HAPTIC_KEY = 'kinoafisha_no_haptic';
function hapticsEnabled() {
  try { return localStorage.getItem(NO_HAPTIC_KEY) !== '1'; } catch (e) { return true; }
}
function toggleHaptics() {
  const willBeOff = hapticsEnabled();   // сейчас включены → выключаем
  localStorage.setItem(NO_HAPTIC_KEY, willBeOff ? '1' : '0');
  return willBeOff;   // true = вибрации теперь выключены
}
// v247: общий звук интерфейса — те же 'ok'/'error'/'medium', что и вибрация, и тот же тумблер 🔔/🔇.
// Казино и покер звучат сами (silent=true), поэтому здесь не дублируем.
let _uiAC = null;
function uiTone(f, d, type, vol, delay, slide) {
  try {
    if (!_uiAC) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; _uiAC = new C(); }
    if (_uiAC.state === 'suspended') _uiAC.resume();
    const t0 = _uiAC.currentTime + (delay || 0), o = _uiAC.createOscillator(), g = _uiAC.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(_uiAC.destination); o.start(t0); o.stop(t0 + d + 0.03);
  } catch (e) { /* пусто */ }
}
function uiSound(kind) {
  if (kind === 'ok') { uiTone(660, 0.1, 'sine', 0.09); uiTone(880, 0.16, 'sine', 0.09, 0.09); uiTone(1320, 0.2, 'triangle', 0.05, 0.17); }
  else if (kind === 'error') { uiTone(220, 0.22, 'sawtooth', 0.06, 0, 140); }
  else if (kind === 'medium') { uiTone(300, 0.14, 'triangle', 0.07, 0, 200); }
}
function haptic(kind = 'light', silent) {
  if (!hapticsEnabled()) return;
  if (!silent && (kind === 'ok' || kind === 'error' || kind === 'medium')) uiSound(kind);
  try {
    if (kind === 'ok' || kind === 'error') tg.HapticFeedback?.notificationOccurred(kind);
    else tg.HapticFeedback?.impactOccurred(kind);
  } catch (e) { /* пусто */ }
}

// ---------- v124–v127: телеметрия разделов, заходов и ошибок ----------
// Отдельного канала «приложение → бот» нет: tg.sendData работает только при
// запуске из reply-кнопки клавиатуры (и закрывает окно), а переход по разделам
// не должен уводить в чат. Поэтому счётчики копятся локально и уезжают боту
// вместе со следующим диплинком: ?start=ke1_<ошибки>_<слаг>_kv1_<разделы>_<payload>.
// Формат (буква + счётчик в base36) разбирает miniapp_stats.py — буквы обязаны
// совпадать с VIEW_NAMES/ERROR_CODES там; совпадение проверяет
// tests/test_miniapp_view_stats.py (round-trip «JS-чанк → счётчики бота»).
const VIEW_STAT_CODES = {
  grid: 'a', fav: 'b', trailers: 'c', news: 'd', cols: 'e', top: 'f',
  achievements: 'g', profile: 'h', game: 'i', chain: 'j', marathon: 'k',
  year: 'l', tinder: 'm', mycols: 'n', 'mycol-detail': 'o',
};
const VIEW_STATS_KEY = 'kino_view_stats';
const VIEW_STATS_PREFIX = 'kv1_';
// v127: заходы в приложение. Каждое открытие боту не отправить (канала нет),
// поэтому приложение помечает ПЕРВЫЙ переход в бота за сессию: по этой метке бот
// считает людей, а не события, и не путает «заход» с «ещё один тап».
const SESSION_STATS_KEY = 'kino_session_stats';
const SESSION_PREFIX = 'ks1_';
const SESSION_OPEN_CODE = 'q';   // a-o — разделы, 'p' — упор в предел, 'q' — заход
const VIEW_STAT_MAX = 35;   // 'z' в base36 — один символ на счётчик
// v126: счётчик раздела упёрся в предел — клиент пишет служебную пару вида 'p1'.
// Буква вне карты разделов (a-o), поэтому бот читает её не как ещё один раздел,
// а как «цифры занижены»: раньше лишние переходы исчезали молча, и по заниженным
// цифрам можно было сделать неверный вывод о популярности раздела.
const VIEW_OVERFLOW_CODE = 'p';
function bumpViewStat(name) {
  const code = VIEW_STAT_CODES[name];
  if (!code) return;
  try {
    const st = JSON.parse(localStorage.getItem(VIEW_STATS_KEY) || '{}') || {};
    const cur = Number(st[code]) || 0;
    if (cur >= VIEW_STAT_MAX) {
      st[VIEW_OVERFLOW_CODE] = Math.min(VIEW_STAT_MAX, (Number(st[VIEW_OVERFLOW_CODE]) || 0) + 1);
    } else {
      st[code] = cur + 1;
    }
    localStorage.setItem(VIEW_STATS_KEY, JSON.stringify(st));
  } catch (e) { /* приватный режим / нет localStorage — просто без телеметрии */ }
}
function viewStatsChunk() {
  try {
    const st = JSON.parse(localStorage.getItem(VIEW_STATS_KEY) || '{}') || {};
    const overflow = Math.min(VIEW_STAT_MAX, Number(st[VIEW_OVERFLOW_CODE]) || 0);
    const body = Object.keys(VIEW_STAT_CODES)
      .filter(n => Number(st[VIEW_STAT_CODES[n]]) > 0)
      .map(n => ({ c: VIEW_STAT_CODES[n], n: Math.min(VIEW_STAT_MAX, Number(st[VIEW_STAT_CODES[n]])) }))
      .sort((x, y) => y.n - x.n)   // самые «горячие» разделы выживают при обрезке
      .map(p => p.c + p.n.toString(36))
      .join('');
    // Пара о переполнении идёт первой: при обрезке чанка она обязана выжить —
    // иначе бот получит заниженные цифры и посчитает их полными.
    return (overflow > 0 ? VIEW_OVERFLOW_CODE + overflow.toString(36) : '') + body;
  } catch (e) { return ''; }
}
function clearViewStats() {
  try { localStorage.removeItem(VIEW_STATS_KEY); } catch (e) { /* пусто */ }
}
function viewStatsPrefix(base) {
  // Telegram ограничивает deep-link 64 символами: если чанк вместе с полезной
  // частью не влезает — отдаём что помещается, остальное не портим.
  const chunk = viewStatsChunk();
  if (!chunk) return '';
  const room = 64 - VIEW_STATS_PREFIX.length - 1 - String(base || '').length;
  const fits = room >= 2 ? chunk.slice(0, room - (room % 2)) : '';
  return fits ? VIEW_STATS_PREFIX + fits + '_' : '';
}

// ---------- v127: заходы в приложение ----------
// Своего канала к боту у приложения нет, поэтому «заход» отмечается флагом в
// localStorage и уезжает вместе с первым переходом в бота за сессию. Дальше бот
// считает ЛЮДЕЙ (уникальных), а не переходы: без метки десять тапов одного
// человека выглядели бы как десять заходов.
const SESSION_LAST_KEY = 'kino_session_last';
const SESSION_GAP_MS = 30 * 60 * 1000;   // пауза, после которой это уже новый заход
function markSessionOpen() {
  try {
    const now = Date.now();
    const last = Number(localStorage.getItem(SESSION_LAST_KEY) || 0);
    localStorage.setItem(SESSION_LAST_KEY, String(now));
    // Свернули и вернулись в течение получаса — тот же заход; закрыли и открыли
    // позже — новый. Так метка не двоит заходы, но и не теряет возвращения.
    if (!last || now - last > SESSION_GAP_MS) localStorage.setItem(SESSION_STATS_KEY, '1');
  } catch (e) { /* без localStorage метку отправить нечем — просто без заходов */ }
}
function sessionStatsChunk() {
  try { return localStorage.getItem(SESSION_STATS_KEY) ? SESSION_OPEN_CODE + '1' : ''; }
  catch (e) { return ''; }
}
function clearSessionStats() {
  try { localStorage.removeItem(SESSION_STATS_KEY); } catch (e) { /* пусто */ }
}
function sessionStatsPrefix(base) {
  // Метка «захода» — две пары символов ('q1'), при любой полезной части влезает:
  // если места нет совсем, ссылку не портим, а метка подождёт следующего перехода.
  const chunk = sessionStatsChunk();
  if (!chunk) return '';
  const room = 64 - SESSION_PREFIX.length - 1 - String(base || '').length;
  return room >= chunk.length ? SESSION_PREFIX + chunk + '_' : '';
}

// ---------- v126/v127: ошибки мини-аппа ----------
// Ошибка, о которой никто не узнал, живёт до первой жалобы. Ловим шесть классов
// сбоя (js / promise / resource / view / data / boot), копим агрегат и увозим боту
// тем же диплинком, что и счётчики разделов. Текст ошибки превращаем в «слаг» из
// [a-z0-9-]: в start-параметре Telegram других символов не бывает (64 символа),
// а по слагу уже видно, что сломалось — «cannot-read-properties» читается без
// расшифровки (буквы классов обязаны совпадать с ERROR_CODES в miniapp_stats.py).
const ERROR_STATS_KEY = 'kino_error_stats';
const ERROR_STATS_PREFIX = 'ke2_';   // два слага: первая ошибка сессии и последняя
const ERROR_STAT_CODES = { js: 'a', promise: 'b', resource: 'c', view: 'd', data: 'e',
                           boot: 'f' };
const ERROR_SLUG_MAX = 32;   // столько же, сколько ERR_SLUG_MAX_LEN в miniapp_stats.py
function errorStatSlug(raw) {
  // Дефис, а не подчёркивание: подчёркивание — разделитель формата диплинка, и
  // слаг с ним разорвал бы payload (то есть сломал бы кнопку у пользователя).
  const s = String(raw || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cutSlug(s, ERROR_SLUG_MAX);
}
function cutSlug(s, max) {
  if (!max || max <= 0) return '';
  if (s.length <= max) return s;
  // Режем по границе слова: «cannot-read-properties» читается, а обрывок
  // «cannot-read-propert» — уже нет (в start-параметре Telegram больше 64
  // символов всё равно не влезет, поэтому слаг экономит место).
  const cut = s.slice(0, max);
  const boundary = cut.lastIndexOf('-');
  return boundary > 0 ? cut.slice(0, boundary) : cut;
}
function bumpErrorStat(kind, slug) {
  const code = ERROR_STAT_CODES[kind];
  if (!code) return;
  try {
    const st = JSON.parse(localStorage.getItem(ERROR_STATS_KEY) || '{}') || {};
    st[code] = Math.min(VIEW_STAT_MAX, (Number(st[code]) || 0) + 1);
    const s = errorStatSlug(slug);
    if (s) {
      // Первую ошибку сессии не перезаписываем: она чаще и есть причина, тогда
      // как последняя нередко следствие. Обе уезжают боту отдельными сегментами.
      if (!st.slug0) st.slug0 = s;
      st.slug = s;
    }
    localStorage.setItem(ERROR_STATS_KEY, JSON.stringify(st));
  } catch (e) { /* без localStorage — просто без телеметрии */ }
}
function errorStatsChunk() {
  try {
    const st = JSON.parse(localStorage.getItem(ERROR_STATS_KEY) || '{}') || {};
    return Object.keys(ERROR_STAT_CODES)
      .filter(k => Number(st[ERROR_STAT_CODES[k]]) > 0)
      .map(k => ERROR_STAT_CODES[k] + Math.min(VIEW_STAT_MAX, Number(st[ERROR_STAT_CODES[k]])).toString(36))
      .join('');
  } catch (e) { return ''; }
}
function errorStatsSlugs() {
  try {
    const st = JSON.parse(localStorage.getItem(ERROR_STATS_KEY) || '{}') || {};
    const first = errorStatSlug(st.slug0);
    const last = errorStatSlug(st.slug);
    return { first, last: last === first ? '' : last };
  } catch (e) { return { first: '', last: '' }; }
}
function errorStatsSlug() {
  try {
    const st = JSON.parse(localStorage.getItem(ERROR_STATS_KEY) || '{}') || {};
    return errorStatSlug(st.slug || st.slug0);
  } catch (e) { return ''; }
}
function clearErrorStats() {
  try { localStorage.removeItem(ERROR_STATS_KEY); } catch (e) { /* пусто */ }
}
function errorStatsPrefix(base) {
  // Формат бота жёсткий: `ke2_<чанк>_<первая>_<последняя>_<payload>`. Сегменты
  // слагов пишутся всегда (пустые — просто подчёркивания): при фиксированной
  // арности payload со своими подчёркиваниями не спутать со служебной частью.
  const chunk = errorStatsChunk();
  if (!chunk) return '';
  const slugs = errorStatsSlugs();
  // Бюджет: 64 минус 'ke2_', три разделителя и payload. Слаги важнее чанка (тот
  // всё равно уезжает счётчиками), но их пара может не влезть — тогда режем
  // последнюю ошибку, а первую (причину) сохраняем целиком.
  const budget = 64 - ERROR_STATS_PREFIX.length - 3 - String(base || '').length;
  if (budget < 2) return '';
  const first = cutSlug(slugs.first, ERROR_SLUG_MAX);
  let last = cutSlug(slugs.last, ERROR_SLUG_MAX);
  while (last && first.length + last.length > budget) {
    last = cutSlug(last, last.length - 4);
  }
  if (first.length + last.length > budget) return '';   // даже причины не влезло
  const room = budget - first.length - last.length;
  const fits = chunk.slice(0, room - (room % 2));
  return ERROR_STATS_PREFIX + fits + '_' + first + '_' + last + '_';
}

// ---------- отправка действий боту ----------
// ВАЖНО: tg.sendData() работает ТОЛЬКО когда мини-апп запущен через
// reply-кнопку клавиатуры. При запуске через menu button, inline кнопку
// или диплинк он МОЛЧА ничего не делает (даже не бросает исключений) —
// из-за этого кнопки «не работают». Поэтому все действия уводим через
// ДИПЛИНК: tg.openTelegramLink открывает чат с ботом и отправляет
// /start с параметром — это работает при любом способе запуска.
function sendOrDeepLink(data) {
  let start = 'afisha';
  if (data.action === 'open_movie') start = 'movie_' + data.code;
  else if (data.action === 'remind_movie') start = 'remind_' + data.code;
  else if (data.action === 'remind_premiere') start = 'prem_' + data.iso + '_' + data.fid;  // v120
  else if (data.action === 'subscribe_code_day') start = 'code_day_on';
  else if (data.action === 'save_favs') start = 'save_favs';
  else if (data.action === 'access_check') start = 'check_sub';
  else if (data.action === 'quiz_result') start = 'quiz_' + data.correct + '_' + data.total;
  else if (data.action === 'rate_movie') start = 'rate_' + data.code;
  else if (data.action === 'review_movie') start = 'review_' + data.code;
  else if (data.action === 'trailer_movie' || data.action === 'trailer') start = 'trailer_' + data.code;
  else if (data.action === 'sync_unlocked') start = 'sync_unlocked';
  else if (data.action === 'restore_backup') start = 'restore_backup';
  else if (data.action === 'kinogod') start = 'kinogod';
  else if (data.action === 'ask_captain') start = 'ask';
  else if (data.action === 'toggle_optin') start = data.on ? 'optin_on' : 'optin_off';
  else if (data.action === 'set_theme') start = 'theme_' + data.theme;
  // v124–v127: служебные блоки уезжают боту вместе с этим же диплинком. Порядок —
  // по важности: снаружи метка захода (по ней считаются люди), затем ошибки,
  // ближе к payload — счётчики разделов. Каждый блок считает место с учётом уже
  // добавленного, поэтому при нехватке 64 символов теряются менее важные метки,
  // а сама ссылка и действие остаются рабочими.
  const sessPrefix = sessionStatsPrefix(start);
  if (sessPrefix) start = sessPrefix + start;
  const errPrefix = errorStatsPrefix(start);
  if (errPrefix) start = errPrefix + start;
  const statsPrefix = viewStatsPrefix(start);
  if (statsPrefix) start = statsPrefix + start;
  haptic('light');
  try {
    tg.openTelegramLink('https://t.me/kapitan_kino_bot?start=' + start);
  } catch (e) {
    // даже openTelegramLink недоступен (открыто вне Telegram) — обычная ссылка
    window.open('https://t.me/kapitan_kino_bot?start=' + start, '_blank');
  }
  // Данные уехали в диплинк — копить их дальше значит посчитать переход дважды
  // (телефон мог быть офлайн, но двойной счёт хуже потери одного перехода).
  // Чистим только то, что действительно уехало: не поместившееся в лимит должно
  // дождаться следующего перехода, иначе метка потерялась бы молча.
  if (statsPrefix) clearViewStats();
  if (errPrefix) clearErrorStats();
  if (sessPrefix) clearSessionStats();
  // Сворачиваем мини-апп: пользователь сразу видит чат с ботом, куда придёт
  // трейлер/сообщение (иначе webview висит поверх и ответ бота не виден).
  // Небольшая задержка — дать openTelegramLink успеть начать переход.
  setTimeout(() => { try { tg.close(); } catch (e) { /* пусто */ } }, 300);
}

const ratingBadge = (m) => {
  const r = parseFloat(m.rating);
  if (!r) return '<span class="rating-chip neutral">⭐ —</span>';
  if (r >= 9) return '<span class="badge-top">🔥 ⭐ ' + r + '</span>';
  if (r >= 8) return '<span class="rating-chip good">⭐ ' + r + '</span>';
  return '<span class="rating-chip neutral">⭐ ' + r + '</span>';
};

// v123: кольцевой прогресс (SVG-донат) вместо полосок там, где важна компактность
// (серия заходов, «Цель дня»). SVG, а не canvas: масштабируется, красится
// CSS-переменными акцента и не требует перерисовки при смене темы.
function ringHtml(pct, opt) {
  const o = opt || {};
  const size = o.size || 44;
  const stroke = o.stroke || 5;
  const val = Math.max(0, Math.min(100, Math.round(pct)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (c * val) / 100;
  const label = o.label != null ? o.label : val + '%';
  const cls = 'ring' + (o.tone ? ' ring-' + o.tone : '') + (o.xs ? ' ring-xs' : '');
  return `<span class="${cls}" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
        stroke-linecap="round"
        style="stroke-dasharray:${dash.toFixed(2)} ${(c - dash).toFixed(2)}"
        transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <span class="ring-txt">${label}</span>
  </span>`;
}

// v123: «искры» — короткое празднование (серия дней, закрытая цель дня).
// Двенадцать частиц на CSS: без canvas и библиотек; при «уменьшить анимации» не летит.
function sparkBurst(host) {
  if (!host || _reduceMotion()) return;
  let layer = host.querySelector('.spark-layer');
  if (!layer) {
    layer = document.createElement('span');
    layer.className = 'spark-layer';
    layer.innerHTML = Array.from({ length: 12 }, (_, i) =>
      `<i style="--a:${i * 30}deg;--dd:${(0.75 + (i % 4) * 0.14).toFixed(2)}s"></i>`).join('');
    host.appendChild(layer);
  }
  layer.classList.remove('go');
  void layer.offsetWidth;      // перезапуск анимации при повторном праздновании
  layer.classList.add('go');
}

// «Новинка» — фильм добавлен в базу в последние 30 дней
const isNew = (m) =>
  !!m.added_at && (Date.now() - new Date(m.added_at).getTime()) < 30 * 24 * 3600 * 1000;

// Очень тёмные постеры («Гран Торино», «Последний самурай»…) в маленьких
// карточках выглядят чёрным пятном. Слегка подсвечиваем их через CSS-фильтр:
// pb — средняя яркость постера 0..255 (считает _fix_thumbs2.py в movies.json).
const dimStyle = (m) => {
  const pb = parseFloat(m && m.pb);
  if (!pb || pb >= 70) return '';
  return ` style="filter:brightness(${Math.min(1.5, 1 + (70 - pb) / 70).toFixed(2)})"`;
};

// Картинка появляется мягко (fade-in) — пока грузится, видна shimmer-заглушка,
// а не «чёрный квадрат».
const FADE = `class="ld" onload="this.classList.add('ld-on')"`;


// v123: «кинематографичный» низ постера. Скрим-градиент даёт бейджам читаемость
// на светлых постерах, а рейтинг живёт в левом нижнем углу: правый низ занят
// кнопкой «▶️ Смотреть», верх — кодом и ❤️. Раньше рейтинг был только текстом
// под постером, и по сетке нельзя было оценить фильм «одним взглядом».
function posterScrim() {
  return '<span class="poster-scrim"></span>';
}
function posterFoot(m) {
  const r = parseFloat(m.rating);
  const tone = r >= 9 ? ' hot' : (r >= 8 ? ' good' : '');
  return `<span class="poster-foot">
    ${r ? `<span class="poster-rate${tone}">⭐ ${r}</span>` : ''}
    ${isNew(m) ? '<span class="new-badge">🔥 Новинка</span>' : ''}
  </span>`;
}

function posterHtml(m) {
  const fav = getFavs().includes(m.code);
  return `<div class="poster-wrap">
    ${m.poster
      ? `<img src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy" decoding="async" ${FADE}${dimStyle(m)}
           onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>`
      : `<div class="poster-placeholder"><span>🎬</span><em>${esc(m.title)}</em></div>`}
    ${posterScrim()}
    <span class="code-badge">🔑 ${esc(String(m.code))}</span>
    ${getNotes()[m.code] ? '<span class="note-badge" title="Заметка">📝</span>' : ''}
    ${fav ? '<span class="fav-badge">❤️</span>' : ''}
    ${posterFoot(m)}
  </div>`;
}

// Быстрая кнопка «❤️/🤍» на карточке фильма (в сетке и полках) — без открытия
// opts.foot === false — постер без подвала с рейтингом (полка трендов: там свой
// оверлей с названием и рейтингом, пилюля в углу дублировала бы его).
function posterHtmlQuick(m, opts) {
  const fav = getFavs().includes(m.code);
  const watched = getWatched().includes(String(m.code));
  const hasNote = !!getNotes()[m.code];
  const showFoot = !opts || opts.foot !== false;
  return `<div class="poster-wrap">
    ${m.poster
      ? `<img src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy" decoding="async" ${FADE}${dimStyle(m)}
           onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>`
      : `<div class="poster-placeholder"><span>🎬</span><em>${esc(m.title)}</em></div>`}
    ${posterScrim()}
    <span class="code-badge">🔑 ${esc(String(m.code))}</span>
    ${showFoot ? '' : (isNew(m) ? '<span class="new-badge">🔥 Новинка</span>' : '')}
    ${watched ? '<span class="watched-badge" title="Просмотрено">👁</span>' : ''}
    ${hasNote ? '<span class="note-badge" title="Заметка">📝</span>' : ''}
    <button class="fav-quick ${fav ? 'active' : ''}" data-code="${esc(m.code)}" aria-label="Моё" title="В «Моё»">${fav ? '♥\uFE0E' : '♡'}</button>
    ${m.link ? `<button class="watch-quick" data-code="${esc(m.code)}" aria-label="Смотреть" title="Смотреть фильм"></button>` : ''}
    ${showFoot ? posterFoot(m) : ''}
  </div>`;
}
// v94: строка компактного списка — альтернатива карточке-постеру (афиша → «☰ Список»)
function listRowHtml(m, q) {
  const fav = getFavs().includes(m.code);
  const myR = getRatings()[String(m.code)] || 0;
  const meta = [m.year, (m.genres || []).slice(0, 3).join(' · '),
    durOf(m) ? `⏱ ${durOf(m)} мин` : ''].filter(Boolean).join(' · ');
  const poster = m.poster
    ? `<img src="${esc(m.poster)}" alt="" loading="lazy" decoding="async" ${FADE}${dimStyle(m)}
         onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>`
    : `<div class="poster-placeholder"><span>🎬</span></div>`;
  return `<div class="movie-row" data-code="${esc(m.code)}">
    <div class="row-poster">
      ${poster}
      <span class="code-badge">🔑 ${esc(String(m.code))}</span>
    </div>
    <div class="row-info">
      <h3>${hlTitle(m.title, q)}</h3>
      ${meta ? `<div class="row-meta">${esc(meta)}</div>` : ''}
      <span class="rating">${ratingBadge(m)}${myR ? `<span class="my-stars">${'★'.repeat(myR)}</span>` : ''}</span>
    </div>
    <div class="row-actions">
      <button class="fav-quick${fav ? ' active' : ''}" data-code="${esc(m.code)}" aria-label="Моё" title="В «Моё»">${fav ? '♥\uFE0E' : '♡'}</button>
      ${m.link ? `<button class="watch-quick" data-code="${esc(m.code)}" aria-label="Смотреть" title="Смотреть фильм"></button>` : ''}
      <span class="row-chev">›</span>
    </div>
  </div>`;
}
function wireFavQuick(container) {
  if (!container) return;
  container.querySelectorAll('.fav-quick').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(btn.dataset.code);
      const fav = getFavs().includes(btn.dataset.code);
      btn.textContent = fav ? '♥\uFE0E' : '♡';
      btn.classList.toggle('active', fav);
      // v59: «взрыв сердечка» — короткая анимация нажатия
      btn.classList.remove('pop');
      void btn.offsetWidth;
      btn.classList.add('pop');
      // В «Моё» (режим «хочу посмотреть») карточка должна пропасть из списка
      if (view === 'fav' && localStorage.getItem(FAV_MODE_KEY) !== 'done') {
        renderGrid();
        haptic('ok');
      }
    });
  });
  // v67: быстрая кнопка «▶️ Смотреть» на постере — прямая ссылка на фильм
  container.querySelectorAll('.watch-quick').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = ALL.find(x => String(x.code) === String(btn.dataset.code));
      if (!m) return;
      haptic('light');
      openWatchLink(m);
    });
  });
}

// ---------- v88: «Коллекция кодов» — охота за неразгаданными ----------
// Показываем прогресс разгаданных кодов (данные приходят от бота кнопкой 🔁).
// Скрыт, пока не разгадан ни один код.
const _unlockedSet = () => new Set(getUnlocked());
function renderCodeWallet() {
  const c = document.getElementById('code-wallet');
  if (!c) return;
  const unlocked = _unlockedSet();
  const total = ALL.length;
  const done = ALL.filter(m => unlocked.has(String(m.code))).length;
  const left = total - done;
  if (!done) { c.classList.add('hidden'); return; }
  c.classList.remove('hidden');
  c.innerHTML = `<div class="cw-row">
      <span class="cw-icon">🗝</span>
      <div class="cw-info"><b>${done}</b> из ${total} · ${left ? 'осталось ' + left : 'все собраны! 🎉'}</div>
      ${left ? '<button class="cw-btn" id="cw-hunt">🎯 Охота</button>'
             : '<button class="cw-btn" id="cw-hunt">🏆 Всё собрано</button>'}
    </div>`;
  const btn = document.getElementById('cw-hunt');
  if (btn) btn.onclick = () => {
    // «Охота» = показать только неразгаданные: включаем «🙈 Разгаданные»
    const box = document.getElementById('hide-unlocked');
    if (box) { box.checked = true; localStorage.setItem(HIDE_KEY, '1'); initHideToggle(); }
    haptic('light');
    openView('grid');
  };
}

// ---------- v88: «Что посмотреть?» — подбор по настроению ----------
// 6 настроений → 4 фильма под вкус пользователя (оценки/«Моё»/просмотренные)
// с коротким «почему». Работает полностью на локальных данных.
const MOODS = [
  { k: 'party',  e: '🎉', t: 'Праздник',        g: ['комедия', 'мультфильм', 'семейный', 'музыка'] },
  { k: 'drive',  e: '⚡', t: 'Драйв',           g: ['боевик', 'триллер', 'фантастика', 'приключения'] },
  { k: 'sleep',  e: '😴', t: 'Перед сном',      g: ['драма', 'мелодрама', 'детектив', 'исторический'] },
  { k: 'light',  e: '🍿', t: 'Лёгкое',          g: ['комедия', 'мелодрама', 'мультфильм'] },
  { k: 'scary',  e: '👻', t: 'Щекотка нервов',  g: ['ужасы', 'триллер', 'детектив'] },
  { k: 'epic',   e: '⚔️', t: 'Эпик на вечер',   g: ['фантастика', 'приключения', 'боевик', 'драма'] },
];
function moodPrefScore(m) {
  let s = 0;
  const r = myRating(m.code);
  if (r >= 4) s += 3; else if (r >= 2) s += 1;
  if (getFavs().includes(m.code)) s += 2;
  if (getWatched().includes(String(m.code)) || _unlockedSet().has(String(m.code))) s += 1;
  return s;
}
function whyLine(m) {
  const r = myRating(m.code);
  if (r >= 4) return '⭐ ты оценил похожее (рейтинг ' + r + ')';
  if (getFavs().includes(m.code)) return '❤️ уже в твоём «Моём»';
  if (getWatched().includes(String(m.code))) return '👁 ты уже смотрел';
  const g = (m.genres || [])[0];
  return g ? 'совпадает с твоим вкусом (' + g + ')' : 'высокий рейтинг';
}
function renderEvening() {
  const c = document.getElementById('evening-panel');
  if (!c) return;
  c.classList.remove('hidden');
  c.innerHTML = `<div class="evening-head">🌙 <b>Что посмотреть?</b> <span class="evening-sub">по настроению</span></div>
    <div class="evening-chips">${MOODS.map(mo => `<button class="evening-chip" data-mood="${mo.k}">${mo.e} ${mo.t}</button>`).join('')}</div>`;
  c.querySelectorAll('.evening-chip').forEach(b =>
    b.addEventListener('click', () => { haptic('light'); openMood(b.dataset.mood); }));  // v125: чип отзывается
}
function openMood(k) {
  const mo = MOODS.find(x => x.k === k);
  if (!mo) return;
  const pool = ALL.filter(m => m.genres && m.genres.some(g => mo.g.includes(String(g).toLowerCase())));
  const ranked = pool
    .map(m => ({ m, sc: moodPrefScore(m) + (parseFloat(m.rating) || 0) * 0.3 }))
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 4);
  const list = document.getElementById('mood-list');
  const title = document.getElementById('mood-title');
  const modal = document.getElementById('mood-modal');
  if (!list || !title || !modal) return;
  title.textContent = mo.e + ' ' + mo.t;
  list.innerHTML = ranked.length
    ? ranked.map(({ m }) => `
      <div class="ew-item" data-code="${esc(m.code)}">
        <div class="ew-poster">${m.poster ? `<img src="${esc(m.poster)}" alt="" loading="lazy" ${dimStyle(m)} onerror="this.style.display='none'"/>` : `<span class="ew-ph">🎬</span>`}</div>
        <div class="ew-body">
          <div class="ew-name">${esc(m.title)}</div>
          <div class="ew-meta">${ratingBadge(m)}${m.duration ? ' · ⏱ ' + esc(fmtDuration(m.duration)) : ''}</div>
          <div class="ew-why">${whyLine(m)}</div>
        </div>
      </div>`).join('')
    : '<div class="ew-empty">Под это настроение пока пусто — Капитан уже ищет, загляни позже 🔎</div>';
  modal.classList.remove('hidden');
  modal.querySelectorAll('.ew-item').forEach(it =>
    it.addEventListener('click', () => { modal.classList.add('hidden'); openDetail(it.dataset.code); }));
  const closeBtn = modal.querySelector('.modal-close');
  if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');
}

// ---------- загрузка ----------
const DATA_CACHE_KEY = 'kinoafisha_data_cache';

// ---------- v118: свежесть афиши — когда последний раз тянули данные с сервера ----------
function getSyncedAt() {
  try {
    const c = JSON.parse(localStorage.getItem(DATA_CACHE_KEY) || 'null');
    return (c && c.synced_at) || 0;
  } catch (e) { return 0; }
}
function freshLineHtml() {
  const ts = getSyncedAt();
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  let txt;
  if (mins <= 2) txt = 'только что';
  else if (mins < 60) txt = mins + ' мин назад';
  else if (mins < 60 * 24) txt = Math.floor(mins / 60) + ' ч назад';
  else if (mins < 60 * 48) txt = 'вчера';
  else txt = Math.floor(mins / 1440) + ' дн. назад';
  const off = (navigator.onLine === false) ? ' · 📴 офлайн' : '';
  return `<div class="fresh-line">🔄 Афиша обновлена: ${esc(txt)}${off}</div>`;
}

// Применяем порцию данных (из кэша или сети) ко всему интерфейсу
function plFilms(n) {
  n = Math.abs(parseInt(n, 10) || 0);
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 14) return n + ' фильмов';
  if (b === 1) return n + ' фильм';
  if (b >= 2 && b <= 4) return n + ' фильма';
  return n + ' фильмов';
}

function applyData(data) {
  // v69: нормализация полей — старый кэш/синк мог отдать actors/genres/countries строкой
  const toArr = (v) => Array.isArray(v) ? v
    : (typeof v === 'string' && v.trim() ? v.split(/\s*[,;]\s*/).filter(Boolean) : []);
  // v146: «Название» (Original, 2012) → «Название»; полное имя остаётся в _raw для поиска
  const prettyTitle = (raw) => {
    const r = String(raw || '').trim();
    let t = r.replace(/\s*\((?:[^()]*?(?:19|20)\d{2}|[A-Za-z0-9 .:,'&!\-]+)\)\s*$/, '').trim();
    const q = t.match(/^«([^»]+)»$/);
    if (q) t = q[1].trim();
    // v189: одиночные «» (без пары) убираем, первую букву — заглавной
    if ((t.match(/«/g) || []).length !== (t.match(/»/g) || []).length) t = t.replace(/[«»]/g, '').trim();
    if (t && /^[а-яё]/.test(t)) t = t[0].toUpperCase() + t.slice(1);
    return t || r;
  };
  ALL = (data.all || []).map(m => {
    if (m._raw === undefined) { m._raw = m.title; m.title = prettyTitle(m.title); }
    m.actors = toArr(m.actors);
    m.genres = toArr(m.genres);
    m.countries = toArr(m.countries);
    if (m.director && typeof m.director !== 'string') m.director = String(m.director);
    return m;
  });
  COLLS = data.cols || [];
  const meta = data.meta || {};
  EMOJI_RIDDLES = Array.isArray(meta.emoji_riddles) ? meta.emoji_riddles : [];
  NEWS = Array.isArray(meta.recent_news) ? meta.recent_news : [];
  PREMIERES = onlyFilms(meta.premieres);  // v119 (v151: без театра/оперы/концертов)
  LEADERBOARD = Array.isArray(meta.leaderboard) ? meta.leaderboard : [];
  LEADERBOARD_KIND = meta.leaderboard_kind === 'total' ? 'total' : 'week';
  updateSubtitle();
  renderGenreChips();
  renderCountryChips();  // v89: фильтр по стране (флаги)
  showCodeDay(meta);
  renderFilmDay();
  renderEvening();      // v88: «Что посмотреть?» по настроению
  renderCodeWallet();   // v88: коллекция разгаданных кодов
  renderHero();
  renderNewCodes();      // v102: «🆕 Новые коды»
  renderTodayShelf(meta);
  renderRecentShelf();
  renderTrailerShelf();   // v74: «Продолжить смотреть»
  renderRecoShelf();
  renderPremieres(meta);
  addMarathonButtons();   // v74: кнопки «🎬 Марафон» на полках
  renderGrid();
  // v124: «Марафон»/«Топ» могли открыть до прихода базы — там остались
  // скелетоны; как только данные приехали, перерисовываем открытый раздел
  if (view === 'marathon') renderMarathonView();
  else if (view === 'top') renderLeaderboard();
  updateChallPane();
  updateHeaderProgress();
  renderStreakStrip();
  parseRiddleHash();
  parseMovieHash();
}

async function loadMovies() {
  // Мгновенный старт: сразу рисуем закэшированные данные, свежак тянем фоном
  try {
    const cached = JSON.parse(localStorage.getItem(DATA_CACHE_KEY) || 'null');
    if (cached && Array.isArray(cached.all) && cached.all.length) applyData(cached);
  } catch (e) {}
  try {
    const [r, rc, rm] = await Promise.all([
      fetch('./data/movies.json', { cache: 'no-cache' }),
      fetch('./data/collections.json', { cache: 'no-cache' }).catch(() => null),
      fetch('./data/meta.json', { cache: 'no-cache' }).catch(() => null)
    ]);
    const data = {
      all: await r.json(),
      cols: rc ? await rc.json() : [],
      meta: rm ? await rm.json() : {},
    };
    try { localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({ ...data, synced_at: Date.now() })); } catch (e) {}
    applyData(data);
    // Бейдж новых достижений на кнопке «Ещё» + восстановление последнего
    // открытого раздела (пусто/«grid» — обычная афиша).
    updateMoreBadge();
    let saved = null;
    try { saved = localStorage.getItem(LAST_VIEW_KEY); } catch (e) {}
    openView((saved && saved !== 'grid') ? saved : 'today', { restore: true });
  } catch (e) {
    // v126: сбой загрузки данных считаем всегда, даже когда показан кэш: «видишь
    // старое вместо свежего» — та же поломка, а по отчёту видно её частоту.
    bumpErrorStat('data', (e && e.message) || 'movies_load');
    if (ALL.length) return; // уже показан кэш — не пугаем ошибкой
    document.getElementById('movies-container').innerHTML =
      '<div class="error-box"><p class="error">Не удалось загрузить афишу 😔</p>' +
      '<button class="btn-secondary" id="btn-retry">🔁 Повторить</button></div>';
    const rb = document.getElementById('btn-retry');
    if (rb) rb.onclick = () => {
      rb.disabled = true;
      rb.textContent = '⏳ Загружаю…';
      loadMovies();
    };
  }
}

// Полоска «🔥 стрик · уровень · прогресс» в шапке — после синхронизации с ботом
function updateHeaderProgress() {
  const el = document.getElementById('header-progress');
  if (!el) return;
  if (!PROFILE || !PROFILE.lvl) { el.classList.add('hidden'); return; }
  const strk = parseInt(PROFILE.str, 10) || 0;
  const pct = Math.max(0, Math.min(100, parseInt(PROFILE.pct, 10) || 0));
  const next = parseInt(PROFILE.lvl_next, 10) || 0;
  el.classList.remove('hidden');
  el.innerHTML = `<span class="hp-streak" title="Серия дней в боте">🔥 ${strk}</span>` +
    `<span class="hp-level">${esc(PROFILE.lvl)}${next ? ` · −${next} 🔑` : ''}</span>` +
    `<span class="hp-bar"><i style="width:${pct}%"></i></span>`;
}

// ---------- скелетоны (заглушки до загрузки данных) ----------
function renderSkeletons() {
  const c = document.getElementById('movies-container');
  c.innerHTML = Array.from({ length: 8 }, () =>
    '<div class="movie-card skeleton-card"><div class="skel poster"></div><div class="skel line"></div><div class="skel line short"></div></div>'
  ).join('');
}
renderSkeletons();

// Расстояние Левенштейна — для нечёткого поиска по названиям
function _levDist(a, b) {
  a = String(a); b = String(b);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

// ---------- ежедневные челленджи: панель на главной ----------
// v109: панель стала «Целью дня» — сворачивается, помнит состояние,
// а когда всё выполнено — кнопка забрать баллы в боте.
const CHALL_COLLAPSE_KEY = 'kinoafisha_chall_collapsed';
// v123: салют при закрытии всех задач дня — один раз за день за сессию
let _challSparkKey = '';
const _challDayKey = () => new Date().toDateString();
function updateChallPane() {
  const pane = document.getElementById('chall-pane');
  if (!pane) return;
  const c = getChallenges();
  const listEl = document.getElementById('chall-list');
  const countEl = document.getElementById('chall-count');
  // v146: по умолчанию «Цель дня» свёрнута — афиша выше; раскрытие запоминается
  const collapsed = localStorage.getItem(CHALL_COLLAPSE_KEY) !== '0';
  const items = CHALLENGE_LIST.map(ch => {
    const ok = c.done.includes(ch.id) || ch.check();
    return `<div class="chall-item ${ok ? 'done' : ''}">
      <span class="chall-emoji">${ch.emoji}</span>
      <div class="chall-body">
        <b>${esc(ch.name)}</b>
        <span>${esc(ch.desc)}</span>
      </div>
      <span class="chall-check">${ok ? '✅' : '○'}</span>
    </div>`;
  }).join('');
  listEl.innerHTML = items;
  if (collapsed) listEl.classList.add('hidden');
  else listEl.classList.remove('hidden');
  const doneCount = CHALLENGE_LIST.filter(ch => c.done.includes(ch.id) || ch.check()).length;
  if (countEl) {
    // v123: «Цель дня» — кольцевой прогресс вместо текста «2/3»: видно и сколько
    // закрыто, и сколько осталось, без чтения мелкой дроби
    const full = doneCount === CHALLENGE_LIST.length;
    countEl.innerHTML = ringHtml(Math.round(100 * doneCount / CHALLENGE_LIST.length), {
      size: 34, stroke: 4, xs: true, tone: full ? 'done' : '',
      label: `${doneCount}/${CHALLENGE_LIST.length}`,
    });
    countEl.title = `${doneCount} из ${CHALLENGE_LIST.length} задач закрыто`;
    if (full && _challSparkKey !== _challDayKey()) {
      _challSparkKey = _challDayKey();
      sparkBurst(pane);
    }
  }
  // v109: кнопка награды — видна, когда выполнены все три задания
  const rewardEl = document.getElementById('chall-reward');
  if (rewardEl) {
    const allDone = doneCount === CHALLENGE_LIST.length;
    rewardEl.classList.toggle('hidden', !allDone);
    if (allDone && !c.done.includes('reward_sent')) {
      rewardEl.onclick = () => {
        haptic('ok');
        sendOrDeepLink({ action: 'quiz_result', correct: CHALLENGE_LIST.length, total: CHALLENGE_LIST.length });
        try {
          const cc = getChallenges();
          cc.done.push('reward_sent');
          setChallenges(cc);
          rewardEl.classList.add('hidden');
        } catch (e) {}
      };
    } else if (allDone) {
      rewardEl.textContent = '✅ Баллы за цель дня уже забраны';
      rewardEl.onclick = null;
    }
  }
  // v109: тумблер сворачивания
  const head = document.getElementById('chall-head');
  if (head && !head.dataset.wired) {
    head.dataset.wired = '1';
    head.addEventListener('click', (e) => {
      if (e.target.closest('#chall-reward')) return;
      const nowCollapsed = !(localStorage.getItem(CHALL_COLLAPSE_KEY) !== '0');
      localStorage.setItem(CHALL_COLLAPSE_KEY, nowCollapsed ? '1' : '0');
      haptic('light');
      updateChallPane();
    });
  }
  pane.classList.remove('hidden');
  // после показа — если все сделаны, добавим поздравление
  if (doneCount === CHALLENGE_LIST.length && !c.done.includes('all_done')) {
    c.done.push('all_done');
    setChallenges(c);
  }
}

// ---------- коллекция кодов (сетка всех кодов в Дастижениях) ----------
function renderCodeCollection() {
  const wrap = document.getElementById('code-collection');
  if (!wrap) return;
  const unlocked = getUnlocked();
  const unlockedSet = new Set(unlocked.map(String));
  const all = [...ALL].sort((a, b) => (+a.code || 0) - (+b.code || 0));
  if (all.length < 2) { wrap.classList.add('hidden'); return; }
  const openPct = all.length ? Math.round(100 * unlocked.length / all.length) : 0;
  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <div class="coll-head">
      <h3>🔑 Коллекция кодов</h3>
      <span>${unlocked.length}/${all.length} · ${openPct}%</span>
    </div>
    <div class="cap-scene" id="cap-scene">
      <canvas aria-label="Капитан Кино идёт и собирает коды"></canvas>
      <div class="cap-bubble" role="button"></div>
      <div class="cap-count">Тапни — Капитан прыгнет</div>
      <button class="cap-play" id="btn-cap-play">▶ Играть</button>
    </div>
    <div class="coll-grid">${all.map(m => {
      const ok = unlockedSet.has(String(m.code));
      return `<span class="coll-cell ${ok ? 'on' : ''}" title="${esc(m.title)}"
          data-code="${esc(m.code)}">${ok ? '🎬' : '❔'}</span>`;
    }).join('')}</div>`;
  wrap.querySelectorAll('.coll-cell.on').forEach(cell =>
    cell.addEventListener('click', () => openDetail(cell.dataset.code)));
  try { startCaptainScene(wrap.querySelector('#cap-scene'), unlocked, all); } catch (e) {}
  wrap.querySelector('#btn-cap-play')?.addEventListener('click', (e) => { e.stopPropagation(); haptic('light'); openCaptainGame(); });
}

// ---------- v155: «Капитан в пути» — 2D-игра: Капитан идёт и подбирает ваши открытые коды ----------
// Canvas без библиотек. Золотые жетоны — реальные открытые коды пользователя; подобрал —
// над головой всплывает название фильма (тап по облачку открывает карточку).
// Тап — прыжок. Два режима: спокойная сцена в «Достижениях» (без препятствий) и раунд на 45 секунд
// (кнопка «Играть»): очки за путь и жетоны, комбо, препятствия-попкорн, личный рекорд на устройстве.
// Баллы бота за игру не начисляются — только рекорд и удовольствие.
let CAP_STOP = null, CAP_GAME_STOP = null;
// Локации раунда: каждые 15 секунд меняется фон (ночной город → кинозал → красная дорожка).
// Цвета: [небо сверху, небо снизу, силуэты, дорога].
const CAP_ZONE_SEC = 15;
const CAP_ZONES = [
  null,   // нулевая — случайная из CAP_START_PALS
  { name: '🎞 Кинозал', c: ['#2b0d12', '#5a1a24', '#7a2a35', '#2a0f14'] },
  { name: '🌟 Красная дорожка', c: ['#0b0b14', '#1b1b2e', '#2c2c4a', '#7a1426'] },
];
const CAP_START_PALS = [['#0b1230', '#1d2b5a', '#243a6e', '#10182f'], ['#2a1245', '#6a2f6e', '#4b2a63', '#1a0d2b'], ['#07262b', '#14505a', '#1c5f6b', '#0a1c20']];
function capHexToRgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
function capMix(a, b, t) {
  const A = capHexToRgb(a), B = capHexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function capDayStr(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function capGoalStreak() {       // серия дней цели, если она ещё «жива» (выполнена сегодня или вчера)
  try {
    const g = JSON.parse(localStorage.getItem(CAP_GOAL_KEY) || 'null');
    if (!g || !g.day) return 0;
    return (g.day === capDayStr(new Date()) || g.day === capDayStr(new Date(Date.now() - 86400000))) ? (g.n || 0) : 0;
  } catch (e) { return 0; }
}
// Звук игры: синтез WebAudio, без файлов. По умолчанию ВЫКЛ (ключ kino_cap_sound = '1' включает).
const CAP_SOUND_KEY = 'kino_cap_sound';
let _capAudio = null;
function capSoundOn() { try { return localStorage.getItem(CAP_SOUND_KEY) === '1'; } catch (e) { return false; } }
function capSfx(name) {
  if (!capSoundOn()) return;
  try {
    if (!_capAudio) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; _capAudio = new AC(); }
    const a = _capAudio; if (a.state === 'suspended') a.resume();
    const tone = (f0, f1, dur, type, vol, delay) => {
      const t0 = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
      g.gain.setValueAtTime(vol || 0.08, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    };
    if (name === 'jump') tone(320, 620, 0.12, 'square', 0.04);
    else if (name === 'coin') { tone(880, 880, 0.07, 'triangle', 0.08); tone(1320, 1320, 0.11, 'triangle', 0.08, 0.06); }
    else if (name === 'ticket') { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.1, 'triangle', 0.08, i * 0.07)); }
    else if (name === 'hit') tone(220, 70, 0.22, 'sawtooth', 0.07);
    else if (name === 'tick') tone(660, 660, 0.08, 'sine', 0.07);
    else if (name === 'go') tone(990, 1320, 0.22, 'triangle', 0.09);
    else if (name === 'win') { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.16, 'triangle', 0.08, i * 0.09)); }
    else if (name === 'end') { [392, 330].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.07, i * 0.14)); }
  } catch (e) { /* звук не критичен */ }
}
const CAP_BEST_KEY = 'kino_cap_best';
const CAP_ROUND_SEC = 45;
const CAP_GOAL = 600;                 // цель дня: очков за раунд
const CAP_GOAL_KEY = 'kino_cap_goal';  // {day, n}: последний день выполнения цели и серия дней
function startCaptainScene(wrap, unlocked, all, opts = {}) {
  const game = !!opts.game;
  if (game) { if (CAP_GAME_STOP) CAP_GAME_STOP(); } else if (CAP_STOP) CAP_STOP();
  const canvas = wrap.querySelector('canvas');
  const bubble = wrap.querySelector('.cap-bubble');
  const counter = wrap.querySelector('.cap-count');
  if (!canvas || !canvas.getContext) return () => {};
  const ctx = canvas.getContext('2d');
  const H = opts.H || 150, GY = H - 26;
  const reduce = !game && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const byCode = new Map(all.map(m => [String(m.code), m]));
  const codes = unlocked.map(String).filter(c => byCode.has(c));
  const level = codes.length;           // наряд растёт вместе с коллекцией
  let W = 0, dpr = 1;
  function fit() {
    W = Math.max(240, wrap.clientWidth || 320);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();

  let off = 0, ph = 0, jumpY = 0, vy = 0, got = 0, bubbleTimer = 0, last = performance.now();
  let score = 0, combo = 0, elapsed = 0, stumble = 0, flash = 0, over = false, hintShown = false;
  let bestStart = 0, recSaid = false, sprint = false, qActive = false, qDone = false;
  if (game) { try { bestStart = parseInt(localStorage.getItem(CAP_BEST_KEY) || '0', 10) || 0; } catch (e) {} }
  let jumps = 0, magnet = 0, shield = false;
  const zone0 = game ? CAP_START_PALS[Math.floor(Math.random() * CAP_START_PALS.length)] : CAP_START_PALS[0];
  let pal = zone0.slice(), prevPal = zone0.slice(), zone = 0, zoneT = 9;
  const streakDays = capGoalStreak();   // очки — за серию цели 3+ дня
  const tokens = [], obstacles = [], flyers = [], sparks = [];
  let nextFly = Infinity;
  let cursor = Math.floor(Math.random() * Math.max(1, codes.length));
  let nextX = W * 0.75, nextObs = W * 1.1;
  function spawn() {
    let high = Math.random() < 0.4;
    if (high && flyers.some(f => Math.abs(f.x - nextX) < 80)) high = false;   // под хлопушкой высоко не прыгают
    const t = { x: nextX, y: GY - (high ? 92 : 40), high, got: false };
    if (game && Math.random() < 0.1) t.ticket = true;                 // 🎟 билет-магнит
    else if (codes.length) { t.code = codes[cursor % codes.length]; cursor++; } else { t.lock = true; }
    tokens.push(t);
    nextX += 120 + Math.random() * 90;
  }
  function spawnObstacle() {
    let x = nextObs;
    if (tokens.some(t => !t.high && Math.abs(t.x - x) < 45)) x += 70;   // не поверх жетона у земли
    if (flyers.some(f => Math.abs(f.x - x) < 130)) x += 140;            // и не рядом с хлопушкой
    obstacles.push({ x, hit: false });
    nextObs = x + 230 + Math.random() * 170;
  }
  function spawnFlyer() {
    let x = nextFly;
    if (obstacles.some(o => Math.abs(o.x - x) < 130)) x += 140;
    if (tokens.some(t => t.high && Math.abs(t.x - x) < 80)) x += 90;
    flyers.push({ x, hit: false, y: GY - 80 });
    nextFly = x + 340 + Math.random() * 260;
  }
  while (nextX < W * 2) spawn();
  if (game) while (nextObs < W * 2) spawnObstacle();

  function say(html, code, secs) {
    if (!bubble) return;
    bubble.innerHTML = html; bubble.dataset.code = code || '';
    bubble.classList.add('show'); bubbleTimer = secs || 2.6;
  }
  function jump() {
    if (over || (opts.ctl && opts.ctl.hold)) return;
    if (jumpY === 0 && vy === 0) { vy = 330; jumps = 1; haptic('light'); if (game) capSfx('jump'); }
    else if (jumps === 1) { vy = 290; jumps = 2; if (game) capSfx('jump'); sparkle(W * 0.28, GY - 30 - jumpY, '#ffffff', 6); haptic('light'); }   // двойной прыжок
  }
  canvas.onpointerdown = jump;
  if (bubble) bubble.onclick = () => { const c = bubble.dataset.code; if (c) { if (opts.onOpen) opts.onOpen(); openDetail(c); } };

  function sparkle(x, y, color, n = 9) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 40 + Math.random() * 70;
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: 0.6, color });
    }
  }
  function leg(x, y, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#16264a'; ctx.fillRect(-2.5, 0, 5, 13);
    ctx.fillStyle = '#2b1b12'; ctx.fillRect(-3, 12, 8, 4);
    ctx.restore();
  }
  function arm(x, y, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#244a86'; ctx.fillRect(-2, 0, 4, 11);
    ctx.fillStyle = '#f2c9a0'; ctx.beginPath(); ctx.arc(0, 12, 2.6, 0, 6.28); ctx.fill();
    ctx.restore();
  }
  function drawCaptain(cx, base, airborne) {
    const bob = airborne ? 0 : Math.abs(Math.sin(ph)) * 2;
    const sw = airborne ? 0.9 : Math.sin(ph) * 0.7;
    const tilt = stumble > 0 ? Math.sin(elapsed * 40) * 0.08 : 0;
    const y0 = base - bob;
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(cx, GY + 2, Math.max(6, 13 - jumpY / 12), 3.5, 0, 0, 6.28); ctx.fill();
    ctx.save(); ctx.translate(cx, y0); ctx.rotate(tilt); ctx.translate(-cx, -y0);
    if (level >= 100) {                     // синий плащ — за 100 открытых кодов
      const wv = Math.sin(ph * 2) * 3;
      ctx.fillStyle = '#2d4fa8';
      ctx.beginPath(); ctx.moveTo(cx - 8, y0 - 40); ctx.lineTo(cx + 2, y0 - 40);
      ctx.lineTo(cx - 8 - 16 - wv, y0 - 12); ctx.lineTo(cx - 8 - 6 - wv, y0 - 8); ctx.closePath(); ctx.fill();
    }
    arm(cx - 9, y0 - 36, -sw);
    leg(cx - 3, y0 - 14, sw); leg(cx + 3, y0 - 14, -sw);
    ctx.fillStyle = '#1f3a68';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - 10, y0 - 40, 20, 27, 5) : ctx.rect(cx - 10, y0 - 40, 20, 27);
    ctx.fill();
    ctx.fillStyle = '#f5c542';
    ctx.beginPath(); ctx.arc(cx + 2, y0 - 33, 1.6, 0, 6.28); ctx.arc(cx + 2, y0 - 27, 1.6, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#0f1c38'; ctx.fillRect(cx - 10, y0 - 19, 20, 3);
    if (level >= 25) {                      // медаль — за 25 открытых кодов
      ctx.fillStyle = '#e24b4b'; ctx.beginPath(); ctx.arc(cx - 5, y0 - 33, 2.6, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffd96a'; ctx.fillRect(cx - 5.7, y0 - 37, 1.4, 3);
    }
    if (level >= 50) {                      // красный шарф — за 50 открытых кодов
      const wv = Math.sin(ph * 2 + 1) * 3;
      ctx.fillStyle = '#d93b3b'; ctx.fillRect(cx - 9, y0 - 42, 18, 4);
      ctx.beginPath(); ctx.moveTo(cx - 9, y0 - 40); ctx.lineTo(cx - 24 - wv, y0 - 36 - wv / 2); ctx.lineTo(cx - 23 - wv, y0 - 31 - wv / 2); ctx.lineTo(cx - 8, y0 - 36); ctx.closePath(); ctx.fill();
    }
    arm(cx + 9, y0 - 36, sw);
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath(); ctx.arc(cx, y0 - 49, 9, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx + 3.5, y0 - 50, 1.3, 0, 6.28); ctx.fill();
    if (streakDays >= 3) { ctx.fillStyle = '#0d0d12'; ctx.fillRect(cx - 1, y0 - 52.5, 11, 4); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(cx + 1, y0 - 52, 3, 1.2); }   // очки — за серию цели 3+ дня
    ctx.strokeStyle = '#8a4b2a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx + 1, y0 - 45); ctx.quadraticCurveTo(cx + 6, y0 - 44, cx + 9, y0 - 46); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, y0 - 53, 9.5, Math.PI, 0); ctx.fill();
    ctx.fillStyle = level >= 10 ? '#d9a521' : '#16264a'; ctx.fillRect(cx - 9.5, y0 - 55, 19, 4);   // золотой околыш — за 10 кодов
    ctx.fillStyle = '#111'; ctx.fillRect(cx + 1, y0 - 51.5, 12, 2.4);
    ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.arc(cx, y0 - 57, 2.3, 0, 6.28); ctx.fill();
    ctx.restore();
  }
  function drawToken(t) {
    const x = t.x - off, y = t.y + Math.sin((t.x + off * 0.3) / 18) * 3;
    ctx.save();
    if (t.ticket) {
      ctx.translate(x, y); ctx.rotate(-0.12);
      ctx.fillStyle = '#e24b4b'; ctx.fillRect(-16, -10, 32, 20);
      ctx.fillStyle = '#0b1230'; ctx.beginPath(); ctx.arc(-16, 0, 4, 0, 6.28); ctx.arc(16, 0, 4, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🧲', 0, 1);
      ctx.restore(); return;
    }
    ctx.fillStyle = t.lock ? '#56607a' : '#f5c542';
    ctx.strokeStyle = t.lock ? '#7a859f' : '#fff2b0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = t.lock ? '#d5dbea' : '#4a3200';
    ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.lock ? '?' : String(t.code).slice(0, 4), x, y + 0.5);
    ctx.restore();
  }
  function drawObstacle(o) {       // ведёрко попкорна
    const x = o.x - off, y = GY;
    ctx.save();
    ctx.globalAlpha = o.hit ? 0.35 : 1;
    ctx.fillStyle = '#fff3d0';
    for (const [dx, dy, r] of [[-7, -27, 5], [0, -30, 6], [7, -27, 5], [-3, -24, 5], [4, -24, 5]]) {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, 6.28); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(x - 12, y - 24); ctx.lineTo(x + 12, y - 24); ctx.lineTo(x + 9, y); ctx.lineTo(x - 9, y); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#d93b3b';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(x + i * 8 - 3, y - 24); ctx.lineTo(x + i * 8 + 3, y - 24);
      ctx.lineTo(x + i * 6 + 2, y); ctx.lineTo(x + i * 6 - 2, y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function drawFlyer(f) {          // летающая хлопушка 🎬
    const x = f.x - off, y = f.y + Math.sin(elapsed * 4 + f.x) * 4;
    ctx.save(); ctx.globalAlpha = f.hit ? 0.35 : 1; ctx.translate(x, y);
    ctx.fillStyle = '#1b1b1f'; ctx.fillRect(-15, -4, 30, 16);
    ctx.fillStyle = '#f4f4f4';
    ctx.save(); ctx.rotate(-0.25 + Math.sin(elapsed * 8 + f.x) * 0.12);
    ctx.fillRect(-15, -12, 30, 8);
    ctx.fillStyle = '#1b1b1f';
    for (let i = -12; i < 14; i += 8) { ctx.beginPath(); ctx.moveTo(i, -12); ctx.lineTo(i + 4, -12); ctx.lineTo(i, -4); ctx.lineTo(i - 4, -4); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = '#e24b4b'; ctx.fillRect(-12, 2, 10, 2); ctx.fillRect(-12, 6, 20, 2);
    ctx.restore();
  }
  function drawScene() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 18; i++) {
      const sx = ((i * 97 - off * 0.08) % (W + 20) + (W + 20)) % (W + 20) - 10;
      ctx.fillRect(sx, 12 + (i * 37) % Math.max(60, H - 90), 1.5, 1.5);
    }
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.fillRect(0, 22, W, 20);
    for (let x = -((off * 0.25) % 16); x < W; x += 16) ctx.clearRect(x + 4, 25, 8, 4), ctx.clearRect(x + 4, 35, 8, 4);
    ctx.fillStyle = pal[2];
    for (let i = 0; i < 6; i++) {
      const bx = ((i * 140 - off * 0.35) % (W + 160) + (W + 160)) % (W + 160) - 80;
      ctx.fillRect(bx, GY - 26 - (i % 3) * 10, 46, 26 + (i % 3) * 10);
    }
    if (game && zone === 2) {                              // прожекторы красной дорожки
      const a = Math.min(1, zoneT / 1.5) * 0.10;
      ctx.fillStyle = `rgba(255,230,160,${a})`;
      for (let k = 0; k < 2; k++) {
        const bx = W * (0.25 + 0.5 * k) + Math.sin(elapsed * 0.9 + k * 2) * 40;
        ctx.beginPath(); ctx.moveTo(bx - 6, 0); ctx.lineTo(bx + 6, 0); ctx.lineTo(bx + 70, GY); ctx.lineTo(bx - 70, GY); ctx.closePath(); ctx.fill();
      }
    }
    ctx.fillStyle = pal[3]; ctx.fillRect(0, GY, W, H - GY);
    ctx.fillStyle = '#f5c542';
    for (let x = -(off % 40); x < W; x += 40) ctx.fillRect(x, GY + 12, 18, 3);
  }
  function drawHud() {
    ctx.save();
    ctx.font = '700 13px system-ui, sans-serif'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.fillText(`Счёт ${Math.floor(score)}`, 10, 8);
    if (combo >= 2) { ctx.fillStyle = '#ffd96a'; ctx.fillText(`комбо ×${Math.min(combo, 5)}`, 10, 26); }
    if (magnet > 0) { ctx.textAlign = 'center'; ctx.fillStyle = '#ffd96a'; ctx.fillText(`🧲 ${Math.ceil(magnet)}`, W / 2, 8); }
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
    ctx.fillText(`⏱ ${Math.max(0, Math.ceil(CAP_ROUND_SEC - elapsed))}`, W - 10, 8);
    const gp = Math.min(1, score / CAP_GOAL);                     // полоска цели дня
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(10, 44, W - 20, 3);
    ctx.fillStyle = gp >= 1 ? '#7be07b' : '#ffd96a'; ctx.fillRect(10, 44, (W - 20) * gp, 3);
    if (shield) { ctx.textAlign = 'left'; ctx.fillStyle = '#8cdcff'; ctx.fillText('🛡', 10, 26 + (combo >= 2 ? 18 : 0)); ctx.textAlign = 'center'; }
    if (sprint) { ctx.textAlign = 'center'; ctx.fillStyle = '#ff9f43'; ctx.fillText('×2', W / 2, 26); }
    ctx.restore();
  }
  function finish() {
    over = true;
    const final = Math.floor(score);
    let best = 0;
    try { best = parseInt(localStorage.getItem(CAP_BEST_KEY) || '0', 10) || 0; } catch (e) {}
    const record = final > best;
    if (record) { try { localStorage.setItem(CAP_BEST_KEY, String(final)); } catch (e) {} }
    // цель дня: серия дней подряд, когда набрано CAP_GOAL очков
    const dayStr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const today = dayStr(new Date()), yest = dayStr(new Date(Date.now() - 86400000));
    let goal = { day: '', n: 0 };
    try { goal = JSON.parse(localStorage.getItem(CAP_GOAL_KEY) || '') || goal; } catch (e) {}
    const doneBefore = goal.day === today;
    let goalNew = false;
    if (final >= CAP_GOAL && !doneBefore) {
      goal = { day: today, n: goal.day === yest ? (goal.n || 0) + 1 : 1 };
      try { localStorage.setItem(CAP_GOAL_KEY, JSON.stringify(goal)); } catch (e) {}
      goalNew = true;
    }
    const nextOutfit = level < 10 ? [10, 'золотой околыш'] : level < 25 ? [25, 'медаль'] : level < 50 ? [50, 'красный шарф'] : level < 100 ? [100, 'синий плащ'] : null;
    haptic(record || goalNew ? 'ok' : 'light'); capSfx(record || goalNew ? 'win' : 'end');
    if (opts.onEnd) opts.onEnd({ score: final, got, best: Math.max(best, final), record,
      goalDone: doneBefore || goalNew, goalNew, goalLeft: Math.max(0, CAP_GOAL - final), streak: goal.n || 0,
      outfitLeft: nextOutfit ? nextOutfit[0] - level : 0, outfitName: nextOutfit ? nextOutfit[1] : '' });
  }
  // v168: вопрос по фильму из коллекции — раз за раунд, на ~20-й секунде; игра ждёт ответа
  function askFilmQ() {
    const pool = codes.map(c => byCode.get(c)).filter(m => m && parseInt(m.year, 10) > 1900);
    qDone = true;
    if (pool.length < 3 || !wrap) return;
    const m = pool[Math.floor(Math.random() * pool.length)];
    const y = parseInt(m.year, 10);
    const opt = new Set([y]);
    const near = [-3, -2, -1, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
    for (const d of near) { if (opt.size >= 3) break; if (y + d <= new Date().getFullYear()) opt.add(y + d); }
    const list = [...opt].sort(() => Math.random() - 0.5);
    qActive = true;
    const box = document.createElement('div');
    box.className = 'cap-q';
    box.innerHTML = `<div class="cap-q-card"><div class="cap-q-tag">🎬 Вопрос от Капитана · +150</div>
      <div class="cap-q-text">В каком году вышел фильм<br><b>«${esc(m.title)}»</b>?</div>
      <div class="cap-q-opts">${list.map(v => `<button data-y="${v}">${v}</button>`).join('')}</div></div>`;
    wrap.appendChild(box);
    box.querySelectorAll('button').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const ok = parseInt(b.dataset.y, 10) === y;
      box.querySelectorAll('button').forEach(x => { x.disabled = true; if (parseInt(x.dataset.y, 10) === y) x.classList.add('ok'); });
      if (!ok) b.classList.add('bad');
      if (ok) { score += 150; haptic('ok'); capSfx('win'); } else { haptic('light'); capSfx('hit'); }
      setTimeout(() => {
        box.remove(); qActive = false; last = performance.now();
        say(ok ? '✅ Верно! +150 очков' : `Это был ${y} год 🙂`, '', 1.8);
      }, 1100);
    }));
  }
  function frame(dt) {
    const speed = game ? (70 + Math.min(70, elapsed * 1.6)) * (stumble > 0 ? 0.4 : 1) : 55;
    off += speed * dt; ph += speed * dt / 9;
    if (game) {
      elapsed += dt;
      if (!qDone && elapsed >= 20 && elapsed < CAP_ROUND_SEC - 10) { askFilmQ(); return; }
      const sprintNow = elapsed >= CAP_ROUND_SEC - 8;          // финишный рывок: последние 8 секунд — очки ×2
      if (sprintNow && !sprint) { sprint = true; say('🏁 Финишный рывок · очки ×2', '', 2); capSfx('ticket'); }
      score += speed * dt / 10 * (sprint ? 2 : 1);
      if (!recSaid && bestStart > 0 && score > bestStart) { recSaid = true; say('🏆 Это новый рекорд! Не останавливайся', '', 2); haptic('medium'); }
      const z = Math.min(CAP_ZONES.length - 1, Math.floor(elapsed / CAP_ZONE_SEC));
      if (z !== zone) {
        prevPal = pal.slice(); zone = z; zoneT = 0;
        say(`${CAP_ZONES[z].name} · скорость растёт`, '', 1.8);
      }
      zoneT += dt;
      if (zone > 0) { const t = Math.min(1, zoneT / 1.5); pal = CAP_ZONES[zone].c.map((c, i) => capMix(prevPal[i], c, t)); }
      if (stumble > 0) stumble -= dt;
      if (flash > 0) flash -= dt;
      if (elapsed >= CAP_ROUND_SEC) { finish(); return; }
    }
    if (vy !== 0 || jumpY > 0) {
      vy -= 900 * dt; jumpY += vy * dt;
      if (jumpY <= 0) { jumpY = 0; vy = 0; jumps = 0; }
    }
    const capX = W * 0.28;
    if (magnet > 0) {
      magnet -= dt;
      for (const t of tokens) {
        if (t.got || t.ticket) continue;
        const dx = t.x - off - capX;
        if (Math.abs(dx) < 160) { t.x -= dx * dt * 3.5; t.y += ((GY - 30 - jumpY) - t.y) * dt * 4; }
      }
    }
    for (const t of tokens) {
      if (t.got) continue;
      const tx = t.x - off;
      if (Math.abs(tx - capX) < 20 && Math.abs(t.y - (GY - 30 - jumpY)) < 34) {
        t.got = true;
        if (t.ticket) {
          magnet = 6; capSfx('ticket'); sparkle(tx, t.y, '#ff8a8a', 12);
          say('🎟 Билет! Жетоны сами летят к Капитану', '', 1.8); haptic('medium');
          continue;
        }
        got++;
        sparkle(tx, t.y, t.lock ? '#9aa6c6' : '#ffd96a');
        if (game) { combo++; if (combo === 5 && !shield) { shield = true; say('🛡 Комбо ×5 — щит! Один удар не страшен', '', 1.8); } score += (t.lock ? 5 : 20 * Math.min(combo, 5)) * (sprint ? 2 : 1); capSfx('coin'); }
        if (t.lock) {
          if (!game || !hintShown) { hintShown = true; say('Пока пусто 🔍 Пришлите боту код — Капитан его подберёт.'); }
        } else {
          const m = byCode.get(String(t.code));
          say(`🔑 <b>${esc(m.title)}</b> · код ${esc(t.code)}`, t.code);
          haptic('light');
        }
        if (counter && !game) counter.textContent = `В пути подобрано: ${got}`;
      }
    }
    if (game) {
      for (const o of obstacles) {
        if (o.hit) continue;
        if (Math.abs(o.x - off - capX) < 16 && jumpY < 22) {
          o.hit = true;
          sparkle(o.x - off, GY - 20, '#fff3d0', 12);
          if (shield) { shield = false; say('🛡 Щит выдержал удар!', '', 1.4); capSfx('ticket'); haptic('light'); }
          else { combo = 0; stumble = 0.5; flash = 0.25; say('Ой, попкорн! 🍿 Прыгай заранее', '', 1.4); capSfx('hit'); haptic('medium'); }
        }
      }
      while (obstacles.length && obstacles[0].x - off < -40) obstacles.shift();
      while (nextObs - off < W * 1.6) spawnObstacle();
      if (elapsed > 10 && !isFinite(nextFly)) nextFly = off + W * 1.3;       // хлопушки появляются после 10-й секунды
      if (isFinite(nextFly)) while (nextFly - off < W * 1.6) spawnFlyer();
      for (const f of flyers) {
        if (f.hit) continue;
        if (Math.abs(f.x - off - capX) < 18 && jumpY > 10 && jumpY < 95) {
          f.hit = true;
          sparkle(f.x - off, f.y, '#ffffff', 12);
          if (shield) { shield = false; say('🛡 Щит выдержал удар!', '', 1.4); capSfx('ticket'); haptic('light'); }
          else { combo = 0; stumble = 0.5; flash = 0.25; say('Ой, хлопушка! 🎬 Под ней не прыгай — просто беги', '', 1.6); capSfx('hit'); haptic('medium'); }
        }
      }
      while (flyers.length && flyers[0].x - off < -40) flyers.shift();
    }
    while (tokens.length && tokens[0].x - off < -40) tokens.shift();
    while (nextX - off < W * 1.6) spawn();
    for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; s.life -= dt; }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
    if (bubbleTimer > 0) { bubbleTimer -= dt; if (bubbleTimer <= 0 && bubble) bubble.classList.remove('show'); }
  }
  function draw() {
    drawScene();
    obstacles.forEach(drawObstacle);
    flyers.forEach(drawFlyer);
    tokens.forEach(t => { if (!t.got) drawToken(t); });
    drawCaptain(W * 0.28, GY - jumpY, jumpY > 0);
    if (game && shield) { ctx.strokeStyle = `rgba(140,220,255,${0.55 + 0.25 * Math.sin(elapsed * 6)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W * 0.28, GY - jumpY - 28, 34, 0, 6.28); ctx.stroke(); }
    for (const s of sparks) { ctx.globalAlpha = Math.max(0, s.life / 0.6); ctx.fillStyle = s.color; ctx.fillRect(s.x, s.y, 3, 3); }
    ctx.globalAlpha = 1;
    if (flash > 0) { ctx.fillStyle = `rgba(255,80,80,${flash})`; ctx.fillRect(0, 0, W, H); }
    if (game) drawHud();
  }

  let raf = 0, stopped = false, visible = true, io = null;
  function stop() { stopped = true; cancelAnimationFrame(raf); if (io) io.disconnect(); }
  function loop(now) {
    if (stopped) return;
    if (!document.body.contains(canvas)) { stop(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (visible && !document.hidden && !over) {
      if (Math.abs(wrap.clientWidth - W) > 4 && wrap.clientWidth) fit();
      if (!(opts.ctl && opts.ctl.hold) && !qActive) frame(dt);
      draw();
    }
    if (over) { draw(); stop(); return; }
    raf = requestAnimationFrame(loop);
  }
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(es => { visible = es[0].isIntersecting; last = performance.now(); });
    io.observe(canvas);
  }
  if (reduce) { draw(); return stop; }
  if (game) CAP_GAME_STOP = stop; else CAP_STOP = stop;
  raf = requestAnimationFrame(loop);
  return stop;
}

// Раунд на 45 секунд в полноэкранной панели: заставка «Готов?» → отсчёт 3-2-1 → игра.
function openCaptainGame() {
  if (CAP_STOP) { CAP_STOP(); CAP_STOP = null; }
  let ov = document.getElementById('cap-game');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'cap-game'; ov.className = 'cap-game';
  ov.innerHTML = `
    <div class="cap-game-card">
      <button class="cap-game-snd" aria-label="Звук">${capSoundOn() ? '🔊' : '🔇'}</button>
      <button class="cap-game-x" aria-label="Закрыть">✕</button>
      <h3>🎮 Капитан в пути</h3>
      <div class="cap-legend"><span><i>👆</i>тап — прыжок<br>в воздухе — второй</span><span><i>🪙</i>жетоны<br>= очки</span><span><i>🎟</i>билет —<br>магнит</span><span><i>🍿</i>перепрыгни<br>попкорн</span><span><i>🎬</i>под хлопушкой<br>просто беги</span></div>
      <p class="cap-game-hint">Комбо ×5 даёт щит · на ${CAP_ROUND_SEC > 20 ? '20-й секунде' : 'середине'} вопрос про твой фильм (+150) · в конце очки ×2 · цель дня — <b>${CAP_GOAL}</b></p>
      <div class="cap-scene" id="cap-game-scene">
        <canvas aria-label="Игра: Капитан Кино собирает коды"></canvas>
        <div class="cap-bubble" role="button"></div>
        <div class="cap-ready hidden"></div>
      </div>
      <div class="cap-result hidden"></div>
    </div>`;
  document.body.appendChild(ov);
  const scene = ov.querySelector('#cap-game-scene');
  const result = ov.querySelector('.cap-result');
  const ready = ov.querySelector('.cap-ready');
  const H = Math.max(170, Math.min(300, Math.round(window.innerHeight * 0.4)));
  const unlocked = getUnlocked();
  let stopGame = () => {}, timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function close() {
    clearTimers(); stopGame(); if (CAP_GAME_STOP) CAP_GAME_STOP();
    ov.remove();
    if (!document.getElementById('view-achievements').classList.contains('hidden')) renderCodeCollection();
  }
  function countdown(ctl) {
    ready.classList.remove('hidden');
    const steps = ['3', '2', '1', 'Поехали!'];
    steps.forEach((t, i) => timers.push(setTimeout(() => {
      ready.innerHTML = `<span class="cap-count-num">${t}</span>`;
      haptic('light'); capSfx(i === 3 ? 'go' : 'tick');
      if (i === 3) { ctl.hold = false; timers.push(setTimeout(() => ready.classList.add('hidden'), 450)); }
    }, i * 650)));
  }
  function run(withIntro) {
    clearTimers();
    result.classList.add('hidden'); result.innerHTML = '';
    const ctl = { hold: true };
    stopGame = startCaptainScene(scene, unlocked, ALL, {
      game: true, H, ctl, onOpen: () => { close(); },
      onEnd: (r) => {
        const share = 'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/kapitan_kino_bot') +
          '&text=' + encodeURIComponent(`Я набрал ${r.score} очков в игре «Капитан в пути» 🎬 Сможешь больше?`);
        result.innerHTML = `
          <div class="cap-stars">${[0.34, 0.67, 1].map(k => `<i class="${r.score >= CAP_GOAL * k ? 'on' : ''}">★</i>`).join('')}</div>
          <div class="cap-res-score"><span id="cap-sc">0</span> <small>очков</small></div>
          <div class="cap-res-line">${r.record ? '<span class="cap-rec">🏆 Новый рекорд!</span>' : `Рекорд: <b>${r.best}</b>`}</div>
          <div class="cap-res-stats"><span><b>${r.got}</b><em>жетонов</em></span><span><b>${r.best}</b><em>рекорд</em></span><span><b>${r.streak || 0}</b><em>дн. подряд 🎯</em></span></div>
          <div class="cap-goalbar ${r.goalDone ? 'done' : ''}"><div><i style="width:${Math.min(100, Math.round(r.score / CAP_GOAL * 100))}%"></i></div><em>${r.goalDone
            ? `🎯 Цель дня выполнена${r.goalNew ? '!' : ''}`
            : `🎯 Цель дня ${CAP_GOAL}: ещё ${r.goalLeft} очков`}</em></div>
          ${r.outfitLeft ? `<div class="cap-res-line cap-outfit">👒 Открой ещё ${r.outfitLeft} ${(r.outfitLeft % 10 === 1 && r.outfitLeft % 100 !== 11) ? 'код' : ([2, 3, 4].includes(r.outfitLeft % 10) && ![12, 13, 14].includes(r.outfitLeft % 100)) ? 'кода' : 'кодов'} — и Капитан получит ${r.outfitName}</div>` : ''}
          <div class="cap-res-btns">
            <button class="btn-primary" data-act="again">Ещё раз</button>
            <button class="btn-secondary" data-act="share">Поделиться</button>
          </div>`;
        result.classList.remove('hidden');
        { const el = result.querySelector('#cap-sc'); const t0 = performance.now(); const tick = (t) => { const k = Math.min(1, (t - t0) / 900); if (el && el.isConnected) { el.textContent = Math.round(r.score * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); } }; requestAnimationFrame(tick); }
        if (r.record || r.goalNew) { try { confetti(24); } catch (e) {} haptic('ok'); }
        result.querySelector('[data-act=again]').onclick = () => { haptic('light'); run(false); };
        result.querySelector('[data-act=share]').onclick = () => { haptic('light'); try { tg.openTelegramLink(share); } catch (e) {} };
        scheduleCloudSync(3000);   // рекорд и цель дня уезжают в облако профиля
      },
    });
    ready.classList.remove('hidden');
    if (withIntro) {
      ready.innerHTML = '<span class="cap-ready-title">Готов?</span><button class="btn-primary cap-go">▶ Поехали</button>';
      ready.querySelector('.cap-go').onclick = (e) => { e.stopPropagation(); haptic('light'); ready.innerHTML = ''; countdown(ctl); };
    } else { ready.innerHTML = ''; countdown(ctl); }
  }
  ov.querySelector('.cap-game-x').onclick = close;
  ov.querySelector('.cap-game-snd').onclick = (e) => {
    const on = !capSoundOn();
    try { localStorage.setItem(CAP_SOUND_KEY, on ? '1' : '0'); } catch (err) {}
    e.currentTarget.textContent = on ? '🔊' : '🔇';
    if (on) capSfx('coin');
  };
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  run(true);
}

// ---------- hero-полка «Сейчас в тренде» ----------
// Живая строка статистики в шапке
function updateSubtitle() {
  const el = document.getElementById('subtitle');
  if (!el) return;
  const parts = [plFilms(ALL.length)];   // v189: короткая строка — не переносится на 2 строки
  if (COLLS.length) parts.push(`${COLLS.length} подборок`);
  el.textContent = parts.join(' · ');
}

// Чипы жанров: собираются из витрины, тап — фильтр сетки
let LAST_TOP_GENRES = [];
function renderGenreChips() {
  const wrap = document.getElementById('genre-chips');
  if (!wrap) return;
  const counter = new Map();
  ALL.forEach(m => (m.genres || []).forEach(g => counter.set(g, (counter.get(g) || 0) + 1)));
  const top = [...counter.entries()].filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1]).slice(0, 10);
  LAST_TOP_GENRES = top.map(([g]) => g);
  if (!top.length) return;
  wrap.innerHTML = `<button class="chip chip-rnd" data-g="__rnd__" title="Случайный жанр">🎲</button>` +
    `<button class="chip${activeGenre === '' ? ' active' : ''}" data-g="">Все</button>` +
    top.map(([g, n]) =>
      `<button class="chip${activeGenre === g ? ' active' : ''}" data-g="${esc(g)}">${esc(g)} <em>${n}</em></button>`
    ).join('');
  wrap.classList.remove('hidden');
  wrap.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
    haptic('light');
    if (ch.dataset.g === '__rnd__') {
      const pool = LAST_TOP_GENRES.filter(g => g !== activeGenre);
      if (!pool.length) return;
      activeGenre = pool[Math.floor(Math.random() * pool.length)];
    } else {
      activeGenre = ch.dataset.g;
    }
    renderGenreChips();
    renderGrid();
  }));
}
function renderCountryChips() {
  const wrap = document.getElementById('country-chips');
  if (!wrap) return;
  const counter = new Map();
  ALL.forEach(m => (m.countries || []).forEach(g => counter.set(g, (counter.get(g) || 0) + 1)));
  const top = [...counter.entries()].filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1]).slice(0, 9);
  if (!top.length) { wrap.classList.add('hidden'); return; }
  wrap.innerHTML = `<button class="chip${activeCountry === '' ? ' active' : ''}" data-c="">🌍 Все</button>` +
    top.map(([c, n]) =>
      `<button class="chip${activeCountry === c ? ' active' : ''}" data-c="${esc(c)}">${flagOf(c)} ${esc(c)} <em>${n}</em></button>`
    ).join('');
  wrap.classList.remove('hidden');
  wrap.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
    haptic('light');
    activeCountry = ch.dataset.c || '';
    renderCountryChips();
    renderGrid();
  }));
}
function renderHero() {
  const top = [...ALL]
    .filter(m => m.poster && parseFloat(m.rating))
    .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0))
    .slice(0, 5);
  const shelf = document.getElementById('hero-shelf');
  if (top.length < 3 || !shelf) return;
  document.getElementById('hero-row').innerHTML = top.map((m, i) => `
    <div class="hero-card" data-code="${esc(m.code)}">
      ${posterHtmlQuick(m, { foot: false })}
      <span class="hero-rank">#${i + 1}</span>
      <div class="hero-overlay">
        <h3>${esc(m.title)}</h3>
        ${ratingBadge(m)}
      </div>
    </div>`).join('');
  shelf.classList.remove('hidden');
  shelf.querySelectorAll('.hero-card').forEach(el =>
    el.addEventListener('click', () => openDetail(el.dataset.code)));
  wireFavQuick(shelf);
}

// v102: полка «🆕 Новинки недели» — последние добавленные фильмы. Сортировка по added_at,
// чтобы игроки сразу видели свежие коды канала. v109: бейдж давности «N дн.».
function renderNewCodes() {
  const shelf = document.getElementById('new-codes-shelf');
  if (!shelf) return;
  let items = [...ALL]
    .filter(m => m.added_at)
    .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
    .slice(0, 8);
  // v152: в данных поле added_at часто пустое — тогда «новыми» считаем самые большие
  // номера кодов (коды выдаются по порядку добавления), без подписи «N дн. назад».
  const byCode = items.length < 3;
  if (byCode) {
    items = [...ALL]
      .filter(m => /^\d+$/.test(String(m.code)))
      .sort((a, b) => parseInt(b.code, 10) - parseInt(a.code, 10))
      .slice(0, 8);
  }
  if (items.length < 3 || !shelf) { shelf.classList.add('hidden'); return; }
  const daysAgo = (m) => byCode ? 99 : Math.max(0, Math.floor((Date.now() - new Date(m.added_at).getTime()) / 86400000));
  const row = document.getElementById('new-codes-row');
  row.innerHTML = items.map(m => {
    const d = daysAgo(m);
    const fresh = d <= 1 ? '🔥 сегодня' : (d <= 7 ? `🕒 ${d} дн. назад` : '');
    return `
    <div class="hero-card" data-code="${esc(m.code)}">
      ${posterHtmlQuick(m)}
      <span class="hero-rank">🔑 ${esc(String(m.code))}</span>
      ${fresh ? `<span class="new-badge">${fresh}</span>` : ''}
      <div class="hero-overlay">
        <h3>${esc(m.title)}</h3>
        ${ratingBadge(m)}
      </div>
    </div>`}).join('');
  shelf.classList.remove('hidden');
  shelf.querySelectorAll('.hero-card').forEach(el =>
    el.addEventListener('click', () => openDetail(el.dataset.code)));
  wireFavQuick(shelf);
}

// Полка «🍿 Скоро в кино» — премьеры текущего месяца от бота/КП
// «⭐ Сегодня и завтра в кино» — премьеры с датой сегодня/завтра
// «2026-11-05» → «5 ноября» (v148)
function ruDayMonth(iso) {
  const m = String(iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso || '').slice(0, 10);
  const mon = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'][parseInt(m[2], 10) - 1];
  return mon ? `${parseInt(m[3], 10)} ${mon}` : String(iso).slice(0, 10);
}

// Не-фильмы в премьерах (театральные трансляции, опера, балет, концерты):
// Кинопоиск отдаёт их как «премьеры», но в «Сегодня и завтра в кино» им не место.
const NON_FILM_RE = /театр|(?:^|[^а-яё])опер[аыу](?![а-яё])|балет|концерт|спектакл|трансляц|metropolitan|bolshoi|ток-?шоу|(?:^|\s)live(?:\s|$)/i;
function onlyFilms(list) {
  return (Array.isArray(list) ? list : []).filter(p => !NON_FILM_RE.test(String(p && p.title || '')));
}

function renderTodayShelf(meta) {
  const shelf = document.getElementById('today-shelf');
  if (!shelf) return;
  const items = onlyFilms(meta && meta.premieres);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const soon = items.filter(p => {
    const d = p.ru_date ? new Date(String(p.ru_date).slice(0, 10) + 'T00:00:00') : null;
    return d && (d.getTime() === now.getTime() || d.getTime() === tomorrow.getTime());
  });
  if (soon.length === 0) { shelf.classList.add('hidden'); return; }
  const row = document.getElementById('today-row');
  row.innerHTML = soon.map(p => `
    <div class="hero-card" data-title="${esc(p.title || '')}">
      ${p.poster
        ? `<img src="${esc(p.poster)}" alt="" loading="lazy" ${FADE} onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>`
        : `<div class="poster-placeholder"><span>⭐</span></div>`}
      <span class="hero-rank">⭐</span>
      <div class="hero-overlay">
        <h3>${esc(p.title || '')}</h3>
        <span class="rating">📅 ${ruDayMonth(p.ru_date)}</span>
      </div>
    </div>`).join('');
  shelf.classList.remove('hidden');
  row.querySelectorAll('.hero-card').forEach(el => el.addEventListener('click', () => {
    const title = (el.dataset.title || '').toLowerCase().replace(/ё/g, 'е');
    const m = ALL.find(x => (x.title || '').toLowerCase().replace(/ё/g, 'е') === title);
    if (m) openDetail(m.code);
    else tg.showPopup({ type: 'ok', title: '⭐ Сегодня в кино', message: 'В кинотеатрах уже идёт! Увидимся на сеансе 🎟' });
  }));
}

// «⭐ Фильм дня» — hero-баннер на главной: детерминированно выбираем фильм
// по дате (у всех пользователей в один день — один и тот же фильм)
let _fdManual = null;  // v89: локальная «перебросанная» версия дня (только у этого пользователя)
function filmDayPick() {
  let cands = ALL.filter(m => (parseFloat(m.rating) || 0) >= 7.3 && m.poster);
  if (cands.length < 5) return null;
  // v191: фильм дня — из ещё не просмотренных (если все просмотрены — из всех)
  try { const seen = new Set(getWatched()); const fresh = cands.filter(m => !seen.has(m.code)); if (fresh.length >= 3) cands = fresh; } catch (e) {}
  if (_fdManual && cands.some(x => x.code === _fdManual)) {
    const m = cands.find(x => x.code === _fdManual);
    if (m) return m;
  }
  const d = new Date();
  const seed = d.getFullYear() * 373 + (d.getMonth() + 1) * 31 + d.getDate();
  return cands[seed % cands.length];
}
function renderFilmDay() {
  const el = document.getElementById('filmday-banner');
  if (!el) return;
  const m = (view === 'fav') ? null : filmDayPick();  // в «Моём» баннер лишний
  if (!m) { el.classList.add('hidden'); return; }
  const fav = getFavs().includes(m.code);
  const genres = (m.genres || []).slice(0, 3).join(' · ');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="fd-poster">${m.poster
      ? `<img src="${esc(m.poster)}" alt="" loading="lazy" decoding="async" ${FADE}${dimStyle(m)} onerror="this.style.display='none';this.parentElement.classList.add('fd-noposter')"/>`
      : '<div class="fd-ph">🎬</div>'}</div>
    <div class="fd-info">
        <span class="fd-badge">⭐ Фильм дня</span>
        <div class="fd-title">${esc(m.title)}</div>
        <div class="fd-meta">${esc(String(m.year || ''))}${m.year && m.rating ? ' · ' : ''}⭐ ${esc(String(m.rating || ''))}${genres ? ' · ' + esc(genres) : ''}</div>
      </div>
      <button class="fd-roll" id="fd-roll" title="Другой фильм дня">🎲</button>
      <button class="fav-quick ${fav ? 'active' : ''}" data-code="${esc(m.code)}" aria-label="Моё" title="В «Моё»">${fav ? '♥\uFE0E' : '♡'}</button>`;
  el.onclick = (e) => {
    if (e.target.closest('#fd-roll')) return;  // кнопка «другой» не открывает карточку
    if (e.target.closest('.fav-quick')) return;
    openDetail(m.code);
  };
  const rollBtn = document.getElementById('fd-roll');
  if (rollBtn) rollBtn.onclick = (ev) => {
    ev.stopPropagation();
    haptic('light');
    const cands = ALL.filter(x => (parseFloat(x.rating) || 0) >= 7.3 && x.poster && String(x.code) !== String(m.code));
    if (!cands.length) return;
    _fdManual = cands[Math.floor(Math.random() * cands.length)].code;
    renderFilmDay();
  };
  wireFavQuick(el);
}

// «🕘 Недавно смотрели» — история из localStorage, показываем на главной
function renderRecentShelf() {
  const shelf = document.getElementById('recent-shelf');
  if (!shelf) return;
  const codes = getRecent().filter(c => ALL.some(x => x.code === c));
  if (codes.length < 2) { shelf.classList.add('hidden'); return; }
  const items = codes.slice(0, 10).map(code => ALL.find(x => x.code === code));
  shelf.querySelector('#recent-row').innerHTML = items.map(m => `
    <div class="hero-card" data-code="${esc(m.code)}">
      ${posterHtmlQuick(m)}
      <div class="hero-overlay">
        <h3>${esc(m.title)}</h3>
        <span class="rating">${ratingBadge(m)}</span>
      </div>
    </div>`).join('');
  shelf.classList.remove('hidden');
  shelf.querySelectorAll('.hero-card').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.code)));
  wireFavQuick(shelf);
}

// v74: «🎬 Продолжить смотреть» — последние просмотренные трейлеры.
// Живая полка: тап по карточке переоткрывает трейлер (с хронологией свежих сверху).
function renderTrailerShelf() {
  const shelf = document.getElementById('continue-shelf');
  if (!shelf) return;
  if (view !== 'grid' && view !== 'fav') { shelf.classList.add('hidden'); return; }
  const tw = getTrailerWatches().filter(x => ALL.some(m => String(m.code) === String(x.c))).slice(0, 10);
  if (tw.length < 1) { shelf.classList.add('hidden'); return; }
  const items = tw.map(x => ALL.find(m => String(m.code) === String(x.c))).filter(Boolean)
    .filter(m => m.trailer_yt || m.trailer_file_id);
  if (!items.length) { shelf.classList.add('hidden'); return; }
  const row = shelf.querySelector('#continue-row');
  row.innerHTML = items.map((m, i) => {
    // v109: мини-прогресс просмотра (секунды), если трейлер реально смотрели
    const x = tw[i];
    const sec = (x && x.sec) || watchProgress(m.code);
    const bar = sec >= 3 ? `<span class="watch-bar" style="width:${Math.min(100, Math.round(100 * sec / 180))}%"></span>` : '';
    return `
    <div class="hero-card" data-code="${esc(m.code)}">
      ${posterHtmlQuick(m)}
      <span class="continue-chip">▶️ ${sec >= 60 ? 'посмотрел(а) ' + Math.round(sec / 60) + ' мин' : (sec >= 3 ? 'смотрел(а) ' + sec + ' сек' : 'продолжить')}</span>
      ${bar}
      <div class="hero-overlay">
        <h3>${esc(m.title)}</h3>
        <span class="rating">${ratingBadge(m)}</span>
      </div>
    </div>`}).join('');
  shelf.classList.remove('hidden');
  row.querySelectorAll('.hero-card').forEach(el => el.addEventListener('click', () => {
    const m = ALL.find(x => String(x.code) === String(el.dataset.code));
    if (m) openTrailer(m);
  }));
  wireFavQuick(shelf);
}

// «💫 Советуем вам» — v64: персональные рекомендации на основе твоих оценок,
// «Моё», разгаданных и просмотренных (жанры + актёры), без выхода из аппа.
function renderRecoShelf() {
  const shelf = document.getElementById('reco-shelf');
  if (!shelf) return;
  if (view === 'profile' || view === 'game') return;
  const favs = getFavs();
  const unlocked = getUnlocked();
  const watched = getWatched();
  const ratings = getRatings();
  const seen = new Set([...favs, ...unlocked, ...watched, ...getRecent().slice(0, 4)]
    .map(c => String(c)));
  // «вкус»: жанры и актёры из того, что ты оценил/сохранил/разгадал.
  // Высокая оценка — сильный сигнал, низкая — почти нейтральный.
  const genreScore = new Map(), actorScore = new Map();
  const feed = (code, w) => {
    const m = ALL.find(x => String(x.code) === String(code));
    if (!m) return;
    (m.genres || []).forEach(g => genreScore.set(g, (genreScore.get(g) || 0) + w));
    (m.actors || []).slice(0, 5).forEach(a => actorScore.set(a, (actorScore.get(a) || 0) + w * 0.6));
  };
  Object.entries(ratings).forEach(([code, r]) => feed(code, ratingWeight(r)));
  favs.forEach(code => feed(code, 2.2));
  unlocked.forEach(code => feed(code, 1.8));
  watched.forEach(code => feed(code, 1.2));
  const hasTaste = genreScore.size > 0 || actorScore.size > 0;
  const hidden = new Set(getRecoHide());
  const cands = ALL.filter(m => !seen.has(String(m.code)) && !hidden.has(m.code));
  let picks = [];
  if (hasTaste) {
    const scored = cands.map(m => {
      let score = 0;
      (m.genres || []).forEach(g => { score += genreScore.get(g) || 0; });
      (m.actors || []).forEach(a => { score += (actorScore.get(a) || 0) * 0.8; });
      score += Math.max(0, (parseFloat(m.rating) || 0) - 6.5);   // бонус качества
      return { m, score };
    });
    scored.sort((a, b) => b.score - a.score);
    picks = scored.slice(0, 8).map(x => x.m);
  } else {
    // у новичка ещё нет вкуса — показываем лучшее по рейтингу КП
    picks = [...cands]
      .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0))
      .slice(0, 8);
  }
  const title = shelf.querySelector('.shelf-title');
  if (title) title.textContent = hasTaste ? '💫 Подобрано по твоим оценкам' : '💫 Лучшее в афише';
  if (picks.length < 2) { shelf.classList.add('hidden'); return; }
  shelf.querySelector('#reco-row').innerHTML = picks.map(m => `
    <div class="hero-card" data-code="${esc(m.code)}">
      ${posterHtmlQuick(m)}
      ${m.genres && m.genres.length ? `<span class="hero-rank reco-chip">${esc(m.genres[0])}</span>` : ''}
      <button class="reco-hide" data-code="${esc(m.code)}" aria-label="Не рекомендовать" title="Скрыть">✕</button>
      <div class="hero-overlay">
        <h3>${esc(m.title)}</h3>
        <span class="rating">${ratingBadge(m)}</span>
      </div>
    </div>`).join('');
  shelf.classList.remove('hidden');
  shelf.querySelectorAll('.hero-card').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.code)));
  wireFavQuick(shelf);
  shelf.querySelectorAll('.reco-hide').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      haptic('light');
      const h = new Set(getRecoHide());
      h.add(btn.dataset.code);
      setRecoHide([...h]);
      renderRecoShelf();
    });
  });
}

// ---------- v119: счётчик дней до премьеры («через 5 дней», «завтра») ----------
const _normTitle = (t) => (t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
function premiereForTitle(title) {
  const q = _normTitle(title);
  if (!q) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const p = (PREMIERES || []).find(x => _normTitle(x.title) === q);
  if (!p || !p.ru_date) return null;
  const d = new Date(String(p.ru_date).slice(0, 10) + 'T00:00:00');
  if (isNaN(d) || d < today) return null;  // прошлое/сегодня в прошлом — не премьера
  const days = Math.round((d - today) / 86400000);
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
  const human = days === 0 ? 'сегодня' : days === 1 ? 'завтра' : days <= 4 ? `через ${days} дня` : `через ${days} дней`;
  // v120: iso — для диплинка напоминания, fid — film_id КП (бот по нему найдёт название)
  return { date: `${dd}.${mm}`, iso: String(p.ru_date).slice(0, 10), fid: p.film_id ? String(p.film_id) : '', days, human };
}

function renderPremieres(meta) {
  const shelf = document.getElementById('premieres-shelf');
  if (!shelf) return;
  const items = onlyFilms(meta && meta.premieres);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pending = items.filter(p => {
    const d = p.ru_date ? new Date(String(p.ru_date).slice(0, 10) + 'T00:00:00') : null;
    return !d || d >= today;
  }).slice(0, 10);
  if (pending.length < 2) { shelf.classList.add('hidden'); return; }
  document.getElementById('premieres-row').innerHTML = pending.map(p => {
    const title = p.title || '';
    // v119: «17.09 · через 5 дней» вместо сырой даты
    const pi = premiereForTitle(title);
    const dateText = pi ? `${pi.date} · 🎬 ${pi.human}`
      : (p.ru_date ? String(p.ru_date).slice(0, 10) : (p.date || ''));
    return `
    <div class="hero-card" data-title="${esc(title)}" data-fid="${esc(p.film_id ? String(p.film_id) : '')}" data-iso="${p.ru_date ? esc(String(p.ru_date).slice(0, 10)) : ''}">
      ${p.poster
        ? `<img src="${esc(p.poster)}" alt="" loading="lazy" ${FADE} onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>`
        : `<div class="poster-placeholder"><span>🍿</span></div>`}
      <span class="hero-rank">🍿</span>
      <div class="hero-overlay">
        <h3>${esc(title)}</h3>
        <span class="rating">${esc(dateText ? '📅 ' + dateText : '')}</span>
      </div>
    </div>`;
  }).join('');
  shelf.classList.remove('hidden');
  shelf.querySelectorAll('.hero-card').forEach(el => el.addEventListener('click', () => {
    const title = (el.dataset.title || '').toLowerCase().replace(/ё/g, 'е');
    const m = ALL.find(x => (x.title || '').toLowerCase().replace(/ё/g, 'е') === title);
    if (m) openDetail(m.code);
    else if (el.dataset.fid && el.dataset.iso) {
      // v120: премьеры ещё нет в афише — самое полезное действие: напомнить о ней
      sendOrDeepLink({ action: 'remind_premiere', iso: el.dataset.iso, fid: el.dataset.fid });
    }
    else { haptic('light'); tg.showPopup({ type: 'ok', title: '🍿 Скоро в кино', message: 'Фильм ещё не в афише — следи за постами канала!' }); }
  }));
}

function showCodeDay(meta) {
  const code = (meta && meta.code_of_day) || '';
  const banner = document.getElementById('code-day-banner');
  if (!code || !banner) return;
  const m = ALL.find(x => x.code === code);
  banner.innerHTML = `
    <div class="code-day-inner">
      <span class="code-day-label">🎁 Код дня</span>
      <span class="code-day-code">🔑 ${esc(code)}</span>
      ${m ? `<span class="code-day-title"> • ${esc(m.title)}</span>` : ''}
      <button class="kd-open-btn" id="btn-cod-open">Открыть</button>
      <button class="btn-bell" id="btn-cod-bell" title="Напоминать каждый день">🔔</button>
    </div>`;
  banner.classList.remove('hidden');
  document.getElementById('btn-cod-open').onclick = () => openDetail(code);
  const bell = document.getElementById('btn-cod-bell');
  if (bell) bell.onclick = () => {
    haptic('ok');
    sendOrDeepLink({ action: 'subscribe_code_day' });
  };
}

// ---------- v74: «🎬 Кино-марафон» — трейлеры подряд ----------
const MARATHON_SECONDS = 120;              // таймер авто-далее (~2 мин на трейлер)
// v122: трейлер считается «просмотренным» только после MAR_WATCH_MIN_SEC секунд
// на шаге — иначе стрелки «Далее» накручивали прогресс жанров и ачивки марафона.
const MAR_WATCH_MIN_SEC = 15;
let _mar = {
  list: [], i: 0, paused: false, timer: null, creditTimer: null,
  secLeft: MARATHON_SECONDS, deadline: 0, watchStart: 0, credited: false,
};
// v82: прогресс марафона — виденные коды, «досмотреть позже», ачивки-мильстоуны
const MAR_SEEN_KEY = 'kinoafisha_marathon_seen';
const MAR_RESUME_KEY = 'kinoafisha_marathon_resume';
const MAR_ACH_KEY = 'kinoafisha_marathon_ach';
const getMarSeen = () => new Set(JSON.parse(localStorage.getItem(MAR_SEEN_KEY) || '[]').map(String));
const MAR_ACHS = [
  [10, '🏅 Марафонец', '10 трейлеров в марафонах'],
  [25, '🔥 Киноман', '25 трейлеров в марафонах'],
  [50, '👑 Легенда марафона', '50 трейлеров в марафонах'],
];
function _marathonBump(code) {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(MAR_SEEN_KEY) || '[]'); } catch (e) { seen = []; }
  if (!seen.map(String).includes(String(code))) seen.push(code);
  localStorage.setItem(MAR_SEEN_KEY, JSON.stringify(seen));
  let achs = [];
  try { achs = JSON.parse(localStorage.getItem(MAR_ACH_KEY) || '[]'); } catch (e) { achs = []; }
  MAR_ACHS.forEach(([n, title, sub]) => {
    if (seen.length >= n && !achs.includes(n)) {
      achs.push(n);
      try { tg.showPopup({ type: 'ok', title: title, message: 'Ачивка получена: ' + sub + '! 🎉' }); } catch (e) { /* пусто */ }
    }
  });
  localStorage.setItem(MAR_ACH_KEY, JSON.stringify(achs));
}

function openMarathon(list, label = '', startIdx = 0) {
  const items = list.filter(m => m && (m.trailer_yt || m.trailer_file_id));
  if (items.length < 1) return;
  if (items.length < 2) { openTrailer(items[0]); return; }
  _mar = {
    list: items, i: Math.max(0, Math.min(startIdx | 0, items.length - 1)),
    paused: false, timer: null, creditTimer: null, secLeft: MARATHON_SECONDS,
    deadline: 0, watchStart: 0, credited: false, label,
  };
  const modal = document.getElementById('marathon-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  // v132: марафон — это тоже кинорежим, поэтому сразу на весь экран
  // (внутри section_06 определён enterAppFullscreen; try — на случай порядка
  // инициализации секций).
  try { enterAppFullscreen(); } catch (e) { /* пусто */ }
  _marathonGo();
}

function _marathonGo() {
  const m = _mar.list[_mar.i];
  if (!m) return closeMarathon(false);
  const frame = document.getElementById('marathon-frame');
  const name = document.getElementById('marathon-name');
  const metaEl = document.getElementById('marathon-meta');
  const count = document.getElementById('marathon-count');
  const title = document.getElementById('marathon-title');
  if (title) title.textContent = '🎬 Кино-марафон' + (_mar.label ? ' · ' + _mar.label : '');
  if (frame) {
    if (m.trailer_yt) {
      frame.classList.remove('hidden');
      frame.src = 'https://www.youtube.com/embed/' + m.trailer_yt + '?autoplay=1&rel=0&playsinline=1&fs=1';
    } else {
      frame.classList.add('hidden');
      frame.src = 'about:blank';
      sendOrDeepLink({ action: 'trailer_movie', code: m.code });
    }
  }
  if (name) name.textContent = m.title || '';
  const g = (m.genres || []).slice(0, 2).map(marGenreLabel).join(' · ');
  if (metaEl) metaEl.textContent = [m.year, m.rating ? '⭐ ' + m.rating : '', g].filter(Boolean).join(' · ');
  if (count) count.textContent = (_mar.i + 1) + ' / ' + _mar.list.length;
  // v97: точки-позиции плейлиста (короткие марафоны) — видно, где находишься
  const dots = document.getElementById('mar-dots');
  if (dots) {
    if (_mar.list.length <= 20) {
      dots.innerHTML = _mar.list.map((_, k) =>
        `<span class="mar-dot${k < _mar.i ? ' done' : ''}${k === _mar.i ? ' cur' : ''}"></span>`).join('');
      dots.classList.remove('hidden');
    } else {
      dots.classList.add('hidden');
    }
  }
  pushTrailerWatch(m.code);     // v74: «Продолжить смотреть» — трейлер открыт, пишем сразу
  // v122: «просмотрено» начисляем не по факту открытия, а по времени на шаге
  // (см. _marathonCredit) — листание стрелками больше не даёт ложный прогресс.
  clearTimeout(_mar.creditTimer);
  _mar.watchStart = Date.now();
  _mar.credited = false;
  _mar.creditTimer = setTimeout(_marathonCredit, MAR_WATCH_MIN_SEC * 1000);
  _mar.secLeft = MARATHON_SECONDS;
  _mar.deadline = Date.now() + MARATHON_SECONDS * 1000;
  _mar.paused = false;
  const p = document.getElementById('btn-marathon-pause');
  if (p) p.textContent = '⏸ Пауза';
  _marathonTick();
}

// v122: засчитывает текущий трейлер просмотренным, если на нём провели не меньше
// MAR_WATCH_MIN_SEC секунд. Идемпотентна (флаг credited), поэтому зовётся и по
// таймеру, и при переходе «Далее/Назад», и при закрытии марафона.
function _marathonCredit() {
  const m = _mar.list[_mar.i];
  if (!m || _mar.credited) return;
  if (Date.now() - (_mar.watchStart || 0) < MAR_WATCH_MIN_SEC * 1000) return;
  _mar.credited = true;
  clearTimeout(_mar.creditTimer);
  _marathonBump(m.code);      // v82: прогресс марафона + ачивки
  bumpWeekStat('trailers');   // «Моя неделя» / «Мой год»
}

function _marathonTick() {
  clearTimeout(_mar.timer);
  _mar.timer = setTimeout(() => {
    if (_mar.paused) return;
    // v122: остаток считаем по стенным часам, а не вычитанием единичек — свёрнутый
    // WebView глушит setTimeout, и после возврата марафон проскакивал сразу
    // несколько трейлеров.
    _mar.secLeft = Math.max(0, Math.round((_mar.deadline - Date.now()) / 1000));
    const bar = document.getElementById('mt-bar');
    const lab = document.getElementById('mt-label');
    if (bar) bar.style.width = Math.max(0, 100 * _mar.secLeft / MARATHON_SECONDS) + '%';
    if (lab) lab.textContent = _mar.secLeft <= 0 ? '⏭ далее…' : (_mar.secLeft + ' с');
    if (_mar.secLeft <= 0) { _marathonNext(); return; }
    _marathonTick();
  }, 1000);
}

function _marathonTogglePause() {
  _mar.paused = !_mar.paused;
  if (_mar.paused) {
    // v122: фиксируем остаток и останавливаем отсчёт — на паузе время не «убегает»
    _mar.secLeft = Math.max(0, Math.round((_mar.deadline - Date.now()) / 1000));
  } else {
    _mar.deadline = Date.now() + _mar.secLeft * 1000;
  }
  const b = document.getElementById('btn-marathon-pause');
  if (b) b.textContent = _mar.paused ? '▶️ Продолжить' : '⏸ Пауза';
  const lab = document.getElementById('mt-label');
  if (lab) lab.textContent = _mar.paused ? '⏸ Пауза' : (_mar.secLeft + ' с');
  if (!_mar.paused) _marathonTick();
  haptic('light');
}

function _marathonNext() {
  _marathonCredit();   // v122: шаг успевает засчитаться при ручном «Далее»
  if (_mar.i < _mar.list.length - 1) { _mar.i++; _marathonGo(); }
  else closeMarathon(true);
}
function _marathonPrev() {
  _marathonCredit();
  if (_mar.i > 0) { _mar.i--; _marathonGo(); }
}
function closeMarathon(done = false) {
  clearTimeout(_mar.timer);
  _marathonCredit();             // v122: шаг, на котором досмотрели 15+ секунд, засчитываем
  clearTimeout(_mar.creditTimer);
  // v82: недосмотренный марафон сохраняем — на экране марафона появится «досмотреть позже»
  try {
    if (!done && _mar.list.length >= 2 && _mar.i < _mar.list.length - 1) {
      localStorage.setItem(MAR_RESUME_KEY, JSON.stringify({
        codes: _mar.list.map(m => m.code), i: _mar.i, label: _mar.label || '',
      }));
    } else {
      localStorage.removeItem(MAR_RESUME_KEY);
    }
  } catch (e) { /* пусто */ }
  const modal = document.getElementById('marathon-modal');
  const frame = document.getElementById('marathon-frame');
  if (frame) frame.src = 'about:blank';
  if (modal) modal.classList.add('hidden');
  // v132: вышли из кинорежима — вернуть мини-апп в обычный размер.
  try { exitAppFullscreen(); } catch (e) { /* пусто */ }
  if (done) {
    try {
      tg.showPopup({ type: 'ok', title: '🎬 Марафон завершён!', message: 'Все трейлеры просмотрены. Запустить ещё раз? ▶️' });
    } catch (e) { /* пусто */ }
  }
}

// v122: свернул апп на середине марафона — ставим авто-паузу. WebView глушит
// таймеры в фоне, а встроенное видео обычно останавливается: без этого зритель
// возвращался уже на «следующем» трейлере, пропустив кусок текущего.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  const modal = document.getElementById('marathon-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (!_mar.list.length || _mar.paused) return;
  _mar.secLeft = Math.max(0, Math.round((_mar.deadline - Date.now()) / 1000));
  _mar.paused = true;
  clearTimeout(_mar.timer);
  const b = document.getElementById('btn-marathon-pause');
  if (b) b.textContent = '▶️ Продолжить';
  const lab = document.getElementById('mt-label');
  if (lab) lab.textContent = '⏸ Пауза';
  _marathonCredit();   // время на трейлере уже могли набрать — не теряем зачёт
});

// ---------- v97: навигация марафона — свайпы на телефоне, стрелки на ПК ----------
// Свайп влево = следующий трейлер, вправо = предыдущий (в модалке марафона).
// На ПК то же самое делают клавиши ← и →. Вертикальные жесты не трогаем —
// свайп вниз по шапке по-прежнему закрывает модалку (универсальный хендлер).
(() => {
  const modal = document.getElementById('marathon-modal');
  if (!modal) return;
  let sx = 0, sy = 0, on = false;
  modal.addEventListener('touchstart', (e) => {
    if (modal.classList.contains('hidden')) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    on = true;
  }, { passive: true });
  modal.addEventListener('touchend', (e) => {
    if (!on) return;
    on = false;
    if (modal.classList.contains('hidden')) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45) return;
    haptic('light');
    if (dx < 0) _marathonNext(); else _marathonPrev();
  }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { haptic('light'); _marathonNext(); }
    else if (e.key === 'ArrowLeft') { haptic('light'); _marathonPrev(); }
  });
})();

// ---------- v78: марафон по жанру + шаринг марафона ----------
// Чип «жанр · N трейлеров» собирает плейлист из всех фильмов жанра с трейлерами
// (сортировка по рейтингу), «🎲 Случайный» — вперемешку. Ссылкой можно
// поделиться: друг откроет афишу и марафон запустится сам (см. parseMarathonHash).
function marathonCandidates() {
  return ALL.filter(m => m.trailer_yt || m.trailer_file_id);
}

// v120: карточки марафона — иконки жанров, читаемые подписи и метрики.
// Ключи — так, как жанр пишет Кинопоиск (нижний регистр); неизвестный жанр
// получает общий 🎬, чтобы карточка никогда не оставалась без иконки.
const MAR_GENRE_ICONS = {
  'боевик': '💥', 'триллер': '🔪', 'ужасы': '👻', 'комедия': '😂', 'драма': '🎭',
  'фантастика': '🚀', 'криминал': '🔫', 'детектив': '🔍', 'мелодрама': '💕',
  'романтика': '💕', 'приключения': '🗺', 'фэнтези': '🐉', 'мистика': '🔮',
  'история': '🏛', 'исторический': '🏛', 'военный': '🎖', 'спорт': '🏆',
  'музыка': '🎵', 'биография': '📖', 'семейный': '👨‍👩‍👧', 'вестерн': '🤠',
  'документальный': '🎥', 'мультфильм': '🧸', 'аниме': '🎴',
};
function marGenreIcon(g) {
  return MAR_GENRE_ICONS[String(g || '').toLowerCase().trim()] || '🎬';
}
// «драма» из базы → «Драма»: жанры в базе в нижнем регистре, в UI это выглядит
// неопрятно, поэтому заголовок карточки всегда капитализируем.
function marGenreLabel(g) {
  const s = String(g || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
// «1 трейлер / 2 трейлера / 12 трейлеров» — без кривых «1 трейлеров».
function marPlural(n) {
  const num = Math.abs(parseInt(n, 10) || 0);
  const t = num % 100;
  if (t >= 11 && t <= 14) return ' трейлеров';
  const d = num % 10;
  if (d === 1) return ' трейлер';
  if (d >= 2 && d <= 4) return ' трейлера';
  return ' трейлеров';
}
// v122: жанров в базе больше двух экранов — сначала показываем первые
// MAR_GENRE_PAGE, остальные открываются кнопкой «Показать все».
const MAR_GENRE_PAGE = 12;
let marGenreLimit = MAR_GENRE_PAGE;
// v122: размер случайного марафона выбирает пользователь (по умолчанию 5).
let marRndSize = 5;

function renderMarathonView() {
  const box = document.getElementById('marathon-container');
  if (!box) return;
  if (!ALL.length) {
    // v124: база ещё грузится — показываем структуру раздела (скелетон), а не
    // пустой экран с нулями по всем жанрам
    box.innerHTML = `
      <div class="chain-card marathon-intro">
        <div class="mar-hero">
          <div class="skel mar-line"></div>
          <div class="skel mar-line short"></div>
        </div>
        <div class="mar-genre-grid">${Array.from({ length: 6 }, () =>
          '<div class="skel mar-card"></div>').join('')}</div>
      </div>`;
    return;
  }
  const withTr = marathonCandidates();
  const byGenre = {};
  withTr.forEach(m => (m.genres || []).forEach(g => {
    const k = g.trim();
    if (!k) return;
    (byGenre[k] = byGenre[k] || []).push(m);
  }));
  const allGenres = Object.entries(byGenre)
    .filter(([, arr]) => arr.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);
  const rows = allGenres.slice(0, Math.max(MAR_GENRE_PAGE, marGenreLimit));
  const withR = m => m.rating_kp || m.rating || 0;
  // v82: «досмотреть позже» + прогресс по жанрам
  let resume = null;
  try {
    const r = JSON.parse(localStorage.getItem(MAR_RESUME_KEY) || 'null');
    if (r && Array.isArray(r.codes)) {
      const rl = r.codes.map(c => ALL.find(x => String(x.code) === String(c)))
        .filter(x => x && (x.trailer_yt || x.trailer_file_id));
      if (rl.length >= 2 && r.i >= 0 && r.i < rl.length) {
        resume = { list: rl, i: Math.min(r.i, rl.length - 1), label: r.label || '' };
      }
    }
  } catch (e) { /* пусто */ }
  const seen = getMarSeen();
  const trCount = withTr.length;
  // v122: «новое» — то, что ещё ни разу не попадало в марафоны: именно его
  // подсовываем в случайный набор, чтобы марафон открывал фильмы, а не повторял.
  const unseen = withTr.filter(m => !seen.has(String(m.code)));
  // v122: прогресс до следующей марафонской ачивки (10/25/50) — вехи из section_02
  const achNext = MAR_ACHS.find(([n]) => seen.size < n) || null;
  box.innerHTML = `
    <div class="chain-card marathon-intro">
      <div class="mar-hero">
        <div class="mar-hero-top">
          <span class="mar-hero-icon">🎬</span>
          <div class="mar-hero-text">
            <h2 class="chain-title">Кино-марафон</h2>
            <p class="chain-sub">Трейлеры идут подряд сами — как сериал. Выбери жанр, доверься случаю или поделись марафоном ссылкой.</p>
          </div>
        </div>
        <div class="mar-hero-stats">
          <span class="mar-stat">🎞 <b>${allGenres.length}</b> жанров</span>
          <span class="mar-stat">▶️ <b>${trCount}</b>${marPlural(trCount)}</span>
          ${unseen.length ? `<span class="mar-stat">🆕 <b>${unseen.length}</b> новых</span>` : ''}
          <span class="mar-stat mar-stat-gold">🏅 <b>${seen.size}</b> пройдено</span>
        </div>
        <div class="mar-ach">
          <div class="mar-ach-top">
            <span class="mar-ach-name">${achNext ? achNext[1] : '👑 Все ачивки марафона'}</span>
            <span class="mar-ach-count">${achNext ? seen.size + ' / ' + achNext[0] : seen.size}</span>
          </div>
          <span class="mar-prog-track"><i style="width:${achNext ? Math.min(100, Math.round(100 * seen.size / achNext[0])) : 100}%"></i></span>
          <span class="mar-ach-sub">${achNext ? 'До ачивки: ' + (achNext[0] - seen.size) + marPlural(achNext[0] - seen.size) : 'Ты прошёл все марафонские рубежи!'}</span>
        </div>
      </div>
      <div class="mar-rnd">
        <span class="mar-rnd-label">🎲 Случайный марафон — сколько трейлеров?</span>
        <div class="mar-rnd-sizes">
          <span class="mar-rnd-cap">Длина</span>
          ${[3, 5, 10].map(n => `<button class="mar-size${marRndSize === n ? ' active' : ''}" data-n="${n}">${n}</button>`).join('')}
        </div>
      </div>
      <button class="btn-primary" id="btn-marathon-rnd">🎲 Собрать марафон (${Math.min(marRndSize, trCount)})</button>
    </div>
    ${resume ? `
    <div class="chain-card mar-resume">
      <div class="mar-resume-head">
        <span class="mar-resume-icon">⏸</span>
        <div class="mar-resume-text">
          <h3 class="mar-resume-title">Досмотреть позже</h3>
          <p class="mar-resume-sub">${resume.label ? '«' + esc(resume.label) + '»' : 'Твой марафон'}</p>
        </div>
        <span class="mar-resume-count">${resume.i + 1} / ${resume.list.length}</span>
      </div>
      <span class="mar-prog-track mar-prog-lg"><i style="width:${Math.round(100 * (resume.i + 1) / resume.list.length)}%"></i></span>
      <button class="btn-primary" id="btn-marathon-resume">▶️ Продолжить марафон</button>
      <button class="mar-resume-x" id="btn-marathon-resume-x">✕ Убрать</button>
    </div>` : ''}
    <div class="chain-card">
      <h3 class="chain-sub mar-section-head">🔥 По жанрам</h3>
      <div class="mar-genre-grid">
        ${rows.map(([g, arr]) => {
          const prog = arr.filter(m => seen.has(String(m.code))).length;
          const pct = Math.round(100 * prog / arr.length);
          const done = prog >= arr.length;
          return `
          <button class="mar-genre" data-g="${esc(g)}">
            <span class="mar-genre-head">
              <span class="mar-genre-icon">${marGenreIcon(g)}</span>
              <span class="mar-genre-name">${esc(marGenreLabel(g))}</span>
            </span>
            <span class="mar-genre-chips">
              <span class="mar-chip">🎬 ${arr.length}${marPlural(arr.length)}</span>
              <span class="mar-chip mar-chip-gold">⭐ до ${Math.max(...arr.map(withR)).toFixed(1)}</span>
            </span>
            <span class="mar-genre-foot">
              <span class="mar-genre-progress${done ? ' done' : ''}">${prog ? (done ? `✅ пройден · ${prog} / ${arr.length}` : `✅ ${prog} / ${arr.length}`) : '⬜ ещё не начат'}</span>
              <span class="mar-prog-track">${prog ? `<i style="width:${pct}%"></i>` : ''}</span>
            </span>
          </button>`;
        }).join('')}
      </div>
      ${allGenres.length > MAR_GENRE_PAGE ? `<button class="mar-more" id="btn-mar-more">${marGenreLimit >= allGenres.length ? '⬆️ Свернуть список' : '⬇️ Показать все жанры (' + allGenres.length + ')'}</button>` : ''}
    </div>`;
  const rs = document.getElementById('btn-marathon-resume');
  if (rs) rs.addEventListener('click', () => {
    haptic('ok');
    openMarathon(resume.list, resume.label, resume.i);
  });
  const rsx = document.getElementById('btn-marathon-resume-x');
  if (rsx) rsx.addEventListener('click', () => {
    localStorage.removeItem(MAR_RESUME_KEY);
    haptic('light');
    renderMarathonView();
  });
  const startGenre = (g) => {
    const arr = (byGenre[g] || []).slice().sort((a, b) => withR(b) - withR(a));
    haptic('ok');
    openMarathon(arr, 'Жанр: ' + marGenreLabel(g));
  };
  const more = document.getElementById('btn-mar-more');
  if (more) more.addEventListener('click', () => {
    marGenreLimit = marGenreLimit >= allGenres.length ? MAR_GENRE_PAGE : allGenres.length;
    haptic('light');
    renderMarathonView();
  });
  box.querySelectorAll('.mar-genre').forEach(b => b.addEventListener('click', () => startGenre(b.dataset.g)));
  // v122: чипы длины марафона (3/5/10) — выбор запоминается на время сессии
  box.querySelectorAll('.mar-size').forEach(b => b.addEventListener('click', () => {
    marRndSize = parseInt(b.dataset.n, 10) || 5;
    haptic('light');
    renderMarathonView();
  }));
  const rnd = document.getElementById('btn-marathon-rnd');
  if (rnd) rnd.addEventListener('click', () => {
    // v122: сперва непросмотренные — марафон должен открывать новое, а уже
    // пройденное идёт добором, если новинок не хватает до выбранной длины.
    const fresh = unseen.slice().sort(() => Math.random() - 0.5);
    const rest = withTr.filter(m => seen.has(String(m.code))).sort(() => Math.random() - 0.5);
    const pool = fresh.concat(rest).slice(0, Math.min(marRndSize, trCount));
    haptic('ok');
    openMarathon(pool, 'Случайный набор');
  });
}

function shareMarathon() {
  if (!_mar.list.length) return;
  const base = location.origin + location.pathname;
  const url = base + '#marathon=' + _mar.list.map(m => m.code).join(',');
  const label = _mar.label ? ' «' + _mar.label + '»' : '';
  const text = '🎬 Кино-марафон' + label + ' — ' + _mar.list.length +
    ' трейлеров подряд! Открой и смотри ▶️';
  haptic('light');
  try {
    tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text));
  } catch (e) {
    try { navigator.clipboard.writeText(url); tg.showPopup({ type: 'ok', message: 'Ссылка скопирована 📋' }); }
    catch (e2) { /* пусто */ }
  }
}

// v96: подтверждение подписки от бота — бот после успешной проверки открывает
// апп с хэшем #access=1, это единственный способ пройти гейт (обход убран).
function parseAccessHash() {
  if (!/(^|[#&])access=1/.test(location.hash || '')) return false;
  try { localStorage.setItem(ACCESS_KEY, '1'); } catch (e) {}
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
  return true;
}

function parseMarathonHash() {
  const m = (location.hash || '').match(/#marathon=([A-Za-z0-9,_-]+)/);
  if (!m) return;
  const codes = m[1].split(',').map(s => s.trim()).filter(Boolean);
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
  const apply = () => {
    const list = codes.map(c => ALL.find(x => String(x.code) === String(c))).filter(Boolean)
      .filter(x => x.trailer_yt || x.trailer_file_id);
    if (list.length >= 2) openMarathon(list, 'Марафон друга 🎁');
  };
  // данных может ещё не быть на момент загрузки — ждём коротким опросом
  let tries = 0;
  const t = setInterval(() => {
    if (ALL.length || ++tries > 50) { clearInterval(t); apply(); }
  }, 300);
}

// Кнопка «🎬 Марафон» в шапке каждой живой полки на главной (тренд/сегодня/недавно/рекомендации).
// Добавляем только если в полке ≥2 фильмов с трейлерами.
function addMarathonButtons() {
  document.querySelectorAll('#view-catalog .hero-shelf').forEach(shelf => {
    if (!['hero-shelf', 'recent', 'reco', 'today'].some(k => shelf.id.includes(k))) return;
    if (shelf.querySelector('.marathon-sm')) return;
    const row = shelf.querySelector('.hero-row');
    if (!row) return;
    const codes = Array.from(row.querySelectorAll('.hero-card')).map(el => el.dataset.code).filter(Boolean);
    const withTr = codes.filter(c => {
      const m = ALL.find(x => String(x.code) === String(c));
      return m && (m.trailer_yt || m.trailer_file_id);
    });
    if (withTr.length < 2) return;
    const title = shelf.querySelector('.shelf-title');
    if (!title) return;
    const wrap = document.createElement('div');
    wrap.className = 'shelf-title-row';
    title.parentElement.insertBefore(wrap, title);
    wrap.appendChild(title);
    const bt = document.createElement('button');
    bt.className = 'marathon-sm';
    bt.textContent = '🎬 ▶️ Марафон';
    bt.addEventListener('click', () => {
      haptic('light');
      const items = withTr.map(c => ALL.find(x => String(x.code) === String(c))).filter(Boolean);
      openMarathon(items, title.textContent);
    });
    wrap.appendChild(bt);
  });
}

// ---------- обработчики модалки марафона ----------
(function initMarathonModal() {
  const bg = document.getElementById('marathon-modal');
  if (!bg) return;
  bg.addEventListener('click', (e) => { if (e.target === bg) closeMarathon(false); });
  const close = document.getElementById('btn-marathon-close');
  if (close) close.addEventListener('click', () => closeMarathon(false));
  const next = document.getElementById('btn-marathon-next');
  if (next) next.addEventListener('click', () => { haptic('light'); _marathonNext(); });
  const prev = document.getElementById('btn-marathon-prev');
  if (prev) prev.addEventListener('click', () => { haptic('light'); _marathonPrev(); });
  const pause = document.getElementById('btn-marathon-pause');
  if (pause) pause.addEventListener('click', _marathonTogglePause);
  const share = document.getElementById('btn-marathon-share');
  if (share) share.addEventListener('click', shareMarathon);
})();

// ---------- 🗂 Коллекции по жанрам (визуальный трекер «собрано/всего») ----------
// v128: кураторские подборки (COLLS) показывают прогресс, но нет ОБЗОРА по
// жанрам — «сколько драм/триллеров всего и сколько я собрал». Этот блок даёт
// цель «собери жанр»: тап по жанру открывает афишу, отфильтрованную им.
// Живёт внутри view 'cols' (НЕ новый view — буквы статистики a-o исчерпаны,
// 'p' зарезервирован под overflow; см. VIEW_STAT_CODES в section_01).
const _GENRE_EMOJI = {
  'драма': '🎭', 'комедия': '😂', 'боевик': '💥', 'триллер': '😱', 'ужасы': '👻',
  'фантастика': '🚀', 'фэнтези': '🧙', 'детектив': '🔍', 'мелодрама': '💕',
  'приключения': '🗺️', 'мультфильм': '🎨', 'аниме': '🌸', 'криминал': '🕵️',
  'биография': '📜', 'военный': '🎖️', 'история': '🏛️', 'документальный': '📽️',
  'семейный': '👨‍👩‍👧', 'спорт': '🏅', 'музыка': '🎵', 'вестерн': '🤠',
};
function _genreEmoji(g) { return _GENRE_EMOJI[(g || '').toLowerCase()] || '🎬'; }

function genreShelvesHTML() {
  const counts = {};
  ALL.forEach(m => (m.genres || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; }));
  const unlocked = getUnlocked();
  const rows = Object.entries(counts)
    .filter(([, n]) => n >= 3)   // жанры-однодневки не показываем
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .slice(0, 12);
  if (!rows.length) return '';
  const cards = rows.map(([g, total]) => {
    const owned = ALL.filter(m => (m.genres || []).includes(g) && unlocked.includes(String(m.code))).length;
    const pct = total ? Math.round(100 * owned / total) : 0;
    const left = total - owned;
    const label = left > 0 ? `🔓 ${owned}/${total} · осталось ${left}` : `🔓 ${owned}/${total} — собрано! 🏆`;
    return `
    <div class="col-card genre-shelf" data-g="${esc(g)}">
      <span class="col-emoji">${_genreEmoji(g)}</span>
      <div class="col-body">
        <h3>${esc(g)}</h3>
        <p>${plFilms(total)}</p>
        <div class="col-progress"><i style="width:${pct}%"></i></div>
        <p class="col-progress-label">${label}</p>
      </div>
    </div>`;
  }).join('');
  return `
  <div class="shelves-block">
    <h2 class="shelves-title">🗂 Коллекции по жанрам</h2>
    <p class="shelves-hint">Собирай жанры целиком — тапни, чтобы открыть афишу по жанру</p>
    <div class="cols-list">${cards}</div>
  </div>`;
}

// ---------- подборки ----------
function renderCols() {
  const c = document.getElementById('cols-container');
  if (!COLLS.length) {
    c.innerHTML = `<p class="error">Подборки появятся скоро 📚</p>`;
    return;
  }
  c.innerHTML = genreShelvesHTML() + COLLS.map(col => {
    const posters = col.codes
      .map(cd => ALL.find(m => m.code === cd))
      .filter(m => m && m.poster)
      .slice(0, 3);
    const fan = posters.length
      ? `<div class="col-fan">${posters.map((p, i) =>
          `<img src="${esc(p.poster)}" alt="" style="z-index:${3 - i};transform:rotate(${(i - 1) * 6}deg) translateX(${(i - 1) * 8}px)" loading="lazy"/>`
        ).join('')}</div>`
      : `<span class="col-emoji">${esc(col.emoji || '📚')}</span>`;
    // v116: прогресс сбора подборки — разгаданные коды + «Моё»
    const codesStr = col.codes.map(String);
    const owned = codesStr.filter(cd => getUnlocked().includes(cd) || getFavs().includes(cd)).length;
    const pct = codesStr.length ? Math.round(100 * owned / codesStr.length) : 0;
    return `
    <div class="col-card" data-col="${esc(col.code)}">
      ${fan}
      <div class="col-body">
        <h3>${esc(col.emoji || '📚')} ${esc(col.title)}</h3>
        <p>${plFilms(col.codes.length)}</p>
        <div class="col-progress"><i style="width:${pct}%"></i></div>
        <p class="col-progress-label">🔓 ${owned}/${col.codes.length} в коллекции</p>
      </div>
      <button class="btn-share-sm" data-share="${esc(col.code)}" title="Поделиться">📤</button>
    </div>`;
  }).join('');
  c.querySelectorAll('.col-card').forEach(el =>
    el.addEventListener('click', (e) => {
      if (e.target.closest('.btn-share-sm')) return;
      const col = COLLS.find(x => x.code === el.dataset.col);
      if (!col) return;
      view = 'cols-detail';
      showView('cols');
      const list = ALL.filter(m => col.codes.includes(m.code));
      const trList = list.filter(m => m.trailer_yt || m.trailer_file_id);
      c.innerHTML = `
        <button class="btn-back" id="btn-cols-back">◀️ Все подборки</button>
        ${trList.length >= 2
          ? `<button class="btn-primary" id="btn-cols-marathon" style="margin-top:8px">🎬 ▶️ Марафон трейлеров (${trList.length})</button>`
          : ''}
        <div class="movies-grid">${list.map(m => `
          <div class="movie-card" data-code="${esc(m.code)}">
            ${posterHtml(m)}
            <div class="movie-info">
              <h3>${esc(m.title)}</h3>
              <span class="rating">${ratingBadge(m)}</span>
            </div>
          </div>`).join('')}
        </div>`;
      document.getElementById('btn-cols-back').onclick = () => { view = 'cols'; renderCols(); };
      const mar = document.getElementById('btn-cols-marathon');
      if (mar) mar.onclick = () => openMarathon(trList, col.title);
      c.querySelectorAll('.movie-card').forEach(elc =>
        elc.addEventListener('click', () => openDetail(elc.dataset.code)));
    }));
  // Тап по жанровой полке → афиша, отфильтрованная этим жанром (как чип жанра)
  c.querySelectorAll('.genre-shelf').forEach(el =>
    el.addEventListener('click', () => {
      haptic('light');
      activeGenre = el.dataset.g || '';
      view = 'grid';
      showView('catalog');
      renderGenreChips();
      renderGrid();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
  c.querySelectorAll('.btn-share-sm').forEach(b =>
    b.addEventListener('click', () => {
      const col = COLLS.find(x => x.code === b.dataset.share);
      if (!col) return;
      const text = `У меня в «Киноафише» подборка ${col.emoji || '📚'} «${col.title}» — ${col.codes.length} фильмов! Угадай их по кодам в боте «Капитан Кино» 🎬`;
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent('https://t.me/kapitan_kino_bot')}&text=${encodeURIComponent(text)}`);
    }));
}

// ---------- v106: свои подборки ----------
let _curMyCol = null;  // id открытой подборки (для детального вида)
function renderMyCols() {
  const c = document.getElementById('mycols-container');
  if (!c) return;
  const cols = getMyCols();
  const head = `<div class="mycols-head"><h2>🗂 Мои подборки</h2></div>`;
  if (!cols.length) {
    c.innerHTML = head + `
      <div class="mycols-empty">
        <p>Собери свою коллекцию: выбери название, добавь фильмы — и подборка всегда под рукой.</p>
        <button class="btn-primary" id="btn-mc-create">➕ Создать подборку</button>
      </div>`;
    document.getElementById('btn-mc-create').onclick = promptNewMyCol;
    return;
  }
  c.innerHTML = head + cols.map(col => {
    const posters = col.codes
      .map(cd => ALL.find(m => m.code === cd))
      .filter(m => m && m.poster)
      .slice(0, 3);
    const fan = posters.length
      ? `<div class="col-fan">${posters.map((p, i) =>
          `<img src="${esc(p.poster)}" alt="" style="z-index:${3 - i};transform:rotate(${(i - 1) * 6}deg) translateX(${(i - 1) * 8}px)" loading="lazy"/>`
        ).join('')}</div>`
      : `<span class="col-emoji">🗂</span>`;
    return `
    <div class="col-card" data-mc="${esc(col.id)}">
      ${fan}
      <div class="col-body">
        <h3>🗂 ${esc(col.title)}</h3>
        <p>${plFilms(col.codes.length)} · моя</p>
      </div>
      <button class="btn-share-sm" data-mcshare="${esc(col.id)}" title="Поделиться">📤</button>
    </div>`;
  }).join('') + `
    <button class="btn-secondary" id="btn-mc-create" style="width:100%;margin-top:10px">➕ Создать подборку</button>`;
  document.getElementById('btn-mc-create').onclick = promptNewMyCol;
  c.querySelectorAll('.col-card').forEach(el =>
    el.addEventListener('click', (e) => {
      if (e.target.closest('.btn-share-sm')) return;
      _curMyCol = el.dataset.mc;
      view = 'mycol-detail';
      showView('mycol-detail');
      renderMyColDetail();
    }));
  c.querySelectorAll('.btn-share-sm').forEach(b =>
    b.addEventListener('click', () => {
      const col = myColById(b.dataset.mcshare);
      if (!col) return;
      const ms = col.codes.map(cd => ALL.find(m => m.code === cd)).filter(Boolean);
      const top = ms.slice(0, 3).map(m => `🎬 «${m.title}»`).join(', ');
      const text = `🗂 Моя подборка «${col.title}» — ${ms.length} фильмов: ${top}… Собери свою в «Киноафише» Капитана Кино!`;
      tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent('https://t.me/kapitan_kino_bot') + '&text=' + encodeURIComponent(text));
    }));
}

function promptNewMyCol() {
  try {
    tg.showPopup({
      type: 'prompt',
      title: '➕ Новая подборка',
      message: 'Придумай название своей коллекции.',
      placeholder: 'Например: «Кино на вечер», «Ужасы 90-х»…',
      text: '',
      callback: (btnId, value) => {
        if (btnId === 'ok' && value && value.trim()) {
          newMyCol(value.trim());
          haptic('ok');
          renderMyCols();
        }
      }
    });
  } catch (e) {
    const name = prompt('Название подборки:');
    if (name && name.trim()) { newMyCol(name.trim()); renderMyCols(); }
  }
}

// Детальный вид своей подборки: список фильмов, добавление и удаление
function renderMyColDetail() {
  const box = document.getElementById('view-mycol-detail');
  if (!box) return;
  const col = myColById(_curMyCol);
  if (!col) { view = 'mycols'; showView('mycols'); renderMyCols(); return; }
  const list = ALL.filter(m => col.codes.includes(m.code) || col.codes.includes(String(m.code)));
  const addBtn = `<button class="btn-secondary" id="btn-mc-add" style="width:100%">➕ Добавить фильм</button>`;
  const delBtn = `<button class="btn-secondary danger" id="btn-mc-del">🗑 Удалить подборку</button>`;
  box.innerHTML = `
    <div class="mycol-detail-head">
      <button class="btn-back" id="btn-mc-back">◀️ Все подборки</button>
      <h2>🗂 ${esc(col.title)}</h2>
    </div>
    ${list.length
      ? `<div class="movies-grid">${list.map(m => `
          <div class="movie-card" data-code="${esc(m.code)}">
            ${posterHtml(m)}
            <div class="movie-info">
              <h3>${esc(m.title)}</h3>
              <span class="rating">${ratingBadge(m)}</span>
            </div>
          </div>`).join('')}</div>`
      : `<div class="mycols-empty"><p>Подборка пока пустая. Добавь первый фильм — остальные подтянутся 🎞</p></div>`}
    ${addBtn}
    ${delBtn}`;
  document.getElementById('btn-mc-back').onclick = () => { view = 'mycols'; showView('mycols'); renderMyCols(); };
  document.getElementById('btn-mc-add').onclick = () => showMyColAddPanel(col);
  document.getElementById('btn-mc-del').onclick = () => {
    try {
      const confirm = tg.showConfirm || tg.showPopup;
      confirm(`Удалить подборку «${col.title}»?`, (ok) => {
        if (ok) {
          setMyCols(getMyCols().filter(x => x.id !== col.id));
          haptic('ok');
          view = 'mycols'; showView('mycols'); renderMyCols();
        }
      });
    } catch (e) {
      setMyCols(getMyCols().filter(x => x.id !== col.id));
      view = 'mycols'; showView('mycols'); renderMyCols();
    }
  };
  box.querySelectorAll('.movie-card').forEach(el =>
    el.addEventListener('click', () => openDetail(el.dataset.code)));
}

// Панель выбора: поиск + список фильмов с галочкой «есть в подборке»
function showMyColAddPanel(col) {
  const box = document.getElementById('view-mycol-detail');
  if (!box) return;
  const panel = document.createElement('div');
  panel.className = 'mycol-add-panel';
  panel.innerHTML = `
    <div class="mycol-detail-head"><h2>➕ К «${esc(col.title)}»</h2></div>
    <input class="mycol-add-input" id="mc-add-q" type="text" placeholder="🔍 Найти фильм…"/>
    <div class="mycol-add-list" id="mc-add-list"></div>
    <button class="btn-primary" id="btn-mc-add-done">Готово</button>`;
  box.prepend(panel);
  const listEl = document.getElementById('mc-add-list');
  const inCol = (code) => col.codes.includes(code) || col.codes.includes(String(code));
  const draw = () => {
    const q = (document.getElementById('mc-add-q').value || '').toLowerCase().trim();
    const pool = ALL.filter(m => !q
      || String(m.title).toLowerCase().includes(q)
      || String(m.code) === q || String(m.code).includes(q));
    listEl.innerHTML = (pool.slice(0, 60).map(m => `
      <button class="mycol-add-item ${inCol(m.code) ? 'in-col' : ''}" data-code="${esc(m.code)}">
        ${m.poster ? `<img src="${esc(m.poster)}" alt="" loading="lazy"/>` : '<span>🎬</span>'}
        <span>${esc(m.title)}</span>
        <span class="add-plus">${inCol(m.code) ? '✓' : '+'}</span>
      </button>`).join('') || '<p class="mycols-empty">Ничего не нашлось 🤷</p>');
    listEl.querySelectorAll('.mycol-add-item').forEach(b =>
      b.addEventListener('click', () => {
        const code = b.dataset.code;
        const adding = !inCol(code);
        updateMyCol(col.id, c => {
          const s = new Set(c.codes);
          adding ? s.add(code) : s.delete(code);
          c.codes = [...s];
          return c;
        });
        haptic(adding ? 'ok' : 'light');
        draw();
      }));
  };
  const qEl = document.getElementById('mc-add-q');
  if (qEl) qEl.addEventListener('input', draw);
  document.getElementById('btn-mc-add-done').onclick = () => {
    view = 'mycol-detail';
    showView('mycol-detail');
    renderMyColDetail();
  };
  draw();
}

// ---------- лента «📰 Новости кино» ----------
function renderNews() {
  const c = document.getElementById('news-container');
  if (!c) return;
  if (!NEWS.length) {
    c.innerHTML = '<p class="error">Пока нет новостей — загляните позже 📰</p>';
    return;
  }
  // v150: новости — как посты канала: картинка, заголовок, наш текст. Без ссылок
  // на чужие сайты. У старых записей (без текста) показываем только заголовок.
  let items = [...NEWS].reverse();
  // старые записи без текста прячем, как только появились новые — с текстом
  if (items.some(n => n.text)) items = items.filter(n => n.text);
  const seenTs = parseFloat(localStorage.getItem(NEWS_SEEN_KEY)) || 0;   // v233: «новое» — то, чего ещё не видели
  c.innerHTML = '<div class="top-header"><h2>📰 Новости кино</h2><p class="top-subtitle">Свежее от Капитана Кино — кратко и по делу</p></div>' + items.map(n => {
    const when = _newsWhen(n.ts);
    const img = n.image
      ? `<div class="np-img"><img src="${esc(n.image)}" alt="" loading="lazy" onerror="this.parentElement.remove()"/></div>`
      : '';
    const paras = String(n.text || '').split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
    const body = paras.map((t, i) => {
      if (/^💡/.test(t)) {
        const rest = t.replace(/^💡\s*/, '');
        const m = rest.match(/^([^:]{3,40}:)\s*([\s\S]*)$/);
        return `<div class="np-take"><span class="np-take-ico">💡</span><div>${
          m ? `<b>${esc(m[1])}</b> ${esc(m[2])}` : esc(rest)}</div></div>`;
      }
      if (i === 0 && paras.length > 1 && t.length <= 140) return `<p class="np-hook">${esc(t)}</p>`;
      return `<p>${esc(t)}</p>`;
    }).join('');
    return `
      <article class="news-post">
        ${img}
        <div class="np-body">
          <div class="np-meta"><span>📰 Капитан Кино${n.ts && n.ts > seenTs ? ' <b class="np-new">НОВОЕ</b>' : ''}</span><span>${esc(when)}</span></div>
          <h3 class="np-title">${esc(n.title || 'Новость')}</h3>
          ${body}
        </div>
      </article>`;
  }).join('');
  // Пользователь видел новости — фиксируем и обновляем бейдж на «Ещё»
  try { localStorage.setItem(NEWS_SEEN_KEY, String(newsMaxTs())); } catch (e) {}
  updateMoreBadge();
}

function _newsWhen(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts * 1000;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return min + ' мин назад';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + ' ч назад';
  const d = Math.floor(hr / 24);
  if (d < 7) return d + ' дн назад';
  return new Date(ts * 1000).toLocaleDateString('ru-RU');
}

// ---------- лидерборд «🏆 Топ» ----------
function renderLeaderboard() {
  const c = document.getElementById('top-container');
  if (!c) return;
  if (!ALL.length) {
    // v124: рейтинг приезжает вместе с базой. Пока грузится — скелетон:
    // «Пока нет данных — угадывай фильмы» на старте было просто неправдой
    c.innerHTML = `<div class="top-header"><h2>🏆 Топ игроков</h2></div>
      <div class="top-list">${Array.from({ length: 6 }, () =>
        '<div class="skel top-line"></div>').join('')}</div>`;
    return;
  }
  if (!LEADERBOARD.length) {
    c.innerHTML = '<p class="error">Пока нет данных — угадывай фильмы и поднимайся в рейтинге! 🏆</p>';
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  const weekly = LEADERBOARD_KIND === 'week';
  // Место пользователя в общем топе приезжает из профиля бота (PROFILE.rank)
  const myRank = PROFILE ? (parseInt(PROFILE.rank, 10) || 0) : 0;
  const myUnl = PROFILE ? (parseInt(PROFILE.unl, 10) || 0) : 0;
  const countLabel = (p) => weekly
    ? `${p.unlocks} за 7 дней${p.total ? ` · всего ${p.total}` : ''}`
    : `${p.unlocks} кодов`;
  c.innerHTML = `
    <div class="top-header">
      <h2>${weekly ? '🏆 Топ недели' : '🏆 Топ игроков'}</h2>
      <p class="top-subtitle">${weekly
        ? 'Кто угадал больше всех за последние 7 дней'
        : 'Кто угадал больше всех — тот и лидер!'}</p>
    </div>
    ${myRank > 0 ? `<div class="top-you">📍 Вы — №${myRank} в общем топе · разгадано ${myUnl}</div>` : ''}
    <div class="top-list">
      ${LEADERBOARD.map((p, i) => `
        <div class="top-row ${i < 3 ? 'top-row-gold' : ''}">
          <div class="top-rank">${medals[i] || (i + 1)}</div>
          <div class="top-player">
            <span class="top-name">Игрок №${p.rank}</span>
            <span class="top-count">${esc(countLabel(p))}</span>
          </div>
          ${i === 0 ? '<span class="top-crown">👑</span>' : ''}
        </div>`).join('')}
    </div>`;
}

// ---------- профиль «👤» (уровень/баллы/стрик) ----------
// Данные приезжают от кнопки 🔁 (хэш &profile=…) — см. parseProfileHash().

// 📣 Пригласить друга — шеринг персональной реф-ссылки на бота:
// переход друга по ?start=ref_<id> засчитывается в реферальные достижения.
function _inviteFriend() {
  haptic('light');
  const ref = (PROFILE && PROFILE.uid) ? ('?start=ref_' + PROFILE.uid) : '';
  const botUrl = 'https://t.me/kapitan_kino_bot' + ref;
  const url = 'https://t.me/share/url?url=' + encodeURIComponent(botUrl) +
    '&text=' + encodeURIComponent('🎬 Угадывай фильмы по кодам у «Капитана Кино» — афиша, тренажёр и достижения!');
  try { tg.openTelegramLink(url); } catch (e) {}
}

// 📋 «Скопировать список» из «Моё» — коды+названия в буфер обмена
function copyFavsList() {
  haptic('light');
  const lines = (window._favTitlesCache || []).map(l => `🔑 ${l}`).join('\n');
  const text = `🎬 Мои фильмы (${getFavs().length}):\n${lines}\n\nУгадывай фильмы по кодам у «Капитана Кино»!`;
  const done = () => {
    try { tg.HapticFeedback.impactOccurred('light'); } catch (e) {}
    tg.showPopup({ type: 'ok', title: '📋 Список скопирован', message: 'Отправь его другу — пусть тоже угадывает фильмы!' });
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(done);
  } else done();
}


// v256: сводка «Профиль» — ранг, награды, серии, жанры, неделя
function pfTopGenres() {
  const cnt = new Map();
  const bump = (code, w) => { const m = ALL.find(x => String(x.code) === String(code)); if (m) (m.genres || []).forEach(g => cnt.set(g, (cnt.get(g) || 0) + w)); };
  try { getWatched().forEach(c => bump(c, 2)); } catch (e) {}
  try { getFavs().forEach(c => bump(c, 1)); } catch (e) {}
  try { const r = getRatings(); Object.keys(r).forEach(c => { if ((r[c] || 0) >= 4) bump(c, 1); }); } catch (e) {}
  const arr = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const tot = arr.reduce((a, x) => a + x[1], 0) || 1;
  return arr.map(x => ({ g: x[0], pct: Math.round(100 * x[1] / tot) }));
}
function pfHeroHtml(weekActs) {
  const r = rankInfo();
  let chs = 0, bd = 0, cash = 500, ser = 0;
  try { chs = chStreakAlive(chLoad()); } catch (e) {}
  try { bd = cbCount(); } catch (e) {}
  try { cash = casinoBalance(); } catch (e) {}
  try { ser = dailyState().series || 0; } catch (e) {}
  const gs = pfTopGenres();
  const gHtml = gs.length ? `<div class="pfh-genres"><b>🌟 Любимые жанры</b>${gs.map(x => `<div class="pfh-g"><span>${esc(x.g)}</span><i><u style="width:${x.pct}%"></u></i><em>${x.pct}%</em></div>`).join('')}</div>`
    : '<div class="pfh-genres"><b>🌟 Любимые жанры</b><p>Отмечай просмотренное и ❤️ — здесь появится твой вкус.</p></div>';
  return `<div class="pfh">
    <div class="pfh-top">
      <div class="pfh-ico">${r.cur[1]}</div>
      <div class="pfh-body"><div class="pfh-name">${r.cur[2]}</div>
        <div class="pfh-sub">${r.nxt ? `${r.xp} оч. · до «${r.nxt[2]}» ${r.nxt[0] - r.xp}` : `${r.xp} оч. · высший ранг 👑`}</div>
        <div class="rk-bar"><i style="width:${r.pct}%"></i></div></div>
    </div>
    <div class="rk-ladder">${RANKS.map((x, k) => `<span class="${k <= r.i ? 'on' : ''}" title="${x[2]}">${x[1]}</span>`).join('')}</div>
    <div class="pfh-tiles">
      <button class="pfh-t" data-go="badges"><b>🏅 ${bd}/${CB_LIST.length}</b><span>награды казино</span></button>
      <div class="pfh-t"><b>🔥 ${ser}</b><span>дней заходов</span></div>
      <div class="pfh-t"><b>🎯 ${chs}</b><span>дней заданий</span></div>
      <div class="pfh-t"><b>🎞 ${cash}</b><span>фишек</span></div>
    </div>
    ${gHtml}
    <div class="pfh-week">📊 За неделю: <b>${weekActs}</b> действий</div>
  </div>`;
}
function bindPfHero() {
  document.querySelectorAll('.pfh-t[data-go="badges"]').forEach(b => b.onclick = () => { haptic('light'); try { openBadges(); } catch (e) {} });
}

function favouriteGenre() {
  // Любимый жанр: берём из разгаданных кодов + избранного
  const favs = getFavs();
  const counter = new Map();
  ALL.forEach(m => {
    const codes = [...(favs.includes(m.code) ? [m.code] : [])];
    if (codes.length) (m.genres || []).forEach(g => counter.set(g, (counter.get(g) || 0) + 1));
  });
  // Из профиля можем взять историю разгадок через unlocked
  const unlocked = getUnlocked();
  ALL.forEach(m => {
    if (unlocked.includes(String(m.code))) {
      (m.genres || []).forEach(g => counter.set(g, (counter.get(g) || 0) + 1));
    }
  });
  let best = '', bestN = 0;
  counter.forEach((n, g) => { if (n > bestN) { bestN = n; best = g; } });
  return bestN >= 2 ? best : '';
}
function levelEmoji(lvl) {
  const first = [...String(lvl || '')][0] || '🎬';
  return /\p{Extended_Pictographic}/u.test(first) ? first : '🎬';
}

function fmtDuration(mins) {
  const m = parseInt(mins, 10);
  if (!m || m < 1) return '';
  const h = Math.floor(m / 60);
  return (h ? h + ' ч' : '') + (m % 60 ? (h ? ' ' : '') + (m % 60) + ' мин' : '');
}

// v90: вкусовая строка профиля — средняя оценка и любимый актёр (по локальным данным)
function tasteLine() {
  const ratings = getRatings();
  const vals = Object.values(ratings).map(Number).filter(v => v > 0);
  if (!vals.length) return '';
  const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  const cnt = new Map();
  Object.entries(ratings).forEach(([code, v]) => {
    if (Number(v) < 4) return;
    const m = ALL.find(x => String(x.code) === String(code));
    ((m && m.actors) || []).forEach(a => cnt.set(a, (cnt.get(a) || 0) + 1));
  });
  let actor = '', best = 0;
  cnt.forEach((n, a) => { if (n > best) { best = n; actor = a; } });
  return `<div class="pf-taste">⭐ Средняя оценка: <b>${avg}</b> <span class="pf-taste-sub">(${vals.length})</span>`
    + (actor ? ` · 🌟 Любимый актёр: <b>${esc(actor)}</b>` : '') + `</div>`;
}

// (функция сброса локальных данных удалена — по запросу пользователя)

function renderProfile() {
  const c = document.getElementById('profile-container');
  if (!c) return;
  // «📊 Моя неделя» — локальная активность за 7 дней (считается в самом аппе,
  // работает и без синка с ботом)
  const w7 = week7();
  const wAct = w7.map(d => (d.open || 0) + (d.trailers || 0) + (d.favs || 0) + (d.rated || 0));
  const maxAct = Math.max(1, ...wAct);
  const sumOpen = w7.reduce((a, d) => a + d.open, 0);
  const sumTr = w7.reduce((a, d) => a + d.trailers, 0);
  const sumFv = w7.reduce((a, d) => a + d.favs, 0);
  const sumRt = w7.reduce((a, d) => a + (d.rated || 0), 0);
  const wkBars = w7.map((d, i) => {
    const h = Math.round(6 + 34 * wAct[i] / maxAct);
    return `<div class="wk-col" title="${d.date.getDate()}.${d.date.getMonth() + 1}: ${wAct[i]} действий"><i style="height:${h}px"></i><span>${d.date.getDate()}</span></div>`;
  }).join('');
  const dState = dailyState();
  const weekBlock = `
    <div class="pf-week">
      <div class="pf-ach-head"><span>📊 Моя неделя</span><b>${sumOpen + sumTr + sumFv + sumRt} действий</b></div>
      <div class="wk-chart">${wkBars}</div>
      <div class="wk-legend"><span>🔍 ${sumOpen}</span><span>▶️ ${sumTr}</span><span>❤️ ${sumFv}</span><span>⭐ ${sumRt}</span></div>
      <div class="wk-streak">🔥 Серия заходов: <b>${dState.series}</b> ${_daysWord(dState.series || 1)} · рекорд <b>${Math.max(dState.best, dState.series)}</b></div>
    </div>`;
  if (!PROFILE) {
    c.innerHTML = `
      <div class="profile-card">
        <div class="pf-ava">👤</div>
        <h2>Мой профиль</h2>
        <p class="pf-hint">Уровень, кинобаллы и стрик хранятся в боте.<br/>
        Синхронизируй — и они появятся здесь.</p>
        ${pfHeroHtml(sumOpen + sumTr + sumFv + sumRt)}
        ${tasteLine()}
        ${weekBlock}
        ${buildInsights()}
        <button class="btn-primary" id="pf-sync">🔁 Синхронизировать с ботом</button>
        <button class="btn-secondary pf-invite" id="pf-invite">📣 Пригласить друга</button>
      </div>`;
    bindPfHero();
    document.getElementById('pf-sync').onclick = () => sendOrDeepLink({ action: 'sync_unlocked' });
    const inv0 = document.getElementById('pf-invite');
    if (inv0) inv0.onclick = _inviteFriend;
    return;
  }
  const p = PROFILE;
  const unl = parseInt(p.unl, 10) || 0;
  const pct = Math.max(0, Math.min(100, parseInt(p.pct, 10) || 0));
  const nextNote = (p.lvl_next == null)
    ? '👑 Максимальный уровень!'
    : `Ещё ${p.lvl_next} код(ов) до следующего уровня`;
  const rank = parseInt(p.rank, 10) || 0;
  const refc = parseInt(p.refc ?? 0, 10) || 0;   // D1/v126: приведено друзей

  // VIP-бейдж
  const vipBadge = p.vip
    ? '<span class="pf-vip">⭐ VIP</span>' : '';

  // Активный титул
  const titleLine = p.tit
    ? `<div class="pf-title">🏷 ${esc(String(p.tit))}</div>` : '';

  // Достижения (ачивки)
  const achDone = parseInt(p.ach && p.ach[0], 10) || 0;
  const achTotal = parseInt(p.ach && p.ach[1], 10) || 0;
  const achPct = achTotal ? Math.round(100 * achDone / achTotal) : 0;
  const achBlock = `
    <div class="pf-ach">
      <div class="pf-ach-head">
        <span>🏆 Достижения</span>
        <b>${achDone}/${achTotal}</b>
      </div>
      <div class="pf-progress pf-progress-sm"><i style="width:${achPct}%"></i></div>
      <p class="pf-ach-hint">${achTotal - achDone > 0 ? 'Осталось ' + (achTotal - achDone) + ' — угадывай фильмы, ставь оценки, приглашай друзей!' : 'Все достижения открыты! 🎉'}</p>
    </div>`;

  // Недельная цель
  let wgBlock = '';
  if (p.wg && p.wg.target) {
    const wgDone = Math.min(parseInt(p.wg.done, 10) || 0, parseInt(p.wg.target, 10));
    const wgTarget = parseInt(p.wg.target, 10);
    const wgPct = wgTarget ? Math.round(100 * wgDone / wgTarget) : 0;
    const wgGenre = p.wg.genre ? ` жанра «${esc(p.wg.genre)}»` : '';
    wgBlock = `
      <div class="pf-wg">
        <div class="pf-wg-head">
          <span>🎯 Цель недели</span>
          <b>${wgDone}/${wgTarget}</b>
        </div>
        <div class="pf-progress pf-progress-sm"><i style="width:${wgPct}%"></i></div>
        <p class="pf-wg-hint">Разгадай ${wgTarget} код(ов)${wgGenre} за неделю — получишь +15 💰</p>
      </div>`;
  }

  // Opt-in на публичный топ
  const optChecked = p.opt ? 'checked' : '';
  const optBlock = `
    <label class="pf-opt">
      <input type="checkbox" id="pf-opt-in" ${optChecked}/>
      <span class="pf-opt-pill">🏆 Показывать меня в общем топе</span>
    </label>`;

  // D2/v127: «Реферальные бонусы» — прогресс до следующего 🎁/👑 за друзей
  const refuN = parseInt(p.refu ?? 0, 10) || 0;   // накоплено бесплатных открытий
  const refnN = parseInt(p.refn ?? -1, 10);       // ещё N друзей до следующего 🎁
  const refvN = p.refv;                           // {at, left} до VIP или null
  const _fw = n => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'друга';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'друзей';
    return 'друзей';
  };
  let refBlock = '';
  if (refnN >= 0 || refuN > 0 || refvN) {
    const refBar = (refnN > 0) ? Math.round(100 * Math.min(1, (3 - refnN) / 3)) : 100;
    let refBody = '';
    if (refnN === 0) {
      refBody += `<p class="pf-ref-hint">🎁 Следующее открытие уже можно получить — позови ещё ${_fw(1)}!</p>`;
    } else if (refnN > 0) {
      refBody += `<p class="pf-ref-hint">🎁 Ещё ${refnN} ${_fw(refnN)} — и получишь бесплатное открытие кода.</p>`;
    }
    refBody += refuN > 0
      ? `<p class="pf-ref-hint">🎟 Готовые открытия: <b>${refuN}</b> — они применятся сами при вводе следующего кода.</p>`
      : '';
    if (refvN) {
      refBody += refvN.left > 0
        ? `<p class="pf-ref-hint">👑 Ещё ${refvN.left} ${_fw(refvN.left)} — и получишь VIP (${refvN.at}+ друзей) на 2-10 дней!</p>`
        : `<p class="pf-ref-hint">👑 Порог VIP (${refvN.at}+ друзей) достигнут — награда уже начислена ботом!</p>`;
    }
    refBlock = `
    <div class="pf-ref">
      <div class="pf-ref-head">
        <span>🎁 Реферальные бонусы</span>
        <b>${refuN > 0 ? '+🎟' + refuN : (refnN >= 0 ? refnN + ' до 🎁' : '')}</b>
      </div>
      <div class="pf-progress pf-progress-sm"><i style="width:${refBar}%"></i></div>
      ${refBody}
    </div>`;
  }

// D3/v128: лента «👥 Друзья угадали» — последние разгадки друзей
  // (тех, кто пришёл по реферальной ссылке). Приезжает в p.fa из синхронизации.
  const faN = (Array.isArray(p.fa) && p.fa.length) ? p.fa : [];
  const friendsList = faN.length ? `
    <div class="pf-friends">
      <div class="pf-friends-head">
        <span>👥 Друзья угадали</span>
        <b>${Math.min(5, faN.length)}</b>
      </div>
      <div class="pf-friends-list">
        ${faN.slice(0, 5).map(f => {
          const d = String(f.date || '').replace(/-/g, '.');
          const t = esc(String(f.title || 'фильм'));
          return `<a class="pf-friend" data-code="${esc(String(f.code))}">📅 ${d} · ${t}</a>`;
        }).join('')}
      </div>
      <p class="pf-friends-hint">Твои друзья уже разгадывают коды — открывай и ты!</p>
    </div>` : '';
  c.innerHTML = `
    <div class="profile-card">
      <div class="pf-ava">${esc(levelEmoji(p.lvl))}</div>
      ${vipBadge}
      <h2>${esc(String(p.lvl || 'Игрок'))}</h2>
      ${titleLine}
      <div class="pf-progress"><i style="width:${pct}%"></i></div>
      <p class="pf-note">${esc(nextNote)}</p>
      <div class="pf-stats">
        <div class="pf-stat"><b>💰 ${esc(String(p.pts ?? 0))}</b><span>кинобаллов</span></div>
        <div class="pf-stat"><b>🔥 ${esc(String(p.str ?? 0))}</b><span>стрик · рекорд ${esc(String(p.bst ?? 0))}</span></div>
        <div class="pf-stat"><b>🔓 ${esc(String(unl))}</b><span>из ${esc(String(p.tot ?? ALL.length))} фильмов</span></div>
        <div class="pf-stat"><b>🤝 ${esc(String(refc))}</b><span>приглашено друзей</span></div>
        <div class="pf-stat"><b>👁 ${esc(String(getWatched().length))}</b><span>просмотрено</span></div>
        <div class="pf-stat"><b>${rank ? '🏆 №' + rank : '🏆 —'}</b><span>${rank ? 'в общем топе' : 'ещё не в топе'}</span></div>
      </div>
      ${pfHeroHtml(sumOpen + sumTr + sumFv + sumRt)}
      ${achBlock}
      ${weekBlock}
      ${refBlock}
      ${friendsList}
      ${buildInsights()}
      ${favouriteGenre() ? `<div class="pf-favgenre">🌟 Любимый жанр: <b>${esc(favouriteGenre())}</b></div>` : ''}
      ${tasteLine()}
      ${wgBlock}
      ${optBlock}
      <div class="pf-actions">
        <button class="btn-secondary" id="pf-sync2">🔁 Обновить</button>
        <button class="btn-secondary" id="pf-bot">🏅 Профиль в боте</button>
      </div>
      <button class="btn-secondary pf-invite" id="pf-invite">📣 Пригласить друга</button>
    </div>`;
  bindPfHero();
  document.getElementById('pf-sync2').onclick = () => sendOrDeepLink({ action: 'sync_unlocked' });
  const inv = document.getElementById('pf-invite');
  if (inv) inv.onclick = _inviteFriend;
  // D3/v128: тап по фильму в ленте друзей — открываем карточку фильма
  document.querySelectorAll('.pf-friends-list .pf-friend').forEach(a => {
    a.addEventListener('click', () => {
      haptic('light');
      openDetail(a.dataset.code);
      showView('detail');
    });
  });
  document.getElementById('pf-bot').onclick = () => {
    haptic('light');
    try { tg.openTelegramLink('https://t.me/kapitan_kino_bot'); }
    catch (e) { window.open('https://t.me/kapitan_kino_bot', '_blank'); }
  };
  const optIn = document.getElementById('pf-opt-in');
  if (optIn) {
    optIn.addEventListener('change', () => {
      haptic('light');
      sendOrDeepLink({ action: 'toggle_optin', on: optIn.checked });
    });
  }
}

// ---------- v74: «Мой кино-год» — личный отчёт по активности ----------
// Считаем по локальным данным: помесячный журнал (open/trailers/favs/rated)
// + текущие списки (Моё, оценки, просмотренные, разгаданные).
const MONTH_NAMES = ['', 'янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function renderYear() {
  const c = document.getElementById('year-container');
  if (!c) return;
  const year = new Date().getFullYear();
  const fmtYear = humanYearWord(year);
  // v99: «Цель года» — хранится локально (число кодов: 12/24/36/50)
  const YEAR_GOAL_KEY = 'kinoafisha_year_goal';
  const getYearGoal = () => { try { return parseInt(localStorage.getItem(YEAR_GOAL_KEY) || '', 10) || 0; } catch (e) { return 0; } };

  const sm = getYearStats();
  const sumOf = (f) => Object.values(sm).reduce((a, m) => a + ((m && m[f]) || 0), 0);
  const totOpen = sumOf('open');
  const totTr = sumOf('trailers');
  const totFv = sumOf('favs');
  const totRt = sumOf('rated');
  const totAct = totOpen + totTr + totFv + totRt;

  const ratings = getRatings();
  const ratCount = Object.keys(ratings).length;
  const watchedCnt = getWatched().length;
  const favCnt = getFavs().length;
  const unlCnt = getUnlocked().length;

  // v99: «Цель года» — разгадай N кодов. Локально, прогресс по разгаданным.
  const GOAL_CHOICES = [12, 24, 36, 50];
  const goal = getYearGoal();
  const goalPct = goal ? Math.min(100, Math.round(100 * unlCnt / goal)) : 0;
  const goalDone = goal && unlCnt >= goal;
  const goalBlock = `
    <div class="yr-goal${goalDone ? ' done' : ''}">
      <h3>🎯 Цель года</h3>
      ${goal
        ? (goalDone
            ? `<p class="yr-goal-msg">🎉 Цель ${goal} выполнена! Разгадано ${unlCnt}. Так держать — есть куда расти 😎</p>`
            : `<div class="yr-goal-bar"><i style="width:${goalPct}%"></i></div>
               <p class="yr-goal-msg">${unlCnt} из ${goal} разгадано · осталось ${Math.max(0, goal - unlCnt)}</p>`)
        : `<p class="yr-goal-msg">Разгадаешь N кодов за ${year} год? Прогресс-бар будет виден здесь.</p>
           <div class="yr-goal-chips">
             ${GOAL_CHOICES.map(n => `<button class="ls-btn" data-g="${n}">${n} кодов</button>`).join('')}
             <button class="ls-btn" data-g="0">Позже</button>
           </div>`}
      ${goal ? '<button class="btn-secondary yr-goal-edit" id="yr-goal-edit">Изменить</button>' : ''}
    </div>`;
  const wireYearGoal = () => {
    c.querySelectorAll('.yr-goal-chips .ls-btn').forEach(b => b.addEventListener('click', () => {
      try { localStorage.setItem(YEAR_GOAL_KEY, b.dataset.g); } catch (e) {}
      haptic('light');
      if (b.dataset.g === '0') { c.querySelector('.yr-goal')?.remove(); return; }
      renderYear();
    }));
    const ed = document.getElementById('yr-goal-edit');
    if (ed) ed.onclick = () => { try { localStorage.removeItem(YEAR_GOAL_KEY); } catch (e) {} renderYear(); };
  };

  // Любимые жанры: из оценок (вес 2) + «Моё» (вес 1.5) + просмотренных (вес 1) + разгаданных (1)
  const gScore = new Map();
  const feedG = (code, w) => {
    const m = ALL.find(x => String(x.code) === String(code));
    if (!m) return;
    (m.genres || []).forEach(g => gScore.set(g, (gScore.get(g) || 0) + w));
  };
  Object.keys(ratings).forEach(code => feedG(code, 2));
  getFavs().forEach(code => feedG(code, 1.5));
  getWatched().forEach(code => feedG(code, 1));
  getUnlocked().forEach(code => feedG(code, 1));
  const topGenres = [...gScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g]) => g);

  // Лучший фильм по моей оценке (при равенстве — выше рейтинг КП)
  let best = null;
  Object.entries(ratings).forEach(([code, r]) => {
    const m = ALL.find(x => String(x.code) === String(code));
    if (!m) return;
    if (!best || r > best.r || (r === best.r && (parseFloat(m.rating) || 0) > (parseFloat(best.m.rating) || 0))) {
      best = { m, r };
    }
  });

  // Гистограмма: последние 12 месяцев (включая текущий), считаем активность
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = d.getFullYear() + '-' + (d.getMonth() + 1);
    const m = sm[k];
    months.push({
      label: MONTH_NAMES[d.getMonth() + 1] || '', year: d.getFullYear(),
      act: m ? ((m.open || 0) + (m.trailers || 0) + (m.favs || 0) + (m.rated || 0)) : 0,
    });
  }
  const maxAct = Math.max(1, ...months.map(x => x.act));
  const chart = months.map(x => {
    const h = Math.max(3, Math.round(44 * x.act / maxAct));
    return `<span class="yr-col" title="${x.label} ${x.year}: ${x.act}">` +
      `<i style="height:${h}px"></i><em>${x.label}</em></span>`;
  }).join('');
  const chartBlock = `
    <div class="yr-mnt">
      <h3>📅 Активность по месяцам</h3>
      <div class="yr-chart">${chart}</div>
    </div>`;
  const bestBlock = best
    ? `<div class="yr-best">
        <h3>⭐ Лучший по твоей оценке</h3>
        <div class="yr-best-card" data-code="${esc(best.m.code)}">
          ${best.m.poster
            ? `<img src="${esc(best.m.poster)}" alt="" loading="lazy" ${FADE} onerror="this.style.display='none'"/>`
            : '<span style="font-size:26px">🎬</span>'}
          <div style="flex:1;min-width:0">
            <b>${esc(best.m.title)}</b>
            <span>${'★'.repeat(best.r)} · ⭐ ${esc(String(best.m.rating || '—'))}</span>
          </div>
        </div>
      </div>`
    : '';

  const shareBtn = totAct >= 5
    ? `<button class="btn-primary yr-share" id="yr-share">📤 Поделиться итогом года</button>`
    : '';

  if (totAct === 0 && ratCount === 0 && watchedCnt === 0) {
    c.innerHTML = `
      <div class="year-head"><h2>🏆 Мой кино-год — ${year}</h2></div>
      <div class="yr-empty">Здесь будет личный отчёт: сколько фильмов открыл, трейлеров посмотрел, оценок поставил.<br/><br/>
      Статистика начнёт копиться сама — просто пользуйся приложением! 🎬</div>
      ${goalBlock}
      <button class="btn-primary" style="width:100%;margin-top:10px" id="yr-go">🎬 Перейти в афишу</button>`;
    document.getElementById('yr-go').onclick = () => openView('grid');
    wireYearGoal();
    return;
  }

  c.innerHTML = `
    <div class="year-head">
      <h2>🏆 Мой кино-год — ${year}</h2>
      <p class="year-sub">${fmtYear} · ${totAct} действий · статистика считается на этом устройстве</p>
    </div>
    ${goalBlock}
    <div class="yr-stats">
      <div class="yr-stat"><b>🔍 ${totOpen}</b><span>карточек фильмов открыто</span></div>
      <div class="yr-stat"><b>▶️ ${totTr}</b><span>трейлеров просмотрено</span></div>
      <div class="yr-stat"><b>❤️ ${totFv}</b><span>раз добавлено в «Моё»</span></div>
      <div class="yr-stat"><b>⭐ ${totRt}</b><span>оценок поставлено</span></div>
      <div class="yr-stat"><b>⭐ ${ratCount}</b><span>фильмов оценено</span></div>
      <div class="yr-stat"><b>👁 ${watchedCnt}</b><span>отмечено просмотренными</span></div>
      <div class="yr-stat"><b>🔓 ${unlCnt}</b><span>кодов разгадано</span></div>
      <div class="yr-stat"><b>🔑 ${favCnt}</b><span>в «Хочу посмотреть»</span></div>
    </div>
    ${chartBlock}
    ${topGenres.length ? `<div class="yr-genres">
        <h3>🎭 Твои жанры</h3>
        <div class="yr-tags">${topGenres.map(g => `<span class="yr-tag">${esc(g)}</span>`).join('')}</div>
      </div>` : ''}
    ${bestBlock}
    ${shareBtn}
    ${totAct >= 5 ? '<button class="btn-secondary yr-share" id="yr-card" style="width:100%;margin-top:8px">🖼 Скачать открытку года</button>' : ''}`;

  const bestCard = document.querySelector('.yr-best-card');
  if (bestCard) bestCard.addEventListener('click', () => openDetail(bestCard.dataset.code));
  const yrCardBtn = document.getElementById('yr-card');
  if (yrCardBtn) yrCardBtn.onclick = openYearCard;
  wireYearGoal();
  const share = document.getElementById('yr-share');
  if (share) {
    share.onclick = () => {
      haptic('light');
      const text = `🎬 Мой кино-${year} в «Киноафише» Капитана Кино:\n` +
        `🔍 ${totOpen} открытий · ▶️ ${totTr} трейлеров · ⭐ ${totRt} оценок · ❤️ ${totFv} «Моё»\n` +
        `Любимые жанры: ${topGenres.slice(0, 3).join(', ') || '—'}`;
      const url = 'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/kapitan_kino_bot') +
        '&text=' + encodeURIComponent(text);
      try { tg.openTelegramLink(url); } catch (e) { window.open(url, '_blank'); }
    };
  }
}
function humanYearWord(y) {
  const r = y % 100;
  if (r >= 11 && r <= 14) return `За ${y} год`;
  const d = r % 10;
  if (d === 1) return `За ${y} год`;
  if (d >= 2 && d <= 4) return `За ${y} года`;
  return `За ${y} лет`;
}

// ---------- v110: «Киногод картинкой» — canvas-открытка года ----------
function drawYearCard(cb) {
  const W = 500, H = 750;
  let cv, ctx;
  try {
    cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    ctx = cv.getContext('2d');
  } catch (e) { cb(null); return; }
  ctx.fillStyle = '#10131f';
  ctx.fillRect(0, 0, W, H);
  // рамка
  ctx.strokeStyle = 'rgba(255,193,7,.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  // заголовок
  ctx.fillStyle = 'rgba(255,193,7,.95)';
  ctx.font = 'bold 26px Manrope, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('МОЙ КИНО-ГОД', W / 2, 54);
  const _ys = getYearStats();
  const _ysv = (f) => Object.values(_ys).reduce((a, m) => a + ((m && m[f]) || 0), 0);
  const sums = {
    открытий: _ysv('open'),
    трейлеров: _ysv('trailers'),
    оценок: _ysv('rated'),
  };
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.font = 'bold 16px Manrope, Arial';
  const keys = Object.keys(sums);
  let y = 96;
  keys.forEach(k => { ctx.fillText(`🔹 ${k}: ${sums[k]}`, W / 2, y); y += 32; });
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = 'bold 13px Manrope, Arial';
  ctx.fillText('🎬 КАПИТАН КИНО', W / 2, H - 14);
  cb(cv);
}
function openYearCard() {
  const modal = document.getElementById('sharecard-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const prev = document.getElementById('sharecard-preview');
  prev.innerHTML = '<p class="modal-muted">🎨 Рисуем открытку…</p>';
  drawYearCard((cv) => {
    if (!cv) { prev.innerHTML = '<p class="modal-muted">Открытку не удалось собрать</p>'; return; }
    try {
      const url = cv.toDataURL ? cv.toDataURL('image/png') : '';
      if (!url) { prev.innerHTML = '<p class="modal-muted">Открытку не удалось собрать</p>'; return; }
      prev.innerHTML = `<img src="${url}" alt="Мой кино-год"/>`;
      const dl = document.getElementById('btn-sharecard-download');
      if (dl) dl.onclick = () => {
        try {
          const a = document.createElement('a');
          a.href = url; a.download = 'kinokod_year.png'; a.click();
        } catch (e) { window.open(url, '_blank'); }
      };
    } catch (e) { prev.innerHTML = '<p class="modal-muted">Открытку не удалось собрать</p>'; }
  });
}
// ---------- трейлеры «🎥» ----------
// Все трейлеры в одном месте — с поиском, сортировкой и фильтром по жанру.
let _trailerSearchTimer = null;
let _trailerPage = 1;                 // текущая страница сетки трейлеров
const TRAILERS_PER_PAGE = 20;         // фильмов на одной странице

let trailerQuick = new Set();   // быстрые фильтры: short / new / unseen
function renderTrailerGenreChips() {
  const wrap = document.getElementById('trailer-genre-chips');
  if (!wrap) return;
  const withTrailers = ALL.filter(m => m.trailer_yt || m.trailer_file_id);
  const counter = new Map();
  withTrailers.forEach(m => (m.genres || []).forEach(g => counter.set(g, (counter.get(g) || 0) + 1)));
  const top = [...counter.entries()].filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  const QUICK = [['short', '⏱ до 2 ч'], ['new', '🆕 за неделю'], ['unseen', '👀 не смотрел']];
  wrap.innerHTML = QUICK.map(([k, t]) => `<button class="chip chip-q${trailerQuick.has(k) ? ' active' : ''}" data-q="${k}">${t}</button>`).join('') +
    '<span class="chip-sep"></span>' +
    `<button class="chip${trailerGenre === '' ? ' active' : ''}" data-g="">Все</button>` +
    top.map(([g, n]) =>
      `<button class="chip${trailerGenre === g ? ' active' : ''}" data-g="${esc(g)}">${esc(g)} <em>${n}</em></button>`
    ).join('');
  wrap.classList.remove('hidden');
  wrap.querySelectorAll('.chip-q').forEach(ch => ch.addEventListener('click', () => {
    haptic('light');
    const k = ch.dataset.q;
    if (trailerQuick.has(k)) trailerQuick.delete(k); else trailerQuick.add(k);
    _trailerPage = 1;
    renderTrailerGenreChips();
    renderTrailers();
  }));
  wrap.querySelectorAll('.chip:not(.chip-q)').forEach(ch => ch.addEventListener('click', () => {
    haptic('light');
    trailerGenre = ch.dataset.g || '';
    _trailerPage = 1;
    renderTrailerGenreChips();
    renderTrailers();
  }));
}

function renderTrailers() {
  const c = document.getElementById('trailers-container');
  if (!c) return;
  if (!ALL.length) {
    // Первый визит, данные ещё грузятся — скелетоны вместо пустоты
    c.innerHTML = `<div class="trailers-grid">${Array.from({ length: 6 }, () =>
      '<div class="trailer-card skeleton-card"><div class="skel poster"></div><div class="skel line"></div></div>'
    ).join('')}</div>`;
    return;
  }
  const qRaw = (document.getElementById('trailer-search').value || '').trim().toLowerCase();
  const sort = document.getElementById('trailer-sort').value;
  let list = ALL.filter(m => m.trailer_yt || m.trailer_file_id);
  if (trailerGenre) list = list.filter(m => (m.genres || []).includes(trailerGenre));
  if (trailerQuick.has('short')) list = list.filter(m => { const d = parseInt(m.duration, 10) || 0; return d > 0 && d <= 120; });
  if (trailerQuick.has('new')) list = list.filter(m => m.added_at && Date.now() - new Date(m.added_at).getTime() < 7 * 86400000);
  if (trailerQuick.has('unseen')) { const seen = getTrailerSeen(); list = list.filter(m => !seen.has(String(m.code))); }
  if (qRaw) {
    // v64: ё-нормализация + все слова запроса + код (если запрос целиком число)
    // v109: ищем и по актёрам/режиссёру — как в афише
    const q = qRaw.replace(/ё/g, 'е');
    const isCode = /^\d+$/.test(q.replace(/\s+/g, ''));
    const digits = q.replace(/\D/g, '');
    const norm = (t) => (t || '').toLowerCase().replace(/ё/g, 'е');
    const tks = q.split(/\s+/).filter(Boolean);
    list = list.filter(m => {
      if (isCode && digits && String(m.code || '').includes(digits)) return true;
      const t = norm(m._raw || m.title);
      if (tks.every(w => t.includes(w))) return true;
      const people = [...(m.actors || []), ...(m.director ? [m.director] : [])].map(norm).join(' ');
      if (people && tks.every(w => people.includes(w))) return true;
      return (m.genres || []).some(g => norm(g).includes(q));
    });
  }
  list.sort((a, b) => {
    if (sort === 'rating') return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
    if (sort === 'new') {
      const da = new Date(a.added_at || 0).getTime();
      const db = new Date(b.added_at || 0).getTime();
      return db - da;
    }
    return (a.title || '').localeCompare(b.title || '', 'ru');
  });
  // v109: закреплённые (📌) трейлеры всегда первыми
  const pins = getTrailerPins();
  if (pins.length) {
    list.sort((a, b) => {
      const pa = pins.includes(String(a.code)) ? 0 : 1;
      const pb = pins.includes(String(b.code)) ? 0 : 1;
      return pa - pb;
    });
  }
  if (!list.length) {
    c.innerHTML = '<p class="error">Нет трейлеров по запросу 🎬<br><small>Сними один из быстрых фильтров.</small></p>';
    return;
  }
  // v54: пагинация — по TRAILERS_PER_PAGE фильмов на страницу
  const pages = Math.max(1, Math.ceil(list.length / TRAILERS_PER_PAGE));
  if (_trailerPage > pages) _trailerPage = pages;
  if (_trailerPage < 1) _trailerPage = 1;
  const pageItems = list.slice((_trailerPage - 1) * TRAILERS_PER_PAGE, _trailerPage * TRAILERS_PER_PAGE);
  const pager = pages > 1 ? `<div class="pager">
      <button class="pg-btn" data-pg="prev" ${_trailerPage === 1 ? 'disabled' : ''} aria-label="Назад">◀</button>
      ${Array.from({ length: pages }, (_, i) =>
        `<button class="pg-btn${i + 1 === _trailerPage ? ' active' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}
      <button class="pg-btn" data-pg="next" ${_trailerPage === pages ? 'disabled' : ''} aria-label="Вперёд">▶</button>
      <span class="pg-info">🎬 ${list.length}</span>
    </div>` : '';
  const thumbSrc = (m) => m.trailer_thumb || m.poster || (m.trailer_yt ? `https://i.ytimg.com/vi/${encodeURIComponent(m.trailer_yt)}/0.jpg` : '');
  const thumbFb = (m) => m.poster || (m.trailer_yt ? `https://i.ytimg.com/vi/${encodeURIComponent(m.trailer_yt)}/hqdefault.jpg` : '');
  const pinSet = getTrailerPins();
  const seenSet = getTrailerSeen();
  // v164: «Трейлер дня» — широкая карточка сверху (без поиска/фильтра, на первой странице)
  let hero = '';
  if (!qRaw && !trailerGenre && !trailerQuick.size && _trailerPage === 1 && list.length >= 6) {
    const d = new Date(); const seed = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
    const pool = list.filter(m => (parseFloat(m.rating) || 0) >= 7 && thumbSrc(m));
    const hm = pool.length ? pool[seed % pool.length] : null;
    if (hm) {
      const gs = (hm.genres || []).slice(0, 2).join(' · ');
      hero = `<div class="tr-hero" data-code="${esc(hm.code)}">
        <div class="tr-hero-bg" style="background-image:url('${esc(thumbSrc(hm))}')"></div>
        <img class="tr-hero-poster" src="${esc(thumbSrc(hm))}" alt="" onerror="this.style.display='none'"/>
        <div class="tr-hero-body">
          <span class="tr-hero-tag">🎬 Трейлер дня</span>
          <h3>${esc(hm.title)}</h3>
          <div class="tr-hero-meta">${[hm.year, hm.rating ? '⭐ ' + hm.rating : '', gs].filter(Boolean).map(x => esc(String(x))).join(' · ')}</div>
          <span class="tr-hero-btn"><i></i> Смотреть</span>
        </div>
      </div>`;
    }
  }
  c.innerHTML = `${hero}<div class="trailers-grid">${pageItems.map(m => {
    const src = thumbSrc(m), fb = thumbFb(m);
    const pinned = pinSet.includes(String(m.code));
    const sub = [m.year, (m.genres || [])[0]].filter(Boolean).map(x => esc(String(x))).join(' · ');
    return `
    <div class="trailer-card" data-code="${esc(m.code)}">
      <div class="trailer-thumb">
        ${src
          ? `<div class="thumb-blur" style="background-image:url('${esc(src)}')"></div><img src="${esc(src)}" alt="" loading="lazy" ${FADE}${dimStyle(m)} onerror="const b=this.previousElementSibling;if(!this.dataset.f){this.dataset.f=1;this.src='${esc(fb || '')}';if(b)b.style.backgroundImage='url(${esc(fb || '')})'}else{this.style.display='none';if(b)b.style.display='none'}"/>`
          : `<div class="trailer-thumb-ph">🎬</div>`}
        <span class="trailer-shade"></span>
        <span class="trailer-play"><i></i></span>
        ${seenSet.has(String(m.code)) ? '<span class="trailer-seen">✓</span>' : ''}
        ${m.rating ? `<span class="trailer-rate">⭐ ${esc(String(m.rating))}</span>` : ''}
        ${(!m.trailer_yt && m.trailer_file_id) ? '<span class="trailer-local">📥</span>' : ''}
        <button class="trailer-pin${pinned ? ' pinned' : ''}" data-pin="${esc(m.code)}" title="Закрепить наверху">📌</button>
        <div class="trailer-cap"><h3>${esc(m.title)}</h3>${sub ? `<span>${sub}</span>` : ''}</div>
      </div>
    </div>`; }).join('')}</div>${pager}`;
  c.querySelectorAll('.tr-hero').forEach(el => el.addEventListener('click', () => {
    const m = ALL.find(x => x.code === el.dataset.code);
    if (m) { haptic('light'); openTrailer(m); }
  }));
  c.querySelectorAll('.trailer-card').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.trailer-pin')) return;   // не открываем по клику на 📌
      const m = ALL.find(x => x.code === el.dataset.code);
      if (m) openTrailer(m);
    });
  });
  c.querySelectorAll('.trailer-pin').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const pinned = toggleTrailerPin(b.dataset.pin);
    b.classList.toggle('pinned', pinned);
    try {
      tg.showPopup({ type: 'ok',
        title: pinned ? '📌 Закреплён' : '📌 Откреплён',
        message: pinned ? 'Этот трейлер всегда будет первым в списке.' : 'Трейлер вернулся в обычный порядок.' });
    } catch (_) {}
    setTimeout(() => renderTrailers(), 250);   // перерисуем сетку с учётом пина
  }));
  c.querySelectorAll('.pg-btn').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.pg;
    if (v === 'prev') _trailerPage = Math.max(1, _trailerPage - 1);
    else if (v === 'next') _trailerPage = Math.min(pages, _trailerPage + 1);
    else _trailerPage = parseInt(v, 10) || 1;
    haptic('light');
    renderTrailers();
    window.scrollTo({ top: Math.max(0, c.offsetTop - 70), behavior: 'smooth' });
  }));
}

// v92: «🎲 Случайный трейлер» — открывает случайный трейлер в плеере
(function wireTrailerRandom() {
  const b = document.getElementById('btn-tr-random');
  if (!b) return;
  b.addEventListener('click', () => {
    const pool = ALL.filter(m => m.trailer_yt || m.trailer_file_id);
    if (!pool.length) return;
    haptic('light');
    openTrailer(pool[Math.floor(Math.random() * pool.length)]);
  });
})();

// ---------- достижения «🎖» ----------
const ACHIEVEMENTS_LIST = [
  { id: 'first_code', emoji: '🔓', name: 'Первый код', desc: 'Разгадай первый код' },
  { id: 'streak3', emoji: '🔥', name: 'Стрик 3', desc: 'Разгадай 3 кода подряд без ошибок' },
  { id: 'streak7', emoji: '⚡', name: 'Стрик 7', desc: 'Разгадай 7 кодов подряд без ошибок' },
  { id: 'codes10', emoji: '🎯', name: '10 кодов', desc: 'Разгадай 10 кодов' },
  { id: 'codes25', emoji: '🏅', name: '25 кодов', desc: 'Разгадай 25 кодов' },
  { id: 'codes50', emoji: '🏆', name: '50 кодов', desc: 'Разгадай 50 кодов' },
  { id: 'genres3', emoji: '🎭', name: '3 жанра', desc: 'Разгадай коды из 3 разных жанров' },
  { id: 'genres5', emoji: '🌈', name: '5 жанров', desc: 'Разгадай коды из 5 разных жанров' },
  { id: 'reaction', emoji: '👍', name: 'Оценка', desc: 'Поставь оценку фильму' },
  { id: 'reaction3', emoji: '💬', name: '3 оценки', desc: 'Поставь 3 оценки' },
  { id: 'favorite', emoji: '❤️', name: 'Избранное', desc: 'Добавь фильм в избранное' },
  { id: 'points20', emoji: '💰', name: '20 баллов', desc: 'Заработай 20 кинобаллов' },
  { id: 'points50', emoji: '💎', name: '50 баллов', desc: 'Заработай 50 кинобаллов' },
  { id: 'secret', emoji: '🕵️', name: 'Секрет', desc: 'Найди секретный код' },
  { id: 'bingo_line', emoji: '🎰', name: 'Линия', desc: 'Закрой линию в кино-бинго' },
  { id: 'bingo_full', emoji: '👑', name: 'Бинго!', desc: 'Закрой всю карточку кино-бинго' },
  { id: 'referral3', emoji: '🤝', name: '3 друга', desc: 'Пригласи 3 друзей' },
];

function computeAchCards() {
  const favs = getFavs();
  const unlocked = getUnlocked();
  // Данные из профиля бота (если синхронизирован)
  const p = PROFILE || {};
  const pts = parseInt(p.pts, 10) || 0;
  const strk = parseInt(p.str, 10) || 0;
  const unlCount = unlocked.length;

  return ACHIEVEMENTS_LIST.map(a => {
    let done = false;
    let progress = '';
    switch (a.id) {
      case 'first_code': done = unlCount >= 1; break;
      case 'streak3': done = strk >= 3; progress = `${Math.min(strk, 3)}/3`; break;
      case 'streak7': done = strk >= 7; progress = `${Math.min(strk, 7)}/7`; break;
      case 'codes10': done = unlCount >= 10; progress = `${Math.min(unlCount, 10)}/10`; break;
      case 'codes25': done = unlCount >= 25; progress = `${Math.min(unlCount, 25)}/25`; break;
      case 'codes50': done = unlCount >= 50; progress = `${Math.min(unlCount, 50)}/50`; break;
      case 'favorite': done = favs.length >= 1; progress = `${favs.length}/1`; break;
      case 'genres3': {
        const genres = new Set();
        ALL.forEach(m => { if (unlocked.includes(String(m.code))) (m.genres || []).forEach(g => genres.add(g)); });
        done = genres.size >= 3; progress = `${genres.size}/3`;
        break;
      }
      case 'genres5': {
        const genres = new Set();
        ALL.forEach(m => { if (unlocked.includes(String(m.code))) (m.genres || []).forEach(g => genres.add(g)); });
        done = genres.size >= 5; progress = `${genres.size}/5`;
        break;
      }
      case 'reaction':
        done = (p.reactions || 0) >= 1; progress = `${p.reactions || 0}/1`;
        break;
      case 'reaction3':
        done = (p.reactions || 0) >= 3; progress = `${p.reactions || 0}/3`;
        break;
      case 'points20':
        done = pts >= 20; progress = `${Math.min(pts, 20)}/20`;
        break;
      case 'points50':
        done = pts >= 50; progress = `${Math.min(pts, 50)}/50`;
        break;
      case 'secret':
        done = !!p.has_secret;
        break;
      case 'bingo_line':
        done = !!p.bingo_line; progress = p.bingo_line ? '1/1' : '0/1';
        break;
      case 'bingo_full':
        done = !!p.bingo_full; progress = p.bingo_full ? '1/1' : '0/1';
        break;
      case 'referral3':
        done = (p.referrals || 0) >= 3; progress = `${p.referrals || 0}/3`;
        break;
      default: break;
    }
    return { ...a, done, progress };
  });
}

// Бейдж на «Ещё»: точка, когда появились достижения, которых пользователь
// ещё не видел (открыто больше, чем зафиксировано при последнем просмотре).
const ACH_SEEN_KEY = 'kinoafisha_ach_seen';
const NEWS_SEEN_KEY = 'kinoafisha_news_seen_ts';
function newsMaxTs() {
  return NEWS.reduce((mx, n) => (n.ts && n.ts > mx ? n.ts : mx), 0);
}
function updateMoreBadge() {
  const moreTab = document.getElementById('tab-more');
  if (!moreTab) return;
  let fresh = false;
  try {
    const done = computeAchCards().filter(a => a.done).length;
    const seenAch = parseInt(localStorage.getItem(ACH_SEEN_KEY), 10) || 0;
    const seenNews = parseFloat(localStorage.getItem(NEWS_SEEN_KEY)) || 0;
    // Точка на «Ещё»: новые достижения ИЛИ свежие новости
    fresh = done > seenAch || newsMaxTs() > seenNews;
  } catch (e) { return; }
  moreTab.classList.toggle('has-badge', fresh);
  const bd = document.getElementById('bn-dot');
  // v233: точка на «Моё» — только новые достижения; у «Новостей» своя точка
  let freshAch = false, freshNews = false;
  try {
    freshAch = computeAchCards().filter(a => a.done).length > (parseInt(localStorage.getItem(ACH_SEEN_KEY), 10) || 0);
    freshNews = newsMaxTs() > (parseFloat(localStorage.getItem(NEWS_SEEN_KEY)) || 0);
  } catch (e) {}
  if (bd) bd.classList.toggle('hidden', !freshAch);
  const nd = document.getElementById('bn-news-dot');
  if (nd) nd.classList.toggle('hidden', !freshNews);
}

function renderAchievements() {
  const c = document.getElementById('achievements-container');
  if (!c) return;
  const favGenre = favouriteGenre();
  const total = ACHIEVEMENTS_LIST.length;
  const achCards = computeAchCards();
  const opened = achCards.filter(a => a.done).length;
  const pct = total ? Math.round(100 * opened / total) : 0;
  c.innerHTML = `
    <div class="ach-summary">
      <div class="ach-summary-head">
        <h2>🎖 Достижения</h2>
        <b>${opened}/${total}</b>
      </div>
      <div class="pf-progress"><i style="width:${pct}%"></i></div>
      <p class="ach-hint">${opened === total ? 'Все достижения открыты! 🎉' : `Осталось ${total - opened} — угадывай фильмы, ставь оценки, приглашай друзей!`}</p>
      ${favGenre ? `<p class="ach-favgenre">🌟 Любимый жанр: <b>${esc(favGenre)}</b></p>` : ''}
    </div>
    <div class="ach-grid">${achCards.map(a => `
      <div class="ach-card ${a.done ? 'ach-done' : ''}">
        <div class="ach-emoji">${a.done ? a.emoji : '🔒'}</div>
        <div class="ach-name">${esc(a.name)}</div>
        <div class="ach-desc">${esc(a.desc)}</div>
        ${a.progress ? `<div class="ach-progress">${esc(a.progress)}</div>` : ''}
      </div>`).join('')}</div>`;
  // Пользователь открыл раздел — фиксируем, сколько достижений он видел,
  // и прячем бейдж на «Ещё».
  try { localStorage.setItem(ACH_SEEN_KEY, String(opened)); } catch (e) {}
  const moreTab = document.getElementById('tab-more');
  if (moreTab) moreTab.classList.remove('has-badge');
  renderCodeCollection();
}

// ---------- бэкап «Моё»: через бота + переносимый бэкап на другое устройство ----------
// v74: компактная строка-копия содержит «Моё», оценки, просмотренные и заметки.
// Её можно вставить в Telegram («Избранное») и восстановить на другом устройстве.
const BAK_PREFIX = 'kinokod:v1:';
function buildBackupString() {
  const payload = JSON.stringify({
    favs: getFavs(),
    ratings: getRatings(),
    watched: getWatched(),
    notes: getNotes(),
    mycols: getMyCols(),   // v108: свои подборки переезжают вместе с «Моё»
    at: Date.now(),
  });
  return BAK_PREFIX + encodeURIComponent(payload);
}

// ---------- v121: облачный профиль — Telegram CloudStorage ----------
// «Моё» (избранное, оценки, просмотры, заметки, подборки) автоматически живёт
// в личном облаке Telegram: CloudStorage привязан к пользователю и боту,
// работает при любом способе запуска и переживает смену устройства.
// Новое устройство само подтягивает профиль при старте; изменения на устройстве
// дописываются в облако с debounce (последняя запись = самая свежая).
// Лимит CloudStorage — до 1024 символов на значение, поэтому пишем чанками по 900.
function csOk() {
  try { return !!(tg.CloudStorage && typeof tg.CloudStorage.getItem === 'function'); }
  catch (e) { return false; }
}
function csGet(key) {
  return new Promise((res) => {
    try { tg.CloudStorage.getItem(key, (err, val) => res(err ? null : (val == null ? null : String(val)))); }
    catch (e) { res(null); }
  });
}
function csSet(key, val) {
  return new Promise((res) => {
    try { tg.CloudStorage.setItem(key, String(val), () => res(true)); }
    catch (e) { res(false); }
  });
}
const CS_META = 'kk_prof_meta';  // {n, at} — коммит-маркер, пишется последним
const CS_CHUNK = 'kk_prof';      // kk_prof0, kk_prof1, …
const CS_TS_KEY = 'kinoafisha_cloud_ts';
let _csTimer = null;
function scheduleCloudSync(delayMs) {
  if (!csOk()) return;
  clearTimeout(_csTimer);
  _csTimer = setTimeout(saveProfileToCloud, delayMs || 20000);
}
function capProgress() {
  let goal = null;
  try { goal = JSON.parse(localStorage.getItem('kino_cap_goal') || 'null'); } catch (e) { goal = null; }
  let best = 0;
  try { best = parseInt(localStorage.getItem('kino_cap_best') || '0', 10) || 0; } catch (e) {}
  return { best, goal };
}
// v181: Кино-арена (рекорд + результат дуэли дня) и «уже смотрел трейлер» — тоже переезжают между устройствами
function arenaProgress() {
  let best = 0, daily = null;
  try { best = parseInt(localStorage.getItem('kino_arena_best') || '0', 10) || 0; } catch (e) {}
  try { daily = JSON.parse(localStorage.getItem('kino_arena_daily') || 'null'); } catch (e) { daily = null; }
  let trs = []; try { trs = [...getTrailerSeen()].slice(-100); } catch (e) {}
  return { best, daily, trs };
}
function profileSnapshot() {
  // A2/v124: помимо «Моё» переносим и активность — стрик, «Моя неделя», «Мой год»,
  // челленджи дня, прогресс марафона, трейлер-историю, недавние, счётчики открытий,
  // закреплённые трейлеры и разгаданные коды (тот же транспорт, что и бэкап).
  let chall = null, mar = null;
  try { chall = JSON.parse(localStorage.getItem(CHALL_KEY) || 'null'); } catch (e) { chall = null; }
  try {
    mar = {
      seen: JSON.parse(localStorage.getItem(MAR_SEEN_KEY) || '[]'),
      resume: localStorage.getItem(MAR_RESUME_KEY) || '',
      ach: JSON.parse(localStorage.getItem(MAR_ACH_KEY) || '[]'),
    };
  } catch (e) { mar = null; }
  return JSON.stringify({
    favs: getFavs(), ratings: getRatings(), watched: getWatched(),
    notes: getNotes(), mycols: getMyCols(),
    streak: dailyState(), week: getWeekStats(), year: getYearStats(),
    chall, mar, tw: getTrailerWatches(), recent: getRecent(),
    open: getOpenCounts(), unlocked: getUnlocked(), pins: getTrailerPins(),
    cap: capProgress(),   // v160: рекорд и цель дня игры «Капитан в пути»
    arena: arenaProgress(),   // v181: Кино-арена
    at: Date.now(),
  });
}
async function saveProfileToCloud() {
  if (!csOk()) return;
  try {
    const payload = profileSnapshot();
    const chunks = [];
    for (let i = 0; i < payload.length && chunks.length < 14; i += 900) {
      chunks.push(payload.slice(i, i + 900));
    }
    for (let i = 0; i < chunks.length; i++) {
      if (!(await csSet(CS_CHUNK + i, chunks[i]))) return;  // облако не приняло
    }
    await csSet(CS_META, JSON.stringify({ n: chunks.length, at: Date.now() }));
  } catch (e) { /* пусто */ }
}
function profileLocallyEmpty() {
  return !getFavs().length && !getWatched().length && !getMyCols().length
    && !Object.keys(getRatings()).length && !Object.keys(getNotes()).length;
}
async function restoreProfileFromCloud() {
  if (!csOk()) return null;
  try {
    const metaRaw = await csGet(CS_META);
    if (!metaRaw) return null;
    const meta = JSON.parse(metaRaw);
    if (!meta || !meta.n) return null;
    const wasEmpty = profileLocallyEmpty();
    const localAt = Number(localStorage.getItem(CS_TS_KEY) || 0);
    // Локально пусто → всегда восстанавливаем (новое устройство). Иначе — только
    // когда облако свежее последнего переноса (смена телефона «в обе стороны»).
    if (!wasEmpty && (meta.at || 0) <= localAt) return null;
    let payload = '';
    for (let i = 0; i < meta.n; i++) payload += (await csGet(CS_CHUNK + i)) || '';
    if (!payload) return null;
    const res = importBackupString(BAK_PREFIX + encodeURIComponent(payload));
    if (res !== 'ok') return null;
    localStorage.setItem(CS_TS_KEY, String(meta.at || Date.now()));
    return { wasEmpty };
  } catch (e) { return null; }
}
function importBackupString(raw) {
  try {
    const s = String(raw || '').trim();
    if (!s.startsWith(BAK_PREFIX)) return 'not_backup';
    const data = JSON.parse(decodeURIComponent(s.slice(BAK_PREFIX.length)));
    if (!data || typeof data !== 'object') return 'bad';
    const add1 = (v) => Array.isArray(v) ? v.filter(x => x !== null && x !== '').map(String) : [];
    const add2 = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    // v113: дедупликация — при переносе на новое устройство в списках и
    // подборках могут быть дубликаты (несколько раз сохраняли/восстанавливали).
    let dupes = 0;
    const uniq = (arr) => {
      const before = arr.length;
      const out = [...new Set(arr)];
      dupes += before - out.length;
      return out;
    };
    localStorage.setItem(FAV_KEY, JSON.stringify(uniq(add1(data.favs))));
    localStorage.setItem(WATCHED_KEY, JSON.stringify(uniq(add1(data.watched))));
    localStorage.setItem(RATINGS_KEY, JSON.stringify(add2(data.ratings)));
    localStorage.setItem(NOTES_KEY, JSON.stringify(add2(data.notes)));
    // v108: подборки — только валидный массив {id,title,codes}; старые бэкапы
    // без этого поля не трогаем (не очищаем то, что уже есть на устройстве).
    if (Array.isArray(data.mycols)) {
      const cols = data.mycols.filter(c => c && typeof c === 'object'
        && c.id && c.title && Array.isArray(c.codes))
        .map(c => ({ id: String(c.id), title: String(c.title), codes: uniq(add1(c.codes)) }));
      localStorage.setItem(MYCOLS_KEY, JSON.stringify(cols));
    }
    // A2/v124: активность и настройки — только если поле есть в бэкапе/облаке
    // (старые версии не содержат их — тогда ничего не трогаем).
    if (data.streak && typeof data.streak === 'object') {
      localStorage.setItem(DAILY_KEY, JSON.stringify({
        last: String(data.streak.last || ''),
        series: Number(data.streak.series) || 0,
        best: Number(data.streak.best) || 0,
        done: Array.isArray(data.streak.done) ? data.streak.done.map(Number).filter(Boolean) : [],
      }));
    }
    if (add2(data.week) && Object.keys(data.week || {}).length) localStorage.setItem(WEEK_STATS_KEY, JSON.stringify(data.week));
    if (add2(data.year) && Object.keys(data.year || {}).length) localStorage.setItem(YEAR_LOG_KEY, JSON.stringify(data.year));
    if (data.chall && typeof data.chall === 'object' && data.chall.date) localStorage.setItem(CHALL_KEY, JSON.stringify(data.chall));
    if (data.mar && typeof data.mar === 'object') {
      if (Array.isArray(data.mar.seen)) localStorage.setItem(MAR_SEEN_KEY, JSON.stringify(data.mar.seen.map(String)));
      if (data.mar.resume) localStorage.setItem(MAR_RESUME_KEY, String(data.mar.resume));
      if (Array.isArray(data.mar.ach)) localStorage.setItem(MAR_ACH_KEY, JSON.stringify(data.mar.ach));
    }
    if (Array.isArray(data.tw)) localStorage.setItem(TW_KEY, JSON.stringify(data.tw.slice(0, MAX_TW)));
    if (Array.isArray(data.recent)) localStorage.setItem(RECENT_KEY, JSON.stringify(data.recent.slice(0, MAX_RECENT)));
    if (data.open && typeof data.open === 'object') localStorage.setItem(OPEN_COUNT_KEY, JSON.stringify(data.open));
    if (Array.isArray(data.unlocked) && data.unlocked.length) {
      localStorage.setItem(UNLOCKED_KEY, JSON.stringify([...new Set(data.unlocked.map(String))]));
    }
    if (Array.isArray(data.pins)) localStorage.setItem(TPIN_KEY, JSON.stringify(data.pins));
    if (data.cap && typeof data.cap === 'object') {      // v160: игра — берём лучшее из облака и устройства
      try {
        const lb = parseInt(localStorage.getItem('kino_cap_best') || '0', 10) || 0;
        if ((Number(data.cap.best) || 0) > lb) localStorage.setItem('kino_cap_best', String(Number(data.cap.best)));
        const cg = data.cap.goal;
        if (cg && typeof cg === 'object' && cg.day) {
          let lg = null;
          try { lg = JSON.parse(localStorage.getItem('kino_cap_goal') || 'null'); } catch (e) { lg = null; }
          if (!lg || String(cg.day) > String(lg.day) || (cg.day === lg.day && (cg.n || 0) > (lg.n || 0))) {
            localStorage.setItem('kino_cap_goal', JSON.stringify({ day: String(cg.day), n: Number(cg.n) || 0 }));
          }
        }
      } catch (e) { /* пусто */ }
    }
    if (data.arena && typeof data.arena === 'object') {   // v181: Кино-арена — лучшее из облака и устройства
      try {
        const lb = parseInt(localStorage.getItem('kino_arena_best') || '0', 10) || 0;
        if ((Number(data.arena.best) || 0) > lb) localStorage.setItem('kino_arena_best', String(Number(data.arena.best)));
        const d = data.arena.daily;
        if (d && typeof d === 'object' && d.day) {
          let ld = null; try { ld = JSON.parse(localStorage.getItem('kino_arena_daily') || 'null'); } catch (e) { ld = null; }
          if (!ld || String(d.day) > String(ld.day) || (d.day === ld.day && (d.score || 0) > (ld.score || 0))) {
            localStorage.setItem('kino_arena_daily', JSON.stringify({ day: String(d.day), score: Number(d.score) || 0, right: Number(d.right) || 0, total: Number(d.total) || 0 }));
          }
        }
        if (Array.isArray(data.arena.trs) && data.arena.trs.length) {
          const st = getTrailerSeen(); data.arena.trs.forEach(x => st.add(String(x)));
          localStorage.setItem(TSEEN_KEY, JSON.stringify([...st].slice(-600)));
        }
      } catch (e) { /* пусто */ }
    }
    window._lastRestoreDupes = dupes;
    return 'ok';
  } catch (e) { return 'bad'; }
}
function copyBackup() {
  haptic('light');
  const text = buildBackupString();
  const done = () => {
    try {
      tg.showPopup({
        type: 'ok',
        title: '💾 Бэкап скопирован',
        message: 'Вставь этот текст себе в «Избранное» в Telegram. Он включает «Моё», оценки, заметки и «🗂 Мои подборки» — потом перенеси на другой телефон через «📥 Восстановить».',
      });
    } catch (e) { /* пусто */ }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(done);
  } else done();
}

// v109: «🖼 Поделиться картинкой» — красивая картинка всех «хочу посмотреть».
// Клепаем canvas с постерами (до 24), названиями и брендом, выводим в модалку
// sharecard-modal (переиспользуем её) — можно скачать и кинуть в чат.
function shareFavsPoster() {
  haptic('light');
  const favs = getFavs().filter(c => ALL.some(m => String(m.code) === String(c)));
  if (!favs.length) return;
  const modal = document.getElementById('sharecard-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const prev = document.getElementById('sharecard-preview');
  prev.innerHTML = '<p class="modal-muted">🎨 Собираем постеры…</p>';
  const items = favs.slice(0, 24).map(c => ALL.find(m => String(m.code) === String(c))).filter(Boolean);
  const COLS = 4, CELL_W = 120, CELL_H = 200, PAD = 10, HEAD_H = 64, FOOT_H = 40;
  const rows = Math.ceil(items.length / COLS);
  const W = PAD * 2 + COLS * CELL_W;
  const H = PAD * 2 + HEAD_H + rows * CELL_H + FOOT_H;
  let cv, ctx;
  try {
    cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    ctx = cv.getContext('2d');
  } catch (e) { prev.innerHTML = '<p class="modal-muted">Картинку не удалось собрать</p>'; return; }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1b2340'); g.addColorStop(1, '#0a0d1a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,193,7,.85)';
  ctx.font = 'bold 22px Manrope, Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`МОЙ СПИСОК «ХОЧУ ПОСМОТРЕТЬ» — ${items.length}`, W / 2, 40);
  const loaded = [];   // подсчёт загруженных, рисуем по мере поступления
  items.forEach((m, i) => {
    const r = Math.floor(i / COLS), c = i % COLS;
    const x = PAD + c * CELL_W, y = PAD + HEAD_H + r * CELL_H;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(x, y, CELL_W, CELL_H);
    const tag = document.createElement('img');
    tag.crossOrigin = 'anonymous';
    const paint = (img) => {
      try {
        const ar = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 1.5;
        const h = Math.min(CELL_H, CELL_W * ar);
        const w = h / ar;
        const dx = x + (CELL_W - w) / 2, dy = y + (CELL_H - h) / 2;
        ctx.drawImage(img, dx, dy, w, h);
      } catch (e) {}
      loaded.push(1);
      if (loaded.length === items.length) finish();
    };
    tag.onload = () => paint(tag);
    tag.onerror = () => { loaded.push(1); if (loaded.length === items.length) finish(); };
    tag.src = m.poster;
  });
  const finish = () => {
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = 'bold 13px Manrope, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎬 КАПИТАН КИНО — разгадывай коды и смотри кино', W / 2, H - 14);
    try {
      const url = cv.toDataURL ? cv.toDataURL('image/png') : '';
      if (!url) { prev.innerHTML = '<p class="modal-muted">Картинку не удалось собрать</p>'; return; }
      prev.innerHTML = `<img src="${url}" alt="Мой список «Хочу посмотреть»"/>`;
      const dl = document.getElementById('btn-sharecard-download');
      if (dl) dl.onclick = () => {
        try {
          const a = document.createElement('a');
          a.href = url; a.download = 'kinokod_favs.png'; a.click();
        } catch (e) { window.open(url, '_blank'); }
      };
    } catch (e) { prev.innerHTML = '<p class="modal-muted">Картинку не удалось собрать</p>'; }
  };
  // страховка: если какой-то постер завис, всё равно рисуем
  setTimeout(() => { if (loaded.length < items.length) { loaded.length = items.length; finish(); } }, 6000);
}
function importBackup() {
  haptic('light');
  try {
    tg.showPopup({
      type: 'prompt',
      title: '📥 Восстановление из бэкапа',
      message: 'Вставь скопированную строку кинокода и нажми OK. Текущие «Моё», оценки, просмотренные и заметки будут заменены.',
      placeholder: 'kinokod:v1:…',
      text: '',
      callback: (btnId, value) => {
        if (btnId !== 'ok') return;
        const r = importBackupString(value || '');
        if (r === 'ok') {
          haptic('ok');
          const dupes = window._lastRestoreDupes || 0;
          try { tg.showPopup({ type: 'ok', title: '✅ Восстановлено!', message: 'Данные перенесены с другого устройства.' + (dupes > 0 ? `\n🧹 Дубликаты убраны: ${dupes}.` : '') }); } catch (e) {}
          renderGrid();
          renderRecoShelf();
        } else if (r === 'not_backup') {
          try { tg.showPopup({ type: 'alert', title: 'Не та строка', message: 'Это не бэкап «Киноафиши». Убедись, что вставил строку kinokod:v1:… целиком.' }); } catch (e) {}
        } else {
          try { tg.showPopup({ type: 'alert', title: 'Ошибка', message: 'Бэкап повреждён или устарел — восстановить не удалось.' }); } catch (e) {}
        }
      },
    });
  } catch (e) { /* пусто */ }
}
function backupFavsNotice() {
  const favs = getFavs();
  const favTitles = favs.map(code => {
    const m = ALL.find(x => String(x.code) === String(code));
    return m ? `${m.code} — ${m.title}` : `${code}`;
  });
  // Переменная используется кнопкой «📋 Скопировать список» (см. copyFavsList)
  window._favTitlesCache = favTitles;
  const ratN = Object.keys(getRatings()).length;
  const watN = getWatched().length;
  return `
    <div class="cols-list">
      <div class="col-card backup-card">
        <div class="col-body">
          <h3>💾 «Моё» хранится локально${favs.length ? ` (${favs.length})` : ''}</h3>
          <p>${favs.length || ratN || watN
            ? `❤️ ${favs.length} · ⭐ ${ratN} · 👁 ${watN} — переноси на другое устройство`
            : 'Список пуст — нажми ❤️ на любом фильме.'}</p>
        </div>
        ${favs.length ? '<button class="btn-secondary" id="btn-copy-list">📋 Скопировать список</button>' : ''}
        ${favs.length ? '<button class="btn-secondary" id="btn-share-posters">🖼 Поделиться картинкой</button>' : ''}
        ${favs.length ? '<button class="btn-secondary" id="btn-backup">💾 Сохранить в боте</button>' : ''}
        ${favs.length ? '<button class="btn-secondary" id="btn-copy-backup">📱💾 Копия для другого устройства</button>' : ''}
        ${favs.length ? '<button class="btn-secondary" id="btn-import-backup">📥 Восстановить здесь</button>' : ''}
        <button class="btn-secondary" id="btn-restore-bot">☁️ Восстановить из бота</button>
        ${favs.length ? '<button class="btn-watch" id="btn-clear-fav" style="margin-top:8px">🧹 Очистить «Хочу посмотреть»</button>' : ''}
      </div>
    </div>`;
}

// ---------- сетка (афиша + моё) ----------
// Подсветка совпадения поиска в названии (esc обеих частей!)
function hlTitle(title, q) {
  const t = String(title || '');
  if (!q) return esc(t);
  try {
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return t.split(re).map(part =>
      part.toLowerCase() === q.toLowerCase() ? `<mark class="hl">${esc(part)}</mark>` : esc(part)
    ).join('');
  } catch (e) { return esc(t); }
}

// ---------- v60: умный поиск-фраза ----------
// Разбираем «драмы 8+», «триллеры 2010-х», «боевик до 2 часов» на фильтры.
function parseSmartQuery(raw) {
  const q = (raw || '').toLowerCase().replace(/ё/g, 'е');
  if (!q || q.length > 60) return null;
  const parts = [];
  const out = {};

  // жанр: слово во фразе совпадает с началом известного жанра из базы
  const genreMap = new Map();
  ALL.forEach(m => (m.genres || []).forEach(g => {
    const gl = String(g).toLowerCase();
    const stem = gl.replace(/(ый|ой|ая|ое|ые|а|я|ы|и|е|у|ь)$/, '');
    if (stem.length >= 4 && !genreMap.has(stem)) genreMap.set(stem, gl);
  }));
  for (const [stem, gl] of genreMap) {
    if (q.includes(stem)) { out.genre = gl; parts.push('жанр: ' + gl); break; }
  }

  const rm = q.match(/(\d)(?:[.,](\d))?\s*\+/);          // «8+», «7.5+»
  if (rm) {
    out.minRating = parseFloat(rm[1] + '.' + (rm[2] || '0'));
    parts.push('рейтинг ' + out.minRating + '+');
  }

  const dm = q.match(/(19|20)(\d)0\s*[-–—]?\s*(х|е|ых|ов)/);  // «2010-х», «2000-е»
  if (dm) {
    out.decade = parseInt(dm[1] + dm[2] + '0', 10);
    parts.push(out.decade + '-е');
  } else {
    const ym = q.match(/\b(19\d{2}|20\d{2})\b/);              // точный год
    if (ym) { out.year = parseInt(ym[1], 10); parts.push(out.year + ' год'); }
  }

  const dmax = q.match(/до\s*(\d(?:[.,]\d)?)\s*(ч|час)/);     // «до 2 часов»
  if (dmax) {
    out.maxMin = Math.round(parseFloat(dmax[1].replace(',', '.')) * 60);
    parts.push('до ' + dmax[1] + ' ч');
  }
  if (/коротк/.test(q)) { out.maxMin = Math.min(out.maxMin || 999, 100); parts.push('короткие'); }
  if (/длинн/.test(q)) { out.minDurMin = 120; parts.push('длинные'); }

  if (!parts.length) return null;
  out.parts = parts;   // v65: parts нужен рендеру подсказки «🧠 …» — раньше был undefined и рендер падал
  return out;
}

// ---------- v62: «Смотреть фильм» ----------
// Просмотр — по прямой ссылке на kinogo.ec (доступен и в РФ, и в Украине).
// Справочная страница о фильме — IMDB (работает без ограничений по стране),
// Кинопоиск запрещён в UI: он недоступен части аудитории канала.
// Название чистим для поиска: «На грани» (Man on a Ledge, 2012) -> «На грани»
function cleanKpTitle(raw) {
  let s = String(raw || '');
  const qm = s.match(/«([^»]+)»/);
  if (qm) s = qm[1];
  return s.replace(/\s*\([^)]*\)\s*$/, '').replace(/[«»"]/g, '').trim();
}
function openUrlLink(url) {
  if (!url) return;
  haptic('ok');
  try { tg.openLink(url, { try_instant_view: false }); } catch (_) { window.open(url, '_blank'); }
}
function openWatchLink(m) {
  if (m.link) return openUrlLink(m.link);   // прямая ссылка на просмотр (kinogo.ec)
  if (m.link2) return openUrlLink(m.link2); // v72: запасное зеркало
  openImdbLink(m);                          // иначе — страница о фильме на IMDB
}
function openImdbLink(m) {
  const q = cleanKpTitle(m.title);
  openUrlLink('https://www.imdb.com/find/?q=' + encodeURIComponent(q || ''));
}

// ---------- v72: флаги стран, красивый шаринг, «Случайный фильм», #m=КОД ----------
const COUNTRY_FLAGS = {
  'сша': '🇺🇸', 'россия': '🇷🇺', 'великобритания': '🇬🇧', 'франция': '🇫🇷',
  'германия': '🇩🇪', 'канада': '🇨🇦', 'япония': '🇯🇵', 'южная корея': '🇰🇷',
  'китай': '🇨🇳', 'италия': '🇮🇹', 'испания': '🇪🇸', 'индия': '🇮🇳',
  'австралия': '🇦🇺', 'бразилия': '🇧🇷', 'мексика': '🇲🇽', 'швеция': '🇸🇪',
  'дания': '🇩🇰', 'норвегия': '🇳🇴', 'ирландия': '🇮🇪', 'новая зеландия': '🇳🇿',
  'польша': '🇵🇱', 'украина': '🇺🇦', 'чехия': '🇨🇿', 'гонконг': '🇭🇰',
  'нидерланды': '🇳🇱', 'бельгия': '🇧🇪', 'швейцария': '🇨🇭', 'австрия': '🇦🇹',
  'финляндия': '🇫🇮', 'израиль': '🇮🇱', 'турция': '🇹🇷', 'аргентина': '🇦🇷',
};
const flagOf = (ct) => COUNTRY_FLAGS[String(ct || '').toLowerCase().trim()] || '🌍';

// Красивый шаринг фильма: эмодзи-текст + ссылка на ПУБЛИЧНУЮ страницу фильма
// (v122, B1): страница movie/<code>.html содержит OG-теги — в превью чата
// Telegram и других мессенджеров показывается постер, оценка и название.
// Со страницы одна кнопка возвращает в «Киноафишу» (#movie=КОД).
function shareMovie(m) {
  haptic('light');
  const base = location.href.split('#')[0].replace(/index\.html$/, '');
  const link = base + 'movie/' + encodeURIComponent(m.code) + '.html';
  const g = (m.genres || []).slice(0, 2).join(' · ');
  const text = `🎬 «${m.title}»${m.year ? ' (' + m.year + ')' : ''}\n` +
    `⭐ ${m.rating || '—'}${g ? ' · ' + g : ''}\n\n` +
    `Угадывай фильмы по кодам и смотри кино в «Киноафише» 👇`;
  const url = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text);
  try { tg.openTelegramLink(url); } catch (e) { window.open(url, '_blank'); }
}

// v113: «🖼 Постер каталога» — вся афиша одной картинкой (сетка постеров с кодами).
// Удобно кинуть в чат: витрина канала в одном посте. Рисуем на canvas, показываем
// в модалке карточки (sharecard-modal) с кнопкой скачивания.
function shareCatalogPoster() {
  haptic('light');
  if (!ALL.length) return;
  const modal = document.getElementById('sharecard-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const prev = document.getElementById('sharecard-preview');
  prev.innerHTML = '<p class="modal-muted">🎨 Собираем витрину…</p>';
  const items = ALL.filter(m => m.poster).slice(0, 48);
  if (!items.length) { prev.innerHTML = '<p class="modal-muted">Постеры ещё не загрузились — попробуй чуть позже</p>'; return; }
  // v114: компактная витрина 6×8 (пропорции ячейки = постера 2:3), чтобы
  // картинка не была вытянутым прямоугольником и целиком помещалась в превью.
  const COLS = 6, CELL_W = 80, CELL_H = 120, PAD = 10, HEAD_H = 64, FOOT_H = 40;
  const rows = Math.ceil(items.length / COLS);
  const W = PAD * 2 + COLS * CELL_W;
  const H = PAD * 2 + HEAD_H + rows * CELL_H + FOOT_H;
  let cv, ctx;
  try {
    cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    ctx = cv.getContext('2d');
  } catch (e) { prev.innerHTML = '<p class="modal-muted">Картинку не удалось собрать</p>'; return; }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1b2340'); g.addColorStop(1, '#0a0d1a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,193,7,.5)'; ctx.lineWidth = 3;
  ctx.strokeRect(5, 5, W - 10, H - 10);
  ctx.fillStyle = 'rgba(255,193,7,.95)';
  ctx.font = 'bold 22px Manrope, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🎬 КАПИТАН КИНО', W / 2, 40);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.font = '14px Manrope, Arial';
  ctx.fillText(`${ALL.length} фильмов · угадывай коды — открывай кино`, W / 2, 64);
  const loaded = [];
  const finish = () => {
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = 'bold 12px Manrope, Arial';
    ctx.fillText('Открой афишу в Telegram → @kapitan_kino_bot', W / 2, H - 16);
    try {
      const url = cv.toDataURL ? cv.toDataURL('image/png') : '';
      if (!url) { prev.innerHTML = '<p class="modal-muted">Картинку не удалось собрать</p>'; return; }
      prev.innerHTML = `<img src="${url}" alt="Каталог фильмов"/>`;
      const dl = document.getElementById('btn-sharecard-download');
      if (dl) dl.onclick = () => {
        try {
          const a = document.createElement('a');
          a.href = url; a.download = 'kinokod_catalog.png'; a.click();
        } catch (e) { window.open(url, '_blank'); }
      };
    } catch (e) { prev.innerHTML = '<p class="modal-muted">Картинку не удалось собрать</p>'; }
  };
  items.forEach((m, i) => {
    const r = Math.floor(i / COLS), c = i % COLS;
    const x = PAD + c * CELL_W, y = PAD + HEAD_H + r * CELL_H;
    // подложка-ячейка
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.fillRect(x, y, CELL_W, CELL_H - 20);
    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    const paint = () => {
      try {
        const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
        const ar = ih / iw;
        const ph = CELL_H - 20, pw = CELL_W;
        // cover-филл: постер заполняет ячейку полностью (кроп сверху/снизу)
        let w, h;
        if (ar >= ph / pw) { h = ph; w = h / ar; }
        else { w = pw; h = w * ar; }
        ctx.drawImage(img, x + (pw - w) / 2, y + (ph - h) / 2, w, h);
      } catch (e) {}
      // плашка с кодом
      ctx.fillStyle = 'rgba(255,193,7,.9)';
      ctx.font = 'bold 10px Manrope, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🔑 ' + m.code, x + CELL_W / 2, y + CELL_H - 7);
      loaded.push(1);
      if (loaded.length === items.length) finish();
    };
    img.onload = paint;
    img.onerror = () => {
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.font = '22px Manrope, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🎬', x + CELL_W / 2, y + (CELL_H - 20) / 2 + 7);
      ctx.fillStyle = 'rgba(255,193,7,.9)';
      ctx.font = 'bold 10px Manrope, Arial';
      ctx.fillText('🔑 ' + m.code, x + CELL_W / 2, y + CELL_H - 7);
      loaded.push(1);
      if (loaded.length === items.length) finish();
    };
    img.src = m.poster;
  });
  // страховка: если часть постеров зависла — всё равно отдаём витрину
  setTimeout(() => { if (loaded.length < items.length) { loaded.length = items.length; finish(); } }, 8000);
}

// v106: 🖼 готовая карточка-картинка (canvas) для шеринга в чаты и сторис
// Рисуем плакат 500×750: градиентный фон, постер, название, рейтинг, бренд.
const SC_W = 500, SC_H = 750;
function drawShareCard(m, cb) {
  let cv = null, cx = null;
  try {
    cv = document.createElement('canvas');
    cv.width = SC_W; cv.height = SC_H;
    cx = cv.getContext('2d');
  } catch (e) { cb(null); return; }
  const g = cx.createLinearGradient(0, 0, 0, SC_H);
  g.addColorStop(0, '#1b2340');
  g.addColorStop(0.55, '#12162b');
  g.addColorStop(1, '#0a0d1a');
  cx.fillStyle = g;
  cx.fillRect(0, 0, SC_W, SC_H);
  cx.strokeStyle = 'rgba(255,193,7,.55)';
  cx.lineWidth = 3;
  cx.strokeRect(6, 6, SC_W - 12, SC_H - 12);
  // финальная отрисовка текста поверх постера
  const ready = () => {
    cx.textAlign = 'center';
    const title = String(m.title || '').replace(/^«|»$/g, '').trim();
    const lines = _scLines(title, 28);
    cx.fillStyle = '#ffffff';
    cx.font = 'bold 30px Manrope, Arial';
    let ty = 612;
    lines.forEach(l => { cx.fillText(l, SC_W / 2, ty); ty += 36; });
    cx.fillStyle = 'rgba(255,193,7,.9)';
    cx.font = 'bold 15px Manrope, Arial';
    cx.fillText('🔑 Код ' + m.code, SC_W / 2, m.rating ? 672 : 700);
    if (m.rating) {
      cx.fillStyle = 'rgba(255,255,255,.85)';
      cx.font = '14px Manrope, Arial';
      cx.fillText('⭐ ' + m.rating + (m.year ? '  ·  ' + m.year : ''), SC_W / 2, 700);
    }
    cx.fillStyle = 'rgba(255,255,255,.55)';
    cx.font = 'bold 12px Manrope, Arial';
    cx.fillText('🎬 КАПИТАН КИНО', SC_W / 2, 730);
    cb(cv);
  };
  const paintPoster = (img) => {
    cx.fillStyle = 'rgba(0,0,0,.35)';
    cx.fillRect((SC_W - 300) / 2 - 8, 82 - 8, 300 + 16, 450 + 16);
    cx.drawImage(img, (SC_W - 300) / 2, 82, 300, 450);
    ready();
  };
  const paintFallback = () => {
    cx.fillStyle = '#10131f';
    cx.fillRect((SC_W - 300) / 2, 82, 300, 450);
    cx.fillStyle = 'rgba(255,255,255,.85)';
    cx.font = '38px Manrope, Arial';
    cx.textAlign = 'center';
    cx.fillText('🎬', SC_W / 2, 82 + 225);
    ready();
  };
  if (m.poster) {
    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    let done = false;
    img.onload = () => { if (!done) { done = true; paintPoster(img); } };
    img.onerror = () => { if (!done) { done = true; paintFallback(); } };
    img.src = m.poster;
    setTimeout(() => { if (!done) { done = true; paintFallback(); } }, 4000);
  } else paintFallback();
}

// перенос названия фиксированными лимитами (без measureText)
function _scLines(title, maxLen) {
  const s = String(title);
  const lines = [];
  for (let i = 0; i < s.length; i += maxLen) {
    let end = Math.min(i + maxLen, s.length);
    if (end < s.length) {
      const sp = s.lastIndexOf(' ', end);
      if (sp > i + maxLen / 2) end = sp;
    }
    lines.push(s.slice(i, end).trim());
    if (lines.length >= 3) break;
  }
  return lines;
}

function openShareCard(m) {
  haptic('light');
  const modal = document.getElementById('sharecard-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const prev = document.getElementById('sharecard-preview');
  prev.innerHTML = '<p class="modal-muted">🎨 Рисуем карточку…</p>';
  drawShareCard(m, (cv) => {
    if (!cv) { prev.innerHTML = '<p class="modal-muted">Карточку не удалось собрать — используй «📤 Поделиться»</p>'; return; }
    try {
      // Новый canvas API: toDataURL / toBlob. Фолбэк — dataURL вручную.
      const makeUrl = (cb2) => {
        if (cv.toDataURL) cb2(cv.toDataURL('image/png'));
        else if (cv.toBlob) {
          const fr = new FileReader();
          fr.readAsDataURL(cv.toBlob()).then(cb2).catch(() => cb2(null));
        } else cb2(null);
      };
      makeUrl((url) => {
        if (!url) { prev.innerHTML = '<p class="modal-muted">Карточку не удалось собрать — используй «📤 Поделиться»</p>'; return; }
        prev.innerHTML = `<img src="${url}" alt="Карточка фильма"/>`;
        const dl = document.getElementById('btn-sharecard-download');
        if (dl) dl.onclick = () => {
          try {
            const a = document.createElement('a');
            a.href = url;
            a.download = 'kinokod_' + m.code + '.png';
            a.click();
          } catch (e) { window.open(url, '_blank'); }
        };
      });
    } catch (e) {
      prev.innerHTML = '<p class="modal-muted">Карточку не удалось собрать — используй «📤 Поделиться»</p>';
    }
  });
}

// Открываем карточку фильма по прямой ссылке #m=КОД (из шеринга)
function parseMovieHash() {
  const h = (location.hash || '').replace(/^#/, '');
  if (!/^m=[^&]+/.test(h)) return;
  const code = decodeURIComponent(h.slice(2));
  if (code && ALL.some(x => String(x.code) === code)) {
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => openDetail(code), 250);
  }
}

// Случайный фильм: без недавних показов, приоритет — с постером и рейтингом
let _recentRandom = [];
function pickRandomMovie() {
  if (!ALL.length) return null;
  let pool = ALL.filter(m => m.poster && !_recentRandom.includes(String(m.code)));
  if (!pool.length) pool = ALL.filter(m => !_recentRandom.includes(String(m.code)));
  if (!pool.length) { _recentRandom = []; pool = ALL.slice(); }
  const m = pool[Math.floor(Math.random() * pool.length)];
  _recentRandom.push(String(m.code));
  if (_recentRandom.length > 5) _recentRandom = _recentRandom.slice(-5);
  return m;
}
function _renderRandomCard(m) {
  const body = document.getElementById('random-body');
  if (!m || !body) return;
  const flags = (m.countries || []).slice(0, 2).map(flagOf).join(' ');
  body.innerHTML = `
    <div class="rm-card" data-code="${esc(m.code)}">
      ${m.poster ? `<img src="${esc(m.poster)}" alt="" loading="lazy" decoding="async" ${FADE}${dimStyle(m)}/>` : '<div class="rm-ph">🎬</div>'}
      <div class="rm-info">
        <b>${esc(m.title)}</b>
        <span>${ratingBadge(m)}${m.year ? ' · ' + esc(String(m.year)) : ''}${flags ? ' · ' + flags : ''}</span>
        ${(m.genres || []).length ? '<em>' + m.genres.slice(0, 3).map(g => `<i class="chip chip-genre" data-g="${esc(g)}">${esc(g)}</i>`).join(' ') + '</em>' : ''}
      </div>
    </div>
    ${m.link || m.link2 ? '<button class="btn-watch" id="btn-rm-watch">▶️ Смотреть фильм</button>' : ''}`;
  const card = body.querySelector('.rm-card');
  if (card) card.onclick = () => { closeRandom(); openDetail(m.code); };
  body.querySelectorAll('.chip-genre').forEach(ch =>
    ch.addEventListener('click', (e) => { e.stopPropagation(); closeRandom(); activeGenre = ch.dataset.g; renderGenreChips(); openView('grid'); }));
  const w = document.getElementById('btn-rm-watch');
  if (w) w.onclick = () => openWatchLink(m);
}
function closeRandom() { document.getElementById('random-modal').classList.add('hidden'); }

// v98: рулетка — «Случайный фильм» перебирает названия с замедлением,
// затем фиксирует выпавшую карточку. Закрытие модалки останавливает крутку.
function renderRandomMovie() {
  const m = pickRandomMovie();
  const body = document.getElementById('random-body');
  const modal = document.getElementById('random-modal');
  if (!m || !body || !modal) return;
  haptic('light');
  const spin = () => {
    let n = 0, delay = 60;
    body.innerHTML = '<div class="rm-roll"><span class="rm-roll-dice">🎲</span><b id="rm-roll-name">…</b></div>';
    const step = () => {
      if (modal.classList.contains('hidden')) return;   // закрыли во время вращения
      if (n++ >= 12) { _renderRandomCard(m); return; }
      const r = ALL[Math.floor(Math.random() * ALL.length)];
      const el = document.getElementById('rm-roll-name');
      if (el) el.textContent = r.title || '…';
      if (n % 4 === 0) haptic('light');
      delay *= 1.22;
      setTimeout(step, delay);
    };
    step();
  };
  spin();
}

// ---------- v64: «🎭 Загадай другу» ----------
// Выбираешь фильм — делишься ссылкой с эмодзи-подсказками. Друг открывает
// мини-апп по ссылке #riddle=КОД и угадывает: сначала подсказки, потом ответ.
const GENRE_EMOJI = {
  'боевик': '💥', 'триллер': '🔪', 'ужасы': '👻', 'комедия': '😂', 'драма': '🎭',
  'фантастика': '🚀', 'фантастика / фэнтези': '🚀', 'криминал': '🔫', 'детектив': '🔍',
  'романтика': '💕', 'любовь': '💕', 'мелодрама': '💕', 'мультфильм': '🧸',
  'анимация': '🧸', 'мультипликационный': '🧸', 'приключения': '🗺',
  'фэнтези': '🐉', 'история': '🏛', 'исторический': '🏛', 'военный': '🎖',
  'спорт': '🏆', 'музыка': '🎵', 'биография': '📖', 'семейный': '👨‍👩‍👧',
  'мистика': '🔮', 'вестерн': '🤠', 'документальный': '🎥', 'короткометражка': '⏱',
};
function riddleHints(m) {
  const out = [];
  (m.genres || []).slice(0, 2).forEach(g => {
    const e = GENRE_EMOJI[String(g).toLowerCase().trim()];
    if (e && !out.includes(e)) out.push(e);
  });
  const y = parseInt(m.year, 10) || 0;
  if (y) out.push(y < 1990 ? '📼' : y < 2005 ? '📀' : y < 2020 ? '💿' : '🆕');
  const r = parseFloat(m.rating) || 0;
  out.push(r >= 8 ? '🏆' : r >= 7 ? '👍' : '🤔');
  return out.slice(0, 4).join('  ');
}
function shareRiddle(m) {
  haptic('light');
  const link = location.href.split('#')[0] + '#riddle=' + encodeURIComponent(m.code);
  const y = parseInt(m.year, 10) || 0;
  const text = `🎬 Я загадал фильм в «Киноафише»!\n\n` +
    `Подсказки: ${riddleHints(m)}\n` +
    (y ? `Эпоха: ~${Math.floor(y / 10) * 10}-е\n` : '') +
    `Угадаешь? Открой ссылку и проверь себя 👇`;
  const url = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text);
  try { tg.openTelegramLink(url); } catch (e) { window.open(url, '_blank'); }
}

// v110: «Загадать с ответом» — ссылка с параметром reveal=1, чтобы друг мог сразу
// проверить, угадал ли (ответ разворачивается автоматически после паузы).
function shareRiddleReveal(m) {
  haptic('light');
  const link = location.href.split('#')[0] + '#riddle=' + encodeURIComponent(m.code) + '&reveal=1';
  const text = `🎬 Проверь себя: отгадаешь по подсказкам?\n\n${riddleHints(m)}\n\nОткрой ссылку — там фильм и ответ. Ты был близок? 😉`;
  const url = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text);
  try { tg.openTelegramLink(url); } catch (e) { window.open(url, '_blank'); }
}
function showRiddleModal(code, autoReveal) {
  const m = ALL.find(x => String(x.code) === String(code));
  if (!m) return;
  const modal = document.getElementById('riddle-modal');
  if (!modal) return;
  const hints = document.getElementById('riddle-hints');
  if (hints) hints.textContent = riddleHints(m);
  const body = document.getElementById('riddle-body');
  if (body) { body.classList.add('hidden'); body.innerHTML = `
    <div class="riddle-reveal">
      ${m.poster ? `<img src="${esc(m.poster)}" alt="" loading="lazy" decoding="async" ${FADE}/>` : ''}
      <div class="riddle-answer">
        <b>${esc(m.title)}</b>
        <span>${ratingBadge(m)}${m.year ? ' · ' + esc(String(m.year)) : ''}</span>
      </div>
    </div>`; }
  const reveal = document.getElementById('btn-riddle-reveal');
  if (reveal) {
    reveal.classList.remove('hidden');
    reveal.onclick = () => {
      haptic('ok');
      if (body) body.classList.remove('hidden');
      reveal.classList.add('hidden');
      const open = document.getElementById('btn-riddle-open');
      if (open) open.classList.remove('hidden');
    };
  }
  const open = document.getElementById('btn-riddle-open');
  if (open) {
    open.classList.add('hidden');
    open.onclick = () => { modal.classList.add('hidden'); openDetail(m.code); };
  }
  modal.classList.remove('hidden');
  // v110: ссылка с reveal=1 — друг сразу видит ответ (после паузы)
  if (autoReveal) {
    setTimeout(() => {
      haptic('ok');
      if (body) body.classList.remove('hidden');
      if (reveal) reveal.classList.add('hidden');
      if (open) open.classList.remove('hidden');
    }, 1200);
  }
}
function parseRiddleHash() {
  // Друг пришёл по ссылке «загадай другу»: #riddle=КОД. Показываем загадку
  // один раз и чистим хэш, чтобы при следующем открытии она не всплывала.
  try {
    const params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const code = params.get('riddle');
    if (code) {
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => showRiddleModal(code, params.get('reveal') === '1'), 500);
    }
  } catch (e) { /* пусто */ }
}
// v76: восстановление «Моё» из бота — кнопка «📥 Восстановить» в чате открывает
// мини-апп с #restore=<строка бэкапа>. Импортируем и чистим хэш.
function parseRestoreHash() {
  try {
    const params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const data = params.get('restore');
    if (!data) return;
    history.replaceState(null, '', location.pathname + location.search);
    const r = importBackupString(String(data));
    setTimeout(() => {
      try {
        if (r === 'ok') {
          const dupes = window._lastRestoreDupes || 0;
          tg.showPopup({ type: 'ok', title: '✅ Восстановлено из бота!', message: '«Моё», оценки, просмотренные, заметки и «🗂 Мои подборки» перенесены на это устройство.' + (dupes > 0 ? `\n🧹 Дубликаты убраны: ${dupes}.` : '') });
        } else {
          tg.showPopup({ type: 'alert', title: 'Не удалось', message: 'Бэкап повреждён или устарел. Скопируй строку заново в «❤️ Моё».' });
        }
      } catch (e) { /* пусто */ }
    }, 400);
  } catch (e) { /* пусто */ }
}
(function initRiddleModal() {
  const bg = document.getElementById('riddle-modal');
  if (!bg) return;
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.classList.add('hidden'); });
  ['btn-riddle-close', 'btn-riddle-close2'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.onclick = () => bg.classList.add('hidden');
  });
})();

// ---------- v77: «Сколько времени есть?» — фильтр афиши по длительности ----------
let timeLimit = 0;  // 0 = любая длительность
const durOf = (m) => { const d = parseInt(m && m.duration, 10); return d > 0 ? d : 0; };
function renderTimeChips() {
  const box = document.getElementById('time-chips');
  if (!box) return;
  const chips = [
    { v: 0, label: '⏱ Любое время' },
    { v: 100, label: '🎬 ~1,5 ч' },
    { v: 125, label: '🎬 ~2 ч' },
    { v: 190, label: '🎬 до 3 ч' },
  ];
  box.innerHTML = chips.map(c =>
    `<button class="t-chip${timeLimit === c.v ? ' active' : ''}" data-t="${c.v}">${c.label}</button>`).join('');
  box.querySelectorAll('.t-chip').forEach(ch => {
    ch.addEventListener('click', () => {
      timeLimit = parseInt(ch.dataset.t, 10) || 0;
      haptic('light');
      renderTimeChips();
      renderGrid();
    });
  });
}
// v77: стрелки прокрутки полок на ПК (на тач-устройствах остаётся свайп)
function initShelfArrows() {
  document.querySelectorAll('.hero-shelf').forEach(shelf => {
    const row = shelf.querySelector('.hero-row');
    if (!row || shelf.querySelector('.shelf-arrow')) return;
    const go = (dir) => row.scrollBy({ left: dir * Math.max(260, row.clientWidth * 0.8), behavior: 'smooth' });
    const mk = (cls, title, dir) => {
      const b = document.createElement('button');
      b.className = 'shelf-arrow ' + cls;
      b.textContent = dir > 0 ? '›' : '‹';
      b.title = title;
      b.addEventListener('click', () => { haptic('light'); go(dir); });
      shelf.appendChild(b);
    };
    mk('sa-prev', 'Назад', -1);
    mk('sa-next', 'Вперёд', 1);
  });
}
// v77: тень стеклянной шапки при прокрутке
function initHeaderScroll() {
  const h = document.querySelector('.header');
  if (!h) return;
  const upd = () => h.classList.toggle('scrolled', (window.scrollY || 0) > 8);
  window.addEventListener('scroll', upd, { passive: true });
  upd();
  // v123: высота табов в CSS-переменной — липкая строка фильтров встаёт ровно под
  // ними (на узких экранах табы переносятся на второй ряд, «магическое» число не годится)
  const tabs = document.querySelector('.tabs');
  if (tabs) {
    const sync = () => document.documentElement.style.setProperty('--tabs-h', tabs.offsetHeight + 'px');
    sync();
    window.addEventListener('resize', sync);
    setTimeout(sync, 300);   // после подстановки шрифта строка может стать выше
  }
}

// ---------- v123: липкая строка «что включено» + сколько нашлось ----------
// Зачем: строка поиска и чипы уезжают вверх при прокрутке, и через экран уже не
// видно, почему в афише мало фильмов. Теперь активные фильтры висят под табами
// и снимаются одним тапом (плюс видно счётчик найденного).
// v255: «Мои наборы» — сохранённые комбинации фильтров (до 6), тап — применить
const FSETS_KEY = 'kino_fsets';
function fsLoad() { try { const a = JSON.parse(localStorage.getItem(FSETS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function fsSave(a) { try { localStorage.setItem(FSETS_KEY, JSON.stringify(a.slice(0, 6))); } catch (e) {} }
function fsLabel(f) {
  const p = [];
  if (f.m) p.push(moodLabel(f.m).replace(/^\S+\s/, ''));
  if (f.g) p.push(marGenreLabel(f.g));
  if (f.c) p.push(f.c);
  if (f.t) p.push('до ' + f.t + ' мин');
  if (f.tr) p.push('трейлер');
  if (f.on) p.push('онлайн');
  return p.join(' · ') || 'Набор';
}
function fsCurrent() { return { g: activeGenre || '', m: activeMood || '', c: activeCountry || '', t: timeLimit || 0, tr: !!onlyTrailer, on: !!onlyOnline }; }
function fsSaveCurrent() {
  const f = fsCurrent();
  if (!(f.g || f.m || f.c || f.t || f.tr || f.on)) { popMsg('Сначала выбери фильтры'); return; }
  const key = JSON.stringify(f), a = fsLoad().filter(x => JSON.stringify(x) !== key);
  a.unshift(f); fsSave(a); haptic('ok'); popMsg('⭐ Набор сохранён'); renderFsets(); renderGrid();
}
function fsApply(f) {
  activeGenre = f.g || ''; renderGenreChips();
  activeMood = f.m || ''; renderMoodChips();
  activeCountry = f.c || ''; renderCountryChips();
  timeLimit = f.t || 0; renderTimeChips();
  onlyTrailer = !!f.tr; const tb = document.getElementById('btn-only-tr'); if (tb) tb.classList.toggle('active', onlyTrailer);
  onlyOnline = !!f.on; const ob = document.getElementById('btn-only-online'); if (ob) ob.classList.toggle('active', onlyOnline);
  haptic('light'); renderGrid();
}
function renderFsets() {
  let box = document.getElementById('fset-chips');
  const a = fsLoad();
  if (!box) {
    const mc = document.getElementById('mood-chips');
    if (!mc || !mc.parentNode) return;
    box = document.createElement('div'); box.id = 'fset-chips'; box.className = 'mood-chips fset-chips';
    mc.parentNode.insertBefore(box, mc);
  }
  if (!a.length) { box.innerHTML = ''; box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = '<span class="mood-l">⭐ Мои наборы</span>' + a.map((f, i) => `<span class="t-chip fset"><button class="fs-go" data-i="${i}">${esc(fsLabel(f))}</button><button class="fs-x" data-i="${i}" aria-label="Удалить набор">✕</button></span>`).join('');
  box.querySelectorAll('.fs-go').forEach(b => b.onclick = () => fsApply(a[+b.dataset.i]));
  box.querySelectorAll('.fs-x').forEach(b => b.onclick = () => { const n = fsLoad(); n.splice(+b.dataset.i, 1); fsSave(n); haptic('light'); renderFsets(); });
}
function resetFilters() {
  const s = document.getElementById('search');
  if (s) s.value = '';
  activeGenre = ''; renderGenreChips();
  activeMood = ''; renderMoodChips();
  activeCountry = ''; renderCountryChips();
  timeLimit = 0; renderTimeChips();
  onlyTrailer = false; const tb = document.getElementById('btn-only-tr'); if (tb) tb.classList.remove('active');
  onlyOnline = false; const ob = document.getElementById('btn-only-online'); if (ob) ob.classList.remove('active');
  haptic('light');
  renderGrid();
}
function renderFilterBar(total, shown) {
  const el = document.getElementById('filter-bar');
  if (!el) return;
  const s = document.getElementById('search');
  const q = (s && s.value || '').trim();
  const chips = [];
  if (q) chips.push(['🔍 ' + q, 'search']);
  if (activeGenre) chips.push(['🎭 ' + marGenreLabel(activeGenre), 'genre']);
  if (activeMood) chips.push([moodLabel(activeMood), 'mood']);
  if (activeCountry) chips.push(['🌍 ' + activeCountry, 'country']);
  if (timeLimit) chips.push(['⏱ до ' + timeLimit + ' мин', 'time']);
  if (onlyTrailer) chips.push(['▶️ С трейлером', 'trailer']);
  if (onlyOnline) chips.push(['🟢 Онлайн', 'online']);
  if (localStorage.getItem(HIDE_KEY) === '1') chips.push(['🙈 Без разгаданных', 'hide']);
  if (!chips.length) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = chips.map(([label, k]) =>
    `<button class="fb-chip" data-fb="${k}">${esc(label)} ✕</button>`).join('') +
    `<span class="fb-count">найдено <b>${total}</b>${shown < total ? ' · на экране ' + shown : ''}</span>` +
    `<button class="fb-save" id="fb-save">⭐ Сохранить</button><button class="fb-reset" id="fb-reset">Сбросить</button>`;
  el.querySelectorAll('.fb-chip').forEach(b => b.onclick = () => {
    const k = b.dataset.fb;
    if (k === 'search' && s) s.value = '';
    else if (k === 'genre') { activeGenre = ''; renderGenreChips(); }
    else if (k === 'mood') { activeMood = ''; renderMoodChips(); }
    else if (k === 'country') { activeCountry = ''; renderCountryChips(); }
    else if (k === 'time') { timeLimit = 0; renderTimeChips(); }
    else if (k === 'trailer') { onlyTrailer = false; const t = document.getElementById('btn-only-tr'); if (t) t.classList.remove('active'); }
    else if (k === 'online') { onlyOnline = false; const o = document.getElementById('btn-only-online'); if (o) o.classList.remove('active'); }
    else if (k === 'hide') {
      localStorage.setItem(HIDE_KEY, '');
      const box = document.getElementById('hide-unlocked');
      if (box) box.checked = false;
      const wrap = document.getElementById('hide-toggle-wrap');
      if (wrap) wrap.classList.remove('on');
    }
    haptic('light');
    renderGrid();
  });
  const fsb = document.getElementById('fb-save'); if (fsb) fsb.onclick = fsSaveCurrent;
  const r = document.getElementById('fb-reset');
  if (r) r.onclick = () => {
    resetFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
}

function renderGrid() {
  try { renderTodayStrip(); } catch (e) {}
  const qRaw = (document.getElementById('search').value || '').trim();
  // v64: нормализуем запрос (ё→е) — раньше «зелёная» с ё не находила «Зеленая миля»
  const q = qRaw.toLowerCase().replace(/ё/g, 'е');
  const smart = parseSmartQuery(qRaw);
  const sort = document.getElementById('sort').value;
  const favMode = localStorage.getItem(FAV_MODE_KEY);  // fav | done | watched
  // v93: «Показать ещё» — афиша порциями по GRID_PAGE_SIZE (30). При смене
  // любого фильтра/поиска/сортировки страница сбрасывается на первую.
  const gKey = [view, qRaw, smart ? JSON.stringify(smart) : '', sort, favMode,
    activeGenre, activeMood, activeCountry, timeLimit, onlyTrailer, onlyOnline,
    localStorage.getItem(HIDE_KEY)].join('§');
  if (gKey !== _gridFilterKey) { _gridFilterKey = gKey; gridPage = 1; }
  const unlockedAll = getUnlocked();
  const watchedAll = getWatched();
  let list = view === 'fav'
    ? (favMode === 'done'
        ? ALL.filter(m => unlockedAll.includes(String(m.code)))
        : (favMode === 'watched'
            ? ALL.filter(m => watchedAll.includes(String(m.code)))
            : (favMode === 'rated'
                ? ALL.filter(m => getRatings()[String(m.code)])
                : ALL.filter(m => getFavs().includes(m.code)))))
    : [...ALL];
  if (activeGenre) list = list.filter(m => (m.genres || []).includes(activeGenre));
  if (activeMood) { const mg = (FMOODS.find(x => x[0] === activeMood) || [0, 0, []])[2]; list = list.filter(m => (m.genres || []).some(g => mg.includes(g))); }
  if (activeCountry) list = list.filter(m => (m.countries || []).includes(activeCountry));
  // v77: фильтр «Сколько времени есть?» — только фильмы с известной длительностью
  if (timeLimit && view === 'grid') list = list.filter(m => { const d = durOf(m); return d && d <= timeLimit; });
  // v90: «▶️ С трейлером» — только фильмы, которые можно посмотреть с видео
  if (onlyTrailer && view === 'grid') list = list.filter(m => m.trailer_yt || m.trailer_mp4 || m.trailer_file_id);
  // v91: «🟢 Онлайн» — только фильмы с прямой ссылкой на просмотр
  if (onlyOnline && view === 'grid') list = list.filter(m => !!m.link);
  // 🙈 «Скрыть разгаданные»: прячем карточки, код которых есть в localStorage
  if (localStorage.getItem(HIDE_KEY) === '1' && view !== 'fav') {
    const unlockedSet = new Set(getUnlocked());
    if (unlockedSet.size) list = list.filter(m => !unlockedSet.has(String(m.code)));
  }
    if (q && !smart) {
    const digits = q.replace(/\D/g, '');
    const isCode = /^\d+$/.test(q.replace(/\s+/g, ''));  // весь запрос — число → это код
    // Сначала точные совпадения (все слова запроса в названии/описании или код),
    // затем раскладка, затем нечёткий поиск по Левенштейну («интерстелар» найдёт «Интерстеллар»).
    const norm = (t) => (t || '').toLowerCase().replace(/ё/g, 'е');
    const toks = q.split(/\s+/).filter(Boolean);
    let matches = [];
    const tryQuery = (query) => {
      const tks = query.split(/\s+/).filter(Boolean);
      list.forEach(m => {
        const t = norm(m._raw || m.title);
        // «стог сена»: название + описание + жанры + страны + год + люди
        const hay = norm([t, m.description, (m.genres || []).join(' '),
          (m.countries || []).join(' '), m.year || '', m.director || '',
          (m.actors || []).join(' ')].filter(Boolean).join(' · '));
        const codeHit = isCode && digits && String(m.code || '').includes(digits);
        // все слова запроса должны найтись (в любом поле) — так «зеленая миля 1999»
        // и «торино гран» работают независимо от порядка слов
        if (codeHit || (tks.length && tks.every(w => hay.includes(w)))) {
          if (!matches.some(x => x.m === m)) matches.push({ m, score: 0 });
        }
      });
    };
    tryQuery(q);
    if (!matches.length && /[a-z]/.test(q)) {
      // 2-й эшелон: неправильная раскладка клавиатуры — «ptktyfz» → «зеленая»
      const RU_LAYOUT = { q:'й', w:'ц', e:'у', r:'к', t:'е', y:'н', u:'г', i:'ш', o:'щ', p:'з',
        a:'ф', s:'ы', d:'в', f:'а', g:'п', h:'р', j:'о', k:'л', l:'д', z:'я', x:'ч', c:'с',
        v:'м', b:'и', n:'т', m:'ь', '[':'х', ']':'ъ', ';':'ж', "'":'э', ',':'б', '.':'ю' };
      const qRu = q.replace(/[a-z\[\];',.]/g, ch => RU_LAYOUT[ch] || ch);
      if (qRu && qRu !== q) tryQuery(qRu);
    }
    if (!matches.length) {
      const limit = q.length <= 6 ? 2 : (q.length <= 12 ? 3 : 4);
      list.forEach(m => {
        const t = norm(m.title);
        const d = _levDist(q, t);
        if (d <= limit && d <= Math.max(2, Math.floor(t.length * 0.3))) {
          matches.push({ m, score: d });
        }
      });
      matches.sort((a, b) => a.score - b.score);
    }
    list = matches.map(x => x.m);
  }
  // Умный фильтр: применяем разобранные из фразы директивы напрямую
  if (smart) {
    list = [...ALL];
    if (smart.genre) list = list.filter(m => (m.genres || []).some(g => String(g).toLowerCase() === smart.genre));
    if (smart.minRating != null) list = list.filter(m => (parseFloat(m.rating) || 0) >= smart.minRating);
    if (smart.decade) list = list.filter(m => m.year >= smart.decade && m.year < smart.decade + 10);
    if (smart.year) list = list.filter(m => String(m.year) === String(smart.year));
    if (smart.maxMin) list = list.filter(m => !m.duration || m.duration <= smart.maxMin);
    if (smart.minDurMin) list = list.filter(m => !m.duration || m.duration >= smart.minDurMin);
  }
  list.sort((a, b) => {
    if (sort === 'rating') return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
    if (sort === 'code') return (+a.code || 0) - (+b.code || 0);
    if (sort === 'new') {
      const da = new Date(a.added_at || 0).getTime();
      const db = new Date(b.added_at || 0).getTime();
      return db - da;
    }
    // v92: «⭐ По моей оценке» — сначала твои 5★→1★, потом неоценённые
    if (sort === 'myrating') {
      const ra = getRatings()[String(a.code)] || 0;
      const rb = getRatings()[String(b.code)] || 0;
      if (ra !== rb) return (rb - ra);
      return (a.title || '').localeCompare(b.title || '', 'ru');
    }
    return (a.title || '').localeCompare(b.title || '', 'ru');
  });
  // v92: кнопка «🧹 Сбросить фильтры» — видна, когда активен хоть один фильтр
  const anyFilter = !!(qRaw || activeGenre || activeMood || activeCountry || timeLimit || onlyTrailer || onlyOnline);
  const clearBtn = anyFilter
    ? `<button class="btn-clear-filters" id="btn-clear-filters" title="Сбросить все фильтры">🧹 Сбросить фильтры</button>`
    : '';
  const c = document.getElementById('movies-container');
  // v71: во время поиска прячем полки главной (тренды, премьеры, «Советуем», фильм дня),
  // чтобы результаты или «Ничего не нашлось» были сразу под строкой поиска, а не
  // глубоко внизу страницы. При очистке запроса полки возвращаются сами.
  const searching = view === 'grid' && !!(qRaw || activeGenre);
  ['hero-shelf', 'today-shelf', 'new-codes-shelf', 'recent-shelf', 'reco-shelf', 'premieres-shelf'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const row = el.querySelector('.hero-row');
    el.classList.toggle('hidden', searching || !row || !row.children.length);
  });
  const fdBan = document.getElementById('filmday-banner');
  if (fdBan) fdBan.classList.toggle('hidden', searching || !fdBan.innerHTML.trim());
  // Переключатель «Моё»: ❤️ хочу посмотреть / ✅ разгаданные / 👁 я смотрел + прогресс
  const modeSwitch = view === 'fav' ? `<div class="fav-mode">
      <button class="fav-mode-btn ${favMode === 'fav' ? 'active' : ''}" data-mode="fav">❤️ Хочу</button>
      <button class="fav-mode-btn ${favMode === 'done' ? 'active' : ''}" data-mode="done">✅ Разгадал</button>
      <button class="fav-mode-btn ${favMode === 'watched' ? 'active' : ''}" data-mode="watched">👁 Смотрел</button>
      <button class="fav-mode-btn ${favMode === 'rated' ? 'active' : ''}" data-mode="rated">⭐ Оценки</button>
    </div>` : '';
  const progressLine = (view === 'fav' && favMode === 'done')
    ? `<div class="fav-progress">Разгадано ${unlockedAll.length} из ${ALL.length} (${ALL.length ? Math.round(100 * unlockedAll.length / ALL.length) : 0}%)</div>`
    : (view === 'fav' && favMode === 'watched')
    ? `<div class="fav-progress">Просмотрено ${watchedAll.length} из ${ALL.length} (${ALL.length ? Math.round(100 * watchedAll.length / ALL.length) : 0}%)</div>`
    : (view === 'fav' && favMode === 'rated')
    ? `<div class="fav-progress">Оценено ${plFilms(Object.keys(getRatings()).length)} — рекомендации стали точнее 💫</div>`
    : '';
  const smartHint = smart
    ? `<div class="smart-hint">🧠 ${esc((smart.parts || []).join(' · '))} · найдено: ${list.length}<button class="smart-clear" title="Сбросить" onclick="document.getElementById('search').value='';renderGrid()">✕</button></div>`
    : '';
  const head = (view === 'grid'
    ? `<div class="layout-switch"><span class="ls-label">Вид:</span>
        <button class="ls-btn${gridLayout === 'grid' ? ' active' : ''}" data-l="grid">▦ Сетка</button>
        <button class="ls-btn${gridLayout === 'list' ? ' active' : ''}" data-l="list">☰ Список</button>
      </div>`
    : '')
    + modeSwitch + progressLine + smartHint + clearBtn
    // v75: полоску «просмотрено» показываем только когда есть хоть одна отметка —
    // «0 из 71» выглядело как баг и занимало место
    + (view === 'grid' && !searching && ALL.length && watchedAll.length > 0
      ? `<div class="seen-bar"><span>👁 Отмечено просмотренными: ${watchedAll.length} из ${ALL.length}</span><span class="seen-track"><i style="width:${Math.round(100 * watchedAll.length / ALL.length)}%"></i></span></div>`
      : '')
    // v126: прогресс «разгадано кодов» — главная цель афиши (механика канала).
    // В отличие от «просмотрено», показываем ВСЕГДА (даже с 0): «0 из 85 — собери
    // всё» мотивирует новичка и даёт причину возвращаться. Тот же CSS, что у
    // «просмотрено», — единый вид без новых стилей.
    + (view === 'grid' && !searching && ALL.length
      ? (() => {
          const done = ALL.filter(m => unlockedAll.includes(String(m.code))).length;
          const left = ALL.length - done;
          const pct = Math.round(100 * done / ALL.length);
          const hint = left > 0 ? ` · осталось ${left}` : ' · всё собрано! 🏆';
          return `<div class="seen-bar"><span>🎬 Разгадано кодов: ${done} из ${ALL.length}${hint}</span><span class="seen-track"><i style="width:${pct}%"></i></span></div>`;
        })()
      : '');
  const wireFavMode = () => {
    c.querySelectorAll('.fav-mode-btn').forEach(b => b.addEventListener('click', () => {
      try { localStorage.setItem(FAV_MODE_KEY, b.dataset.mode); } catch (e) {}
      haptic('light');
      renderGrid();
    }));
  };
  if (!list.length) {
    // v124: чипы и «Сбросить» нужны как раз при нулевом результате — раньше
    // строка пряталась вместе с ними, и выйти из тупика фильтра можно было
    // только наугад (или кнопкой «Мне повезёт»).
    renderFilterBar(0, 0);
    const emptyEmoji = view === 'fav' ? (favMode === 'done' ? '🔒' : favMode === 'watched' ? '👁' : favMode === 'rated' ? '⭐' : '🤍') : '🔍';
    const emptyText = view === 'fav'
      ? (favMode === 'done'
          ? 'Тут пока тихо. Лови коды в канале — Капитан будет ждать 🔑'
          : (favMode === 'watched'
              ? 'Ни одного просмотренного. Посмотрел фильм — жми «👁» на карточке 🍿'
              : (favMode === 'rated'
                  ? 'Оценок ещё нет. Открой любой фильм и поставь ему звёзды ⭐'
                  : 'Список пуст, Капитан скучает. Жми ❤️ на любом фильме — и он оживёт')))
      : 'Капитан обшарил всю афишу — такого нет 🤷 Попробуй другое слово или жанр';
    // v74: даже при пустом «Моём» показываем карточку с бэкапом/восстановлением
    const backupEmpty = (view === 'fav' && (favMode || 'fav') === 'fav') ? backupFavsNotice() : '';
    c.innerHTML = head + backupEmpty + `<div class="empty-state">
      <div class="empty-emoji">${emptyEmoji}</div>
      <p>${emptyText}</p>
      <button class="btn-secondary" id="btn-empty-lucky">🎲 Мне повезёт</button>
    </div>` + (view === 'grid' ? freshLineHtml() : '');
    wireFavMode();
    const cbE = document.getElementById('btn-copy-backup');
    if (cbE) cbE.onclick = copyBackup;
    const spE = document.getElementById('btn-share-posters');
    if (spE) spE.onclick = shareFavsPoster;
    const ibE = document.getElementById('btn-import-backup');
    if (ibE) ibE.onclick = importBackup;
    const rbE = document.getElementById('btn-restore-bot');
    if (rbE) rbE.onclick = () => sendOrDeepLink({ action: 'restore_backup' });
    const el = document.getElementById('btn-empty-lucky');
    if (el) el.onclick = () => {
      if (!ALL.length) return;
      haptic('light');
      const m = ALL[Math.floor(Math.random() * ALL.length)];
      openDetail(m.code);
    };
    return;
  }
  const backup = (view === 'fav' && (favMode || 'fav') === 'fav') ? backupFavsNotice() : '';
  // v93: виртуализация афиши — рисуем только текущую страницу (по 30),
  // кнопка «Показать ещё» появляется, когда за границей остались фильмы.
  const gridClipped = (view === 'grid') && list.length > GRID_PAGE_SIZE;
  const visible = gridClipped ? list.slice(0, gridPage * GRID_PAGE_SIZE) : list;
  const showMoreBtn = gridClipped && visible.length < list.length
    ? `<button class="btn-show-more" id="btn-show-more">🎞 Показать ещё (${list.length - visible.length})</button>`
    : '';
  // v123: липкая строка «что включено» — над гридом, но под табами
  renderFilterBar(list.length, visible.length);
  c.innerHTML = head + backup + (gridLayout === 'list'
    ? visible.map(m => listRowHtml(m, q)).join('')
    : visible.map(m => {
    const myR = (view === 'fav' && favMode === 'rated') ? (getRatings()[String(m.code)] || 0) : 0;
    return `
    <div class="movie-card${(view === 'fav' && (favMode || 'fav') === 'fav' && getFavs().includes(String(m.code))) ? ' card-fav' : ''}" data-code="${esc(m.code)}">
      ${posterHtmlQuick(m)}
      <div class="movie-info">
        <h3>${hlTitle(m.title, q)}</h3>
        <span class="rating">${ratingBadge(m)}${myR ? `<span class="my-stars">${'★'.repeat(myR)}</span>` : ''}${durOf(m) ? `<span class="dur-chip">⏱ ${durOf(m)} мин</span>` : ''}</span>
      </div>
    </div>`;
  }).join('')) + showMoreBtn + (view === 'grid' ? freshLineHtml() : '');
  const b = document.getElementById('btn-backup');
  if (b) b.onclick = () => sendOrDeepLink({ action: 'save_favs', codes: getFavs() });
  const bc = document.getElementById('btn-copy-list');
  if (bc) bc.onclick = copyFavsList;
  const sp2 = document.getElementById('btn-share-posters');
  if (sp2) sp2.onclick = shareFavsPoster;
  const cb2 = document.getElementById('btn-copy-backup');
  if (cb2) cb2.onclick = copyBackup;
  const ib2 = document.getElementById('btn-import-backup');
  if (ib2) ib2.onclick = importBackup;
  const rb2 = document.getElementById('btn-restore-bot');
  if (rb2) rb2.onclick = () => sendOrDeepLink({ action: 'restore_backup' });
  // v101: «🧹 Очистить „Хочу посмотреть“» — с подтверждением, очищает только список ❤️
  const clr = document.getElementById('btn-clear-fav');
  if (clr) clr.onclick = () => {
    const n = getFavs().length;
    if (!n) return;
    try {
      const confirm = tg.showConfirm || tg.showPopup;
      confirm('Очистить список «Хочу посмотреть»?',
        (ok) => {
          if (ok) { setFavs([]); haptic('ok'); renderGrid(); renderRecoShelf(); }
        });
    } catch (e) { setFavs([]); renderGrid(); }
  };
  wireFavMode();
  // каскадное появление карточек
  Array.from(c.children).forEach((el, i) => {
    el.style.animationDelay = (Math.min(i, 24) * 0.03) + 's';
  });
  c.querySelectorAll('.movie-card').forEach(el =>
    el.addEventListener('click', () => openDetail(el.dataset.code)));
  // v94: переключатель «Сетка/Список» — режим сохраняется на устройство
  c.querySelectorAll('.ls-btn').forEach(b => b.addEventListener('click', () => {
    gridLayout = b.dataset.l === 'list' ? 'list' : 'grid';
    try { localStorage.setItem(LAYOUT_KEY, gridLayout); } catch (e) {}
    haptic('light');
    renderGrid();
  }));
  // v94: строки списка кликабельны (кнопки внутри не перехватываем)
  c.querySelectorAll('.movie-row').forEach(el => el.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openDetail(el.dataset.code);
  }));
  // v92: сброс всех фильтров одной кнопкой
  const cf = document.getElementById('btn-clear-filters');
  if (cf) cf.onclick = () => {
    resetFilters();                     // v123: общая точка сброса (та же, что у липкой строки)
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // v93: «Показать ещё» — добавляем следующую порцию карточек
  const sm = document.getElementById('btn-show-more');
  if (sm) sm.onclick = () => {
    haptic('light');
    gridPage++;
    renderGrid();
  };
  wireFavQuick(c);
}
// ---------- карточка фильма ----------
let detailOrigin = 'grid';  // откуда открыт фильм — для кнопки «◀️ Назад»
function openDetail(code) {
  const m = ALL.find(x => x.code === code);
  if (!m) return;
  track('movie', code);
  bumpWeekStat('open');
  addRecent(m.code);
  const openN = bumpOpenCount(code);   // v93: счётчик открытий карточки
  challDone('open_movie');
  if (view && view !== 'detail') detailOrigin = view;
  rememberScroll();   // v124: запомнить, где афиша стояла — вернёмся туда же
  view = 'detail';
  showView('detail');
  const fav = getFavs().includes(code);
  const similar = findSimilar(m);
  // Чипы метаданных (год/длительность/страны) + кликабельные жанры:
  // тап по жанру-чипу фильтрует афишу этим жанром.
  const chips = [
    m.year ? `<span class="chip chip-dim">📅 ${esc(m.year)}</span>` : '',
    m.duration ? `<span class="chip chip-dim">⏱ ${esc(fmtDuration(m.duration))}</span>` : '',
    ...(m.countries || []).slice(0, 2).map(ct => `<span class="chip chip-dim">${flagOf(ct)} ${esc(ct)}</span>`),
    ...(m.genres || []).map(g =>
      `<button class="chip chip-genre${activeGenre === g ? ' active' : ''}" data-g="${esc(g)}" title="Фильмы этого жанра">${esc(g)}</button>`),
  ].filter(Boolean).join('');
  const prem = premiereForTitle(m.title);  // v119: фильм скоро в кино?
  document.getElementById('view-detail').innerHTML = `
    <button class="btn-back" id="btn-back">◀️ Назад</button>
    <div class="detail">
      ${posterHtml(m)}
      <div class="detail-info">
        <h2>${esc(m.title)}</h2>
        <span class="rating">${ratingBadge(m)}</span>
        ${prem ? `<p class="premiere-note">🍿 В кино с ${prem.date} — ${prem.human}!</p>` : ''}
        ${(() => {
          const myR = myRating(code);
          const stars = [1, 2, 3, 4, 5].map(i =>
            `<button class="star-btn${i <= myR ? ' on' : ''}" data-v="${i}" data-code="${esc(code)}" title="${i} из 5">★</button>`).join('');
          return `<div class="rate-strip">
            <span class="rate-label">${myR ? 'Твоя оценка:' : 'Оцени фильм:'}</span>
            <span class="rate-stars">${stars}</span>
            ${myR ? `<button class="rate-clear" data-code="${esc(code)}" title="Убрать оценку">✕</button>` : ''}
            ${myR && m.rating ? `<span class="rate-cmp" title="Сравнение с рейтингом Кинопоиска">⚖️ КП ${esc(String(m.rating))} · твоя ${myR}/5${(myR / 5) * 10 >= parseFloat(m.rating) ? ' · 🔥 не хуже КП' : ''}</span>` : ''}
          </div>`;
        })()}
        ${chips ? `<div class="detail-chips">${chips}</div>` : ''}
        ${m.director ? `<p class="people-line">🎬 Режиссёр: <b class="person-chip" data-q="${esc(m.director)}" title="Найти фильмы">${esc(m.director)}</b></p>` : ''}
        ${(m.actors || []).length ? `<p class="people-line">⭐ В ролях: ${m.actors.slice(0, 4).map(a => `<b class="person-chip" data-q="${esc(a)}" title="Найти фильмы">${esc(a)}</b>`).join(', ')}</p>` : ''}
        <p class="desc">${esc(m.description || 'Описание скоро появится.')}</p>
        ${openN > 1 ? `<p class="open-count">👀 Открывал(а) ${openN} раз(а)</p>` : (openN === 1 ? '<p class="open-count">👀 Впервые открыл(а) — как тебе?</p>' : '')}
        ${getNotes()[code] ? `<div class="note-box">📝 ${esc(getNotes()[code])}</div>` : ''}
        <div class="detail-actions">
          ${(m.link || cleanKpTitle(m.title)) ? '<button class="btn-watch" id="btn-watch">' + (m.link ? '▶️ Смотреть фильм' : '🍿 Где посмотреть') + '</button>' : ''}
          ${m.link2 ? '<button class="btn-secondary" id="btn-mirror">🔗 Зеркало</button>' : ''}
          <button class="btn-primary" id="btn-open">🔓 Открыть код</button>
          ${m.trailer_mp4 || m.trailer_yt || m.trailer_file_id ? '<button class="btn-secondary" id="btn-trailer">▶️ Трейлер</button>' : ''}
          <button class="btn-fav ${fav ? 'active' : ''}" id="btn-fav">${fav ? '❤️ В «Моём»' : '🤍 Хочу'}</button>
          <button class="btn-secondary ${getWatched().includes(String(code)) ? 'active watched-btn' : 'watched-btn'}" id="btn-watched">${getWatched().includes(String(code)) ? '👁 Смотрел' : '👁 Смотрел?'}</button>
          <button class="btn-secondary" id="btn-share">📤 Другу</button>
          <button class="btn-secondary" id="btn-more">⋯</button>
          <div class="more-actions" id="more-actions" hidden>
          <button class="btn-secondary" id="btn-note">📝 ${getNotes()[code] ? 'Заметка есть' : 'Заметка'}</button>
          <button class="btn-secondary" id="btn-copy">📎 Скопировать код</button>
          <button class="btn-secondary" id="btn-riddle">🎭 Загадать другу</button>
          <button class="btn-secondary" id="btn-riddle-reveal-share">🎭 Загадать с ответом</button>
          <button class="btn-secondary" id="btn-review">✍️ Отзыв</button>
          <button class="btn-secondary" id="btn-remind">🔔 Напомнить через час</button>
          ${prem && prem.fid ? '<button class="btn-secondary" id="btn-prem-remind">💌 Напомнить о премьере</button>' : ''}
          ${cleanKpTitle(m.title) ? '<button class="btn-secondary" id="btn-kp">⭐ IMDB</button>' : ''}
          <button class="btn-secondary" id="btn-sharecard">🖼 Карточка</button>
          </div>
        </div>
      </div>
    </div>
    ${similar.length ? `
    <div class="similar-section">
      <h3 class="similar-title">🎬 Похожие фильмы</h3>
      <div class="similar-row">
        ${similar.map(s => `
          <div class="similar-card" data-code="${esc(s.code)}">
            <div class="similar-poster">
              ${s.poster
                ? `<img src="${esc(s.poster)}" alt="${esc(s.title)}" loading="lazy" ${FADE}${dimStyle(s)} onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>`
                : `<div class="poster-placeholder similar-ph"><span>🎬</span></div>`}
            </div>
            <div class="similar-name">${esc(s.title)}</div>
            ${SIM_WHY[s.code] ? `<div class="similar-why">${esc(SIM_WHY[s.code])}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>` : ''}`;
  document.getElementById('btn-back').onclick = () => openView(detailOrigin || 'grid');
  // v90: тап по постеру в карточке — лайтбокс на весь экран
  const dPw = document.querySelector('#view-detail .poster-wrap');
  if (dPw) {
    dPw.classList.add('zoomable');
    dPw.addEventListener('click', (e) => {
      const img = dPw.querySelector('img');
      const lb = document.getElementById('lightbox');
      if (!img || !lb) return;
      e.stopPropagation();
      haptic('light');
      lb.querySelector('img').src = img.src;
      lb.classList.remove('hidden');
    });
  }
  document.getElementById('btn-open').onclick =
    () => sendOrDeepLink({ action: 'open_movie', code });
  const watchBtn = document.getElementById('btn-watch');
  if (watchBtn) watchBtn.onclick = () => openWatchLink(m);
  const mirrorBtn = document.getElementById('btn-mirror');
  if (mirrorBtn) mirrorBtn.onclick = () => openUrlLink(m.link2);
  const kpBtn = document.getElementById('btn-kp');
  if (kpBtn) kpBtn.onclick = () => openImdbLink(m);
  // v64: оценка звёздами прямо в карточке (локально) + «Загадать другу»
  document.querySelectorAll('#view-detail .star-btn').forEach(b =>
    b.addEventListener('click', () => { setRating(b.dataset.code, parseInt(b.dataset.v, 10)); openDetail(code); }));
  const rateClear = document.querySelector('#view-detail .rate-clear');
  if (rateClear) rateClear.addEventListener('click', () => { removeRating(rateClear.dataset.code); openDetail(code); });
  const riddleBtn = document.getElementById('btn-riddle');
  if (riddleBtn) riddleBtn.onclick = () => shareRiddle(m);
  const riddleRevBtn = document.getElementById('btn-riddle-reveal-share');
  if (riddleRevBtn) riddleRevBtn.onclick = () => shareRiddleReveal(m);
  document.getElementById('btn-fav').onclick = () => { toggleFav(code); openDetail(code); };
  document.getElementById('btn-watched').onclick = () => { toggleWatched(String(code)); openDetail(code); };
  document.getElementById('btn-note').onclick = () => {
    const current = getNotes()[code] || '';
    tg.showPopup({
      type: 'prompt',
      title: '📝 Заметка о фильме',
      message: 'Короткая заметка сохранится на этом устройстве.',
      placeholder: current,
      text: current,
      callback: (btnId, value) => {
        if (btnId === 'ok') {
          setNote(code, value || '');
          haptic('ok');
          openDetail(code);
        }
      }
    });
  };
  document.getElementById('btn-copy').onclick = () => {
    const done = () => {
      try { tg.HapticFeedback.impactOccurred('light'); } catch (e) {}
      tg.showPopup({
        type: 'ok',
        title: 'Код скопирован',
        message: `Код ${code} отправь боту @kapitan_kino_bot — и фильм откроется!`
      });
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(done);
    } else done();
  };
  document.getElementById('btn-remind').onclick = () =>
    sendOrDeepLink({ action: 'remind_movie', code });
  // v120: «💌 Напомнить о премьере» — бот пришлёт ЛС за день до релиза
  const premRemindBtn = document.getElementById('btn-prem-remind');
  if (premRemindBtn) premRemindBtn.onclick = () =>
    sendOrDeepLink({ action: 'remind_premiere', iso: prem.iso, fid: prem.fid });
  const moreBtn = document.getElementById('btn-more');
  if (moreBtn) moreBtn.onclick = () => {
    const box = document.getElementById('more-actions');
    if (!box) return;
    box.hidden = !box.hidden;
    moreBtn.textContent = box.hidden ? '⋯' : '✕';
  };
  const trailerBtn = document.getElementById('btn-trailer');
  if (trailerBtn) trailerBtn.onclick = () => openTrailer(m);
  document.getElementById('btn-review').onclick = () => {
    // Не «выкидываем» человека в бота вслепую: предупреждаем, что бот попросит
    // текст отзыва, и как из этого режима выйти (кнопка «❌ Отмена» / слово «отмена»).
    haptic('light');
    const reviewTitle = cleanKpTitle(m.title) || m.title || 'фильму';
    try {
      tg.showPopup({
        title: '✍️ Отзыв о фильме',
        message: `Бот попросит написать отзыв о «${reviewTitle}» одним сообщением.\n\nВыйти из режима можно кнопкой «❌ Отмена» у сообщения бота или словом «отмена» — отзыв не сохранится.`,
        buttons: [
          { id: 'go', type: 'default', text: '✍️ Открыть бота' },
          { id: 'no', type: 'cancel', text: 'Не сейчас' },
        ],
        callback: (btnId) => {
          if (btnId === 'go') sendOrDeepLink({ action: 'review_movie', code });
        },
      });
    } catch (e) {
      sendOrDeepLink({ action: 'review_movie', code });
    }
  };
  document.getElementById('btn-share').onclick = () => shareMovie(m);
  const scBtn = document.getElementById('btn-sharecard');
  if (scBtn) scBtn.onclick = () => openShareCard(m);
  // Тап по похожему фильму → открываем его карточку
  document.querySelectorAll('#view-detail .similar-card').forEach(el => {
    el.addEventListener('click', () => {
      haptic('light');
      openDetail(el.dataset.code);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  // Тап по жанровому чипу → афиша, отфильтрованная этим жанром
  document.querySelectorAll('#view-detail .chip-genre').forEach(ch => {
    ch.addEventListener('click', () => {
      haptic('light');
      activeGenre = ch.dataset.g || '';
      view = 'grid';
      showView('catalog');
      renderGenreChips();
      renderGrid();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  // Тап по актёру/режиссёру → афиша с поиском по нему (поиск ищет и по составу)
  document.querySelectorAll('#view-detail .person-chip').forEach(ch => {
    ch.addEventListener('click', () => {
      const q = ch.dataset.q || '';
      if (!q) return;
      haptic('light');
      const si = document.getElementById('search');
      if (si) si.value = q;
      addSearchHist(q);
      activeGenre = '';
      view = 'grid';
      showView('catalog');
      renderGenreChips();
      renderGrid();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

const SIM_WHY = {};
function findSimilar(m) {
  // Похожие фильмы: совпадение жанров > года > рейтинга. Максимум 6 карточек.
  const mGenres = new Set(m.genres || []);
  const scored = ALL.filter(x => x.code !== m.code).map(x => {
    const xGenres = new Set(x.genres || []);
    let score = 0;
    mGenres.forEach(g => { if (xGenres.has(g)) score += 3; });
    if (x.year && m.year && Math.abs(x.year - m.year) <= 3) score += 2;
    if (x.year && m.year && x.year === m.year) score += 1;
    const shared = (x.genres || []).filter(g => mGenres.has(g));
    const sameCountry = (x.countries || []).some(c => (m.countries || []).includes(c));
    if (sameCountry) score += 1.5;
    const d1 = durOf(m), d2 = durOf(x);
    if (d1 && d2 && Math.abs(d1 - d2) <= 15) score += 1;
    score += Math.min(parseFloat(x.rating) || 0, 10) / 5;
    let why = shared.slice(0, 2).join(' · ');
    if (!why && sameCountry) why = (x.countries || [])[0] || '';
    if (!why && x.year && m.year && Math.abs(x.year - m.year) <= 3) why = x.year + ' год';
    SIM_WHY[x.code] = why;
    return { movie: x, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map(x => x.movie);
}

// ---------- тренажёр ----------
const GAME_ROUNDS = 5;
let game = null;

const shuffle = a => a.sort(() => Math.random() - 0.5);

function startGame() {
  const withPosters = ALL.filter(m => m.poster);
  if (withPosters.length < 6) {
    document.getElementById('view-game').innerHTML =
      '<p class="error">Нужно минимум 6 фильмов с постерами 🎬</p>';
    return;
  }
  const rounds = shuffle([...withPosters]).slice(0, GAME_ROUNDS).map(m => {
    const wrong = shuffle(ALL.filter(x => x.code !== m.code)).slice(0, 3).map(x => x.title);
    return { movie: m, options: shuffle([m.title, ...wrong]) };
  });
  game = { rounds, i: 0, correct: 0 };
  renderRound();
}

function renderRound() {
  const r = game.rounds[game.i];
  if (!r) return renderGameEnd();
  document.getElementById('view-game').innerHTML = `
    <div class="game">
      <div class="game-progress">Раунд ${game.i + 1} / ${game.rounds.length} · Угадано: ${game.correct}</div>
      <div class="game-poster" id="game-poster">
        <img src="${esc(r.movie.poster)}" alt="Угадай фильм" style="filter: blur(14px)"/>
      </div>
      <div class="game-options">
        ${r.options.map(t => `<button class="btn-option" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <button class="btn-back" id="btn-game-back">◀️ Выйти</button>
    </div>`;
  document.getElementById('btn-game-back').onclick = () => { view = 'grid'; showView('catalog'); renderGrid(); };
  document.querySelectorAll('.btn-option').forEach(b =>
    b.addEventListener('click', () => answerRound(b, r.movie)));
}

function answerRound(btn, movie) {
  const right = btn.dataset.t === movie.title;
  if (right) game.correct++;
  haptic(right ? 'ok' : 'error');
  btn.classList.add(right ? 'correct' : 'wrong');
  document.querySelectorAll('.btn-option').forEach(b => b.disabled = true);
  const img = document.querySelector('#game-poster img');
  if (img) img.style.filter = 'none';
  document.querySelector('.game-poster').insertAdjacentHTML('beforeend',
    `<div class="game-reveal">${right ? '✅ Верно!' : `❌ Это «${esc(movie.title)}»`}</div>`);
  setTimeout(() => { game.i++; renderRound(); }, 1600);
}

function renderGameEnd() {
  const { correct, rounds } = game;
  document.getElementById('view-game').innerHTML = `
    <div class="game">
      <div class="game-end">
        <h2>${correct === rounds.length ? '🏆 Отличная память!' : correct >= 3 ? '👍 Неплохо!' : '🎬 Потренируемся ещё?'}</h2>
        <p class="game-score">Угадано ${correct} из ${rounds.length}</p>
        <button class="btn-primary" id="btn-send-score">💰 Получить баллы в боте</button>
        <button class="btn-secondary" id="btn-again">🔁 Ещё раз</button>
        <button class="btn-back" id="btn-game-back2">◀️ К афише</button>
      </div>
    </div>`;
  document.getElementById('btn-send-score').onclick = () =>
    sendOrDeepLink({ action: 'quiz_result', correct, total: rounds.length });
  document.getElementById('btn-again').onclick = startGame;
  document.getElementById('btn-game-back2').onclick = () => { view = 'grid'; showView('catalog'); renderGrid(); };
}

// ---------- v106: меню игр + «Угадай по кадру» ----------
// Раздел «🏋 Тренажёр» теперь открывается меню с тремя режимами:
// постер (классика), кадр из трейлера (новое), эмодзи-загадки.
function renderGameMenu() {
  const emojiReady = !!document.getElementById('view-emoji');
  const modes = [
    ['btn-gm-arena', '⚔️', 'Кино-арена', 'дуэли знаний на 3 жизни · дуэль дня', true],
    ['btn-gm-poster', '🖼', 'Угадай по постеру', 'постер проясняется — угадай фильм'],
    ['btn-gm-frame', '🎞', 'Угадай по кадру', 'настоящий кадр из трейлера'],
  ];
  if (emojiReady) modes.push(['btn-gm-emoji', '😀', 'Угадай по эмодзи', 'расшифруй фильм по смайлам']);
  document.getElementById('view-game').innerHTML = `
    <div class="game">
      <div class="gm-menu">
        <h2>🏋 Тренажёр</h2>
        <p class="gm-sub">Выбирай, как тренировать киноглаз</p>
        ${modes.map(([id, ico, t, sub, hot]) => `<button class="gm-mode${hot ? ' hot' : ''}" id="${id}"><span class="gm-ico">${ico}</span><span class="gm-txt"><b>${t}</b><i>${sub}</i></span><span class="gm-go">›</span></button>`).join('')}
        <button class="btn-back" id="btn-gm-back">◀️ К афише</button>
      </div>
    </div>`;
  const ga = document.getElementById('btn-gm-arena');
  if (ga) ga.onclick = () => { haptic('light'); openArena(); };
  document.getElementById('btn-gm-poster').onclick = startGame;
  document.getElementById('btn-gm-frame').onclick = startFrameGame;
  const ge = document.getElementById('btn-gm-emoji');
  if (ge) ge.onclick = () => {
    // эмодзи-загадки показываются в своём контейнере (оба видны на view-game)
    document.getElementById('view-game').innerHTML = '';
    renderEmojiGame();
  };
  document.getElementById('btn-gm-back').onclick = () => { view = 'grid'; showView('catalog'); renderGrid(); };
}

// «Угадай по кадру»: показываем РЕАЛЬНЫЙ кадр из трейлера.
// Приоритет: frame_pic (локальный кадр из frames/, собран из hq1/hq2/hq3 —
// сцены без титульных заставок) → онлайн hq1/hq2/hq3 → никогда постер
// (постер содержит название фильма — игра теряет смысл).
let frameGame = null;
const frameThumb = (m) => {
  if (m.frame_pic) return m.frame_pic;
  if (m.trailer_yt) {
    const v = ['hq1', 'hq2', 'hq3'][Math.floor(Math.random() * 3)];
    return 'https://i.ytimg.com/vi/' + m.trailer_yt + '/' + v + '.jpg';
  }
  return '';
};

function startFrameGame() {
  const pool = ALL.filter(m => frameThumb(m) && m.poster);
  if (pool.length < 6) {
    document.getElementById('view-game').innerHTML =
      '<p class="error">Нужно минимум 6 фильмов с кадрами 🎬</p>';
    return;
  }
  const rounds = shuffle(pool).slice(0, 5).map(m => {
    const wrong = shuffle(ALL.filter(x => x.code !== m.code)).slice(0, 3).map(x => x.title);
    return { movie: m, options: shuffle([m.title, ...wrong]) };
  });
  frameGame = { rounds, i: 0, correct: 0 };
  renderFrameRound();
}

function renderFrameRound() {
  const box = document.getElementById('view-game');
  const r = frameGame.rounds[frameGame.i];
  if (!r) return renderFrameEnd();
  box.innerHTML = `
    <div class="game">
      <div class="game-progress">🎞 Раунд ${frameGame.i + 1} / ${frameGame.rounds.length} · Угадано: ${frameGame.correct}</div>
      <div class="frame-question">
        <img src="${esc(frameThumb(r.movie))}" alt="Кадр из фильма" onerror="this.parentElement.classList.add('no-thumb')"/>
      </div>
      <div class="game-options">
        ${r.options.map(t => `<button class="btn-option" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <button class="btn-back" id="btn-frame-back">◀️ Выйти</button>
    </div>`;
  document.getElementById('btn-frame-back').onclick = () => renderGameMenu();
  box.querySelectorAll('.btn-option').forEach(b =>
    b.addEventListener('click', () => answerFrameRound(b, r.movie)));
}

function answerFrameRound(btn, movie) {
  const box = document.getElementById('view-game');
  const right = btn.dataset.t === movie.title;
  if (right) frameGame.correct++;
  haptic(right ? 'ok' : 'error');
  btn.classList.add(right ? 'correct' : 'wrong');
  box.querySelectorAll('.btn-option').forEach(b => b.disabled = true);
  box.querySelector('.frame-question').insertAdjacentHTML('beforeend',
    `<div class="game-reveal">${right ? '✅ Верно!' : `❌ Это «${esc(movie.title)}»`}</div>`);
  setTimeout(() => { frameGame.i++; renderFrameRound(); }, 1600);
}

function renderFrameEnd() {
  const { correct, rounds } = frameGame;
  document.getElementById('view-game').innerHTML = `
    <div class="game">
      <div class="game-end">
        <h2>${correct === rounds.length ? '🏆 Киносыщик!' : correct >= 3 ? '👍 Хороший глаз!' : '🎬 Тренируемся ещё?'}</h2>
        <p class="game-score">Угадано ${correct} из ${rounds.length} кадров</p>
        <button class="btn-primary" id="btn-fr-send">💰 Получить баллы в боте</button>
        <button class="btn-secondary" id="btn-fr-again">🔁 Ещё раз</button>
        <button class="btn-back" id="btn-fr-back">◀️ Меню игр</button>
      </div>
    </div>`;
  document.getElementById('btn-fr-send').onclick = () =>
    sendOrDeepLink({ action: 'quiz_result', correct, total: rounds.length });
  document.getElementById('btn-fr-again').onclick = startFrameGame;
  document.getElementById('btn-fr-back').onclick = () => { view = 'game'; showView('game'); renderGameMenu(); };
}

// ---------- v60: «🔗 Кино-путь» — цепочка человек → фильм → человек ----------
function buildPersonGraph() {
  const g = new Map();  // ключ (lowercase) -> { display, films:Set(коды) }
  ALL.forEach(m => {
    [...(m.actors || []), ...(m.director ? [m.director] : [])].forEach(p => {
      if (!p) return;
      const k = p.toLowerCase();
      if (!g.has(k)) g.set(k, { display: p, films: new Set() });
      g.get(k).films.add(String(m.code));
    });
  });
  return g;
}
function renderChain() {
  const c = document.getElementById('chain-container');
  if (!c) return;
  const filmRow = (film) => film
    ? `<div class="chain-film" data-code="${esc(film.code)}">${film.poster ? `<img src="${esc(film.poster)}" loading="lazy" alt=""/>` : '<div class="chain-ph">🎬</div>'}<span>${esc(film.title)}${film.year ? ' · ' + esc(String(film.year)) : ''}</span></div>`
    : '';
  const shell = (rows, hint) => `
    <button class="btn-back" id="btn-chain-back">◀️ Назад</button>
    <div class="chain-card">
      <h2>🔗 Кино-путь</h2>
      <p class="chain-hint">${esc(hint)}</p>
      <div class="chain-row">${rows}</div>
      <button class="btn-primary" id="btn-chain-new">🎲 Новый путь</button>
    </div>`;
  const empty = () => {
    c.innerHTML = `<div class="empty-state"><div class="empty-emoji">🔗</div><p>Пока маловато данных для цепочек — добавь фильмы в канал, и здесь появится «Кино-путь».</p></div>`;
  };

  const g = buildPersonGraph();
  const people = [...g.values()].filter(v => v.films.size >= 2);
  if (people.length >= 3) {
    // режим «человек — фильм — человек» (когда синк подтянул актёров)
    const used = new Set();
    const rows = [];
    let info = people[Math.floor(Math.random() * people.length)];
    for (let s = 0; s < 7; s++) {
      const films = [...info.films].filter(f => !used.has(f));
      if (!films.length) break;
      const pickCode = films[Math.floor(Math.random() * films.length)];   // v194: выбор один раз (раньше random считался для каждого фильма → film мог быть undefined)
      const film = ALL.find(x => String(x.code) === pickCode);
      if (!film) break;
      used.add(String(film.code));
      rows.push(`<div class="chain-step"><div class="chain-person">🎭 ${esc(info.display)}</div>${filmRow(film)}</div>`);
      const co = [...(film.actors || []), ...(film.director ? [film.director] : [])]
        .map(p => String(p).toLowerCase())
        .filter(k => g.has(k) && g.get(k).films.size >= 2 && g.get(k) !== info);
      if (!co.length) break;
      info = g.get(co[Math.floor(Math.random() * co.length)]);
    }
    if (rows.length < 2) { empty(); return; }
    c.innerHTML = shell(rows.join('<div class="chain-link">↔️</div>'),
      'Случайная цепочка «человек — фильм — человек» по базе канала. Тапни по фильму, чтобы открыть карточку.');
  } else {
    // режим «фильм — жанр — фильм»: работает сразу, на текущих данных без актёров
    const genreCount = new Map();
    ALL.forEach(m => (m.genres || []).forEach(gg => genreCount.set(gg, (genreCount.get(gg) || 0) + 1)));
    const rows = [];
    const used = new Set();
    let cur = ALL[Math.floor(Math.random() * ALL.length)];
    used.add(String(cur.code));
    rows.push(`<div class="chain-step">${filmRow(cur)}</div>`);
    for (let s = 0; s < 4; s++) {
      const gs = (cur.genres || []).filter(gg => genreCount.get(gg) >= 2);
      if (!gs.length) break;
      const gSel = gs[Math.floor(Math.random() * gs.length)];
      const nexts = ALL.filter(m => !used.has(String(m.code)) && (m.genres || []).includes(gSel));
      if (!nexts.length) break;
      const next = nexts[Math.floor(Math.random() * nexts.length)];
      used.add(String(next.code));
      rows.push(`<button class="chain-genre" data-g="${esc(gSel)}">🔗 ${esc(gSel)} <em>${genreCount.get(gSel)}</em></button>`);
      rows.push(`<div class="chain-step">${filmRow(next)}</div>`);
      cur = next;
    }
    if (rows.length < 3) { empty(); return; }
    c.innerHTML = shell(rows.join(''),
      'Цепочка «фильм — жанр — фильм» из твоей базы. Тапни по жанру — откроется подборка, по фильму — карточка.');
  }

  document.getElementById('btn-chain-back').onclick = () => openView('grid');
  document.getElementById('btn-chain-new').onclick = () => { haptic('light'); renderChain(); };
  c.querySelectorAll('.chain-film').forEach(el =>
    el.addEventListener('click', () => { haptic('light'); openDetail(el.dataset.code); }));
  c.querySelectorAll('.chain-genre').forEach(el =>
    el.addEventListener('click', () => {
      haptic('light');
      activeGenre = el.dataset.g || '';
      view = 'grid';
      showView('catalog');
      renderGenreChips();
      renderGrid();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
}

// ---------- вкладки и показ ----------
// v123: мягкий вход раздела. View Transitions API не берём осознанно: он снимает
// снапшот всей страницы, и sticky-табы на мобильных заметно «прыгают».
const VIEW_BOXES = {
  catalog: 'view-catalog', cols: 'view-cols', news: 'view-news', top: 'view-top',
  profile: 'view-profile', trailers: 'view-trailers', achievements: 'view-achievements',
  detail: 'view-detail', game: 'view-game', chain: 'view-chain', year: 'view-year',
  marathon: 'view-marathon', tinder: 'view-tinder', mycols: 'view-mycols',
  'mycol-detail': 'view-mycol-detail', tonight: 'view-tonight', quiz: 'view-quiz',
  play: 'view-play', mine: 'view-mine',
};
function _reduceMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
}
function animateViewIn(el) {
  if (!el || _reduceMotion()) return;
  el.classList.remove('view-enter');
  void el.offsetWidth;          // перезапуск анимации: иначе второй вход «молчит»
  el.classList.add('view-enter');
}
// v198: родная кнопка «назад» Telegram (в шапке) для вложенных экранов — выйти можно всегда, даже если кнопка внутри экрана не видна
const DEEP_VIEWS = ['tinder', 'marathon', 'chain', 'game', 'tonight', 'quiz', 'year'];
let _tgBackBound = false;
function syncTgBack(name) {
  const bb = tg && tg.BackButton; if (!bb || !bb.show) return;
  if (!_tgBackBound) { _tgBackBound = true; bb.onClick(() => { try { haptic('light'); } catch (e) {} view = 'play'; openView('play'); }); }
  if (DEEP_VIEWS.indexOf(name) >= 0) bb.show(); else bb.hide();
}
function showView(name) {
  // Null-safe: если webview отдал старый закэшированный index.html без новой
  // вьюхи (кэш-микс), отсутствие элемента не должно ронять весь интерфейс.
  const toggle = (id, on) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !on);
  };
  toggle('view-catalog', name === 'catalog');
  toggle('view-cols', name === 'cols');
  toggle('view-news', name === 'news');
  toggle('view-top', name === 'top');
  toggle('view-profile', name === 'profile');
  toggle('view-trailers', name === 'trailers');
  toggle('view-achievements', name === 'achievements');
  toggle('view-detail', name === 'detail');
  toggle('view-game', name === 'game');
  toggle('view-emoji', name === 'game');
  toggle('view-chain', name === 'chain');
  toggle('view-year', name === 'year');
  toggle('view-marathon', name === 'marathon');
  toggle('view-tinder', name === 'tinder');
  try { syncTgBack(name); } catch (e) {}
  toggle('view-tonight', name === 'tonight');
  toggle('view-quiz', name === 'quiz');
  toggle('view-mycols', name === 'mycols');          // v106
  toggle('view-map', name === 'map');                 // v176
  toggle('view-play', name === 'play');               // v183
  toggle('view-mine', name === 'mine');               // v183
  toggle('view-library', name === 'library');         // v177
  toggle('view-mycol-detail', name === 'mycol-detail');  // v106
  toggle('toolbar', name === 'catalog' || name === 'trailers');
  toggle('filter-bar', name === 'catalog');   // v123: строка фильтров — только у афиши
  if (name === 'catalog') renderFilmDay();  // баннер скрываем/возвращаем при смене вьюхи
  const cur = name === 'catalog' ? view : name;
  document.querySelectorAll('.tab[data-view]').forEach(t =>
    t.classList.toggle('active', t.dataset.view === cur));
  const moreTab = document.getElementById('tab-more');
  if (moreTab) moreTab.classList.toggle('active',
    ['cols', 'top', 'achievements', 'profile', 'fav', 'game', 'chain', 'year', 'tinder', 'mycols', 'tonight', 'quiz', 'map', 'library'].includes(cur));
  document.querySelectorAll('.more-item').forEach(b =>
    b.classList.toggle('active', b.dataset.view === cur));
  animateViewIn(document.getElementById(VIEW_BOXES[name] || ''));
  try { syncBottomNav(name); } catch (e) {}
}

// ---------- «🎴 Тиндер кино» — свайп-подбор ----------
// Вправо = «хочу посмотреть» (в Моё), вверх = «уже смотрю», влево = «мимо».
let _tinderQueue = [];   // фильмы в текущей сессии
let _tinderIdx = 0;      // текущая позиция
let _tinderPicks = [];   // коды отобранных (вправо)
function shuffleArr(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
function renderTinder() {
  const box = document.getElementById('tinder-container');
  if (!box) return;
  if (!ALL.length) { box.innerHTML = '<p class="empty-note">Загрузка базы…</p>'; return; }
  const seen = new Set(getWatched().map(String));
  const favs = new Set(getFavs());
  // Колода — все фильмы вперемешку; уже в Моё/просмотренные уходят в хвост.
  _tinderQueue = shuffleArr(ALL).sort((a, b) => {
    const pa = seen.has(String(a.code)) || favs.has(String(a.code)) ? 1 : 0;
    const pb = seen.has(String(b.code)) || favs.has(String(b.code)) ? 1 : 0;
    return pa - pb;
  });
  _tinderIdx = 0;
  _tinderPicks = [];
  drawTinderHead(box);
  drawTinderCard();
}
function drawTinderHead(box) {
  box.innerHTML = `
    <div class="tinder-head">
      <button class="btn-back" id="tinder-back">◀️ Назад</button>
      <h2>🎴 Тиндер кино</h2>
      <p class="tinder-hint">Свайпни вправо — «хочу посмотреть» · вверх — «смотрю» · влево — «мимо»</p>
      <span class="tinder-count" id="tinder-count"></span>
    </div>
    <div class="tinder-stage" id="tinder-stage">
      <div class="tinder-card" id="tinder-card"></div>
      <div class="tinder-actions">
        <button class="tinder-btn tinder-no" id="tinder-no" title="Мимо">✖️</button>
        <button class="tinder-btn tinder-yes" id="tinder-yes" title="Хочу посмотреть">❤️</button>
        <button class="tinder-btn tinder-watch" id="tinder-watch" title="Уже смотрел(а)">👁</button>
      </div>
      <div class="tinder-tip">Тап по карточке — открыть фильм</div>
    </div>`;
  document.getElementById('tinder-back').onclick = () => { haptic('light'); view = 'play'; openView('play'); };
  document.getElementById('tinder-no').onclick = () => swypeTinder('left');
  document.getElementById('tinder-yes').onclick = () => swypeTinder('right');
  document.getElementById('tinder-watch').onclick = () => swypeTinder('up');
  bindTinderSwipe();
}
function drawTinderCard() {
  const card = document.getElementById('tinder-card');
  const cnt = document.getElementById('tinder-count');
  if (!card) return;
  if (_tinderIdx >= _tinderQueue.length) { tinderFinish(); return; }
  const m = _tinderQueue[_tinderIdx];
  const fav = getFavs().includes(m.code);
  const watched = getWatched().includes(String(m.code));
  const meta = [m.year, fmtDuration(m.duration), (m.genres || []).slice(0, 3).join(' · ')].filter(Boolean).join(' · ');
  if (cnt) cnt.textContent = `${_tinderIdx + 1} / ${_tinderQueue.length}`;
  card.innerHTML = `
    <div class="tinder-poster">
      ${m.poster
        ? `<img src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy" decoding="async" ${FADE}${dimStyle(m)}
             onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>`
        : `<div class="poster-placeholder"><span>🎬</span></div>`}
      <span class="code-badge">🔑 ${esc(String(m.code))}</span>
      ${fav ? '<span class="tinder-flag t-fav">❤️ в «Моём»</span>' : ''}
      ${watched ? '<span class="tinder-flag">👁 смотрю</span>' : ''}
    </div>
    <div class="tinder-info">
      <h3>${esc(m.title)}</h3>
      ${meta ? `<div class="tinder-meta">${esc(meta)}</div>` : ''}
      <span class="rating">${ratingBadge(m)}</span>
      ${m.director ? `<div class="tinder-dir">🎬 ${esc(m.director)}</div>` : ''}
    </div>`;
  card.style.transform = '';
  card.style.opacity = '1';
  card.style.transition = 'none';
  card.onclick = (e) => {
    if (e.target.closest('.tinder-actions') || e.target.closest('.tinder-btn')) return;
    openDetail(m.code);
  };
}

function tinderFinish() {
  const card = document.getElementById('tinder-card');
  const cnt = document.getElementById('tinder-count');
  if (cnt) cnt.textContent = '';
  if (!card) return;
  const favs = _tinderPicks.map(code => ALL.find(x => x.code === code)).filter(Boolean);
  card.innerHTML = `
    <div class="tinder-finish">
      <h3>${favs.length ? '🎉 Твоя подборка на вечер' : '🌙 Всё пересмотрели'}</h3>
      <p class="tinder-finish-sub">${favs.length
        ? `Выбрал(а) ${favs.length}${favs.length === 1 ? ' фильм' : ' фильмов'} — нажми, чтобы открыть`
        : 'В этой колоде ничего не приглянулось. Начнёшь новую?'}</p>
      ${favs.length ? '<div class="tinder-minis">' + favs.map(m => `
        <div class="tinder-mini" data-c="${esc(m.code)}">
          <div class="tm-poster">${m.poster
            ? `<img src="${esc(m.poster)}" alt="" loading="lazy" ${FADE} onerror="this.style.display='none'"/>`
            : '<span>🎬</span>'}</div>
          <div class="tm-name">${esc(m.title)}</div>
        </div>`).join('') + '</div>' : ''}
      <div class="tinder-finish-actions">
        <button class="btn-primary" id="tinder-restart">🎴 Листать ещё</button>
      </div>
    </div>`;
  const ok = document.getElementById('tinder-restart');
  if (ok) ok.onclick = () => { haptic('light'); renderTinder(); };
  card.querySelectorAll('.tinder-mini').forEach(el => el.addEventListener('click', () => {
    const m = ALL.find(x => String(x.code) === String(el.dataset.c));
    if (m) openDetail(m.code);
  }));
}
function swypeTinder(dir) {
  const card = document.getElementById('tinder-card');
  if (!card || _tinderIdx >= _tinderQueue.length) return;
  const m = _tinderQueue[_tinderIdx];
  const W = window.innerWidth || 400;
  card.style.transition = 'transform .28s ease, opacity .28s ease';
  if (dir === 'right') {
    haptic('ok');
    if (!getFavs().includes(m.code)) toggleFav(m.code);
    _tinderPicks.push(m.code);
    card.style.transform = `translateX(${W}px) rotate(12deg)`;
    card.style.opacity = '0';
  } else if (dir === 'up') {
    haptic('ok');
    if (!getWatched().includes(String(m.code))) toggleWatched(m.code);
    card.style.transform = `translateY(-${W * 1.4}px) rotate(-10deg)`;
    card.style.opacity = '0';
  } else {
    haptic('light');
    card.style.transform = `translateX(-${W}px) rotate(-12deg)`;
    card.style.opacity = '0';
  }
  setTimeout(() => { _tinderIdx++; drawTinderCard(); }, 280);
}
function bindTinderSwipe() {
  const stage = document.getElementById('tinder-stage');
  const card = document.getElementById('tinder-card');
  if (!stage || !card) return;
  let startX = 0, startY = 0, down = false, moved = false;
  stage.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; down = true; moved = false;
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => {
    if (!down) return;
    const t = e.touches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
    if (moved && card && _tinderIdx < _tinderQueue.length) {
      const rot = Math.max(-14, Math.min(14, dx / 16));
      card.style.transition = 'none';
      card.style.transform = `translate(${dx}px, ${dy > 0 ? dy * 0.4 : dy}px) rotate(${rot}deg)`;
      card.style.opacity = String(Math.max(.35, 1 - Math.abs(dx) / 420));
    }
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!down) return;
    down = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (moved && _tinderIdx < _tinderQueue.length) {
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy)) swypeTinder(dx > 0 ? 'right' : 'left');
      else if (Math.abs(dy) > 80 && dy < 0 && Math.abs(dy) > Math.abs(dx)) swypeTinder('up');
      else { card.style.transition = 'transform .2s ease, opacity .2s ease'; card.style.transform = ''; card.style.opacity = '1'; }
    }
    moved = false;
  }, { passive: true });
}

// ---------- мини-игра «😀 Угадай по эмодзи» ----------
let EMOJI_RIDDLES = [];
function renderEmojiGame() {
  const box = document.getElementById('view-emoji');
  if (!box) return;
  if (!EMOJI_RIDDLES.length) { box.innerHTML = ''; return; }
  const r = EMOJI_RIDDLES[Math.floor(Math.random() * EMOJI_RIDDLES.length)];
  box.innerHTML = `
    <div class="emoji-game">
      <h2 class="emoji-title">😀 Угадай по эмодзи</h2>
      <div class="emoji-q">${esc(r.emoji)}</div>
      <div class="game-options">
                ${r.options.map(t => `<button class="btn-option" data-t="${esc(t)}" data-code="${r.code}">${esc(t)}</button>`).join('')}
      </div>
      <button class="btn-back" id="emoji-next">🎲 Другая загадка</button>
    </div>`;
  box.querySelectorAll('.btn-option').forEach(b => b.addEventListener('click', () => {
    if (box.dataset.locked === '1') return;
    box.dataset.locked = '1';
        // v130: ответ ищем через code, а не через data-a (который больше не раскрывает title)
    const movie = ALL.find(m => String(m.code) === String(b.dataset.code)) || {};
    const right = movie ? b.dataset.t === movie.title : false;
    haptic(right ? 'ok' : 'error');
    b.classList.add(right ? 'correct' : 'wrong');
    box.querySelectorAll('.btn-option').forEach(x => {
            if (movie && x.dataset.t === movie.title) x.classList.add('correct');
      x.disabled = true;
    });
        // v130: код уже найден выше по data-code (он равен r.code, с которым
    // рендерятся кнопки). Раньше здесь стоял повторный `const movie` в этом же
    // блоке — это SyntaxError, из-за которого весь бандл не парсился, а
    // приложение открывалось чёрным экраном.
    const code = movie.code;
    if (code) {
      const open = document.createElement('button');
      open.className = 'btn-primary';
      open.style.marginTop = '10px';
            open.textContent = `🔓 Открыть код «${movie.title || ''}»`;
      open.onclick = () => sendOrDeepLink({ action: 'open_movie', code });
      box.querySelector('.emoji-game').appendChild(open);
    }
  }));
  document.getElementById('emoji-next').onclick = () => { haptic('light'); box.dataset.locked = '0'; renderEmojiGame(); };
}

const LAST_VIEW_KEY = 'kinoafisha_last_view';
// v124: у каждого раздела своя позиция прокрутки. Раньше при переключении
// вкладок страница оставалась на той же высоте — пользователь попадал в
// середину нового раздела; теперь возврат в раздел ставит его на прежнее
// место (а первый вход — наверх).
const _viewScroll = {};
function rememberScroll() {
  const k = String(curTab || view || '');
  if (!k) return;
  try { _viewScroll[k] = window.scrollY || 0; } catch (e) { /* пусто */ }
}
function restoreScroll(name) {
  try { window.scrollTo({ top: _viewScroll[String(name)] || 0, behavior: 'auto' }); }
  catch (e) { /* пусто */ }
}
// Единая точка открытия разделов: вкладки, подменю «Ещё» и восстановление
// последнего раздела при запуске — всё через openView.
function openView(v, opts) {
  track('view', v);
  rememberScroll();   // позицию запоминаем ДО смены раздела
  curTab = v;
  view = (v === 'today') ? 'grid' : v;   // «Сегодня» — режим афиши (те же блоки, другой набор)
  try { localStorage.setItem(LAST_VIEW_KEY, v); } catch (e) {}
  // v124: считаем осознанные переходы по разделам. Восстановление последнего
  // раздела при запуске приложения — не переход (opts.restore), иначе «Афиша»
  // вырастет от каждого открытия приложения.
  if (!(opts && opts.restore)) bumpViewStat(v);
  // v126: падение рендера раздела — самая тихая поломка: пользователь видит
  // пустой экран и уходит, а мы узнаём об этом только из жалобы. Сбой считаем и
  // показываем в той же плашке, что и прочие ошибки приложения.
  try {
    if (v === 'play' || v === 'mine') { showView(v); renderHub(v); }
    else if (v === 'game') { showView('game'); renderGameMenu(); }
    else if (v === 'cols') { showView('cols'); renderCols(); }
    else if (v === 'news') { showView('news'); renderNews(); }
    else if (v === 'top') { showView('top'); renderLeaderboard(); }
    else if (v === 'profile') { showView('profile'); renderProfile(); }
    else if (v === 'trailers') { showView('trailers'); renderTrailerGenreChips(); renderTrailers(); }
    else if (v === 'achievements') { showView('achievements'); renderAchievements(); }
    else if (v === 'chain') { showView('chain'); renderChain(); }
    else if (v === 'marathon') { showView('marathon'); renderMarathonView(); }
    else if (v === 'year') { showView('year'); renderYear(); }
    else if (v === 'tinder') { showView('tinder'); renderTinder(); }
    else if (v === 'tonight') { showView('tonight'); renderTonight(); }
    else if (v === 'quiz') { showView('quiz'); renderQuiz(); }
    else if (v === 'mycols') { showView('mycols'); renderMyCols(); }   // v106: свои подборки
    else if (v === 'map') { showView('map'); renderMap(); }             // v176: кино-карта
    else if (v === 'library') { showView('library'); renderLibrary(); } // v177: кинобиблиотека
    else if (v === 'mycol-detail') { showView('mycol-detail'); renderMyColDetail(); }
    else { showView('catalog'); renderGrid(); if (v === 'today') { renderTonightHero(); renderTMood(); renderTLinks(); renderTNudge(); } }  // today | grid | fav
  } catch (e) {
    bumpErrorStat('view', v);
    showErrorBanner('Раздел «' + v + '» не открылся: ' + ((e && e.message) || 'неизвестная ошибка'));
  }
  // v124: раздел открывается на своём прежнем месте (первый вход — наверх)
  restoreScroll(v);
}
// v125: смена вкладки подтверждается тактильно — палец «слышит» переход сразу,
// ещё до того, как раздел дорисуется (на медленном телефоне это заметная пауза).
document.querySelectorAll('.tab[data-view]').forEach(t => t.addEventListener('click', () => {
  haptic('light');
  openView(t.dataset.view);
}));

// ---------- v60: свайп влево/вправо листает главные вкладки ----------
// Афиша → Трейлеры → Новости и обратно. В доп. разделах («Ещё») и в карточке
// фильма свайп не работает, чтобы не уводить со специфичного экрана.
(() => {
  const ORDER = ['today', 'grid', 'play', 'mine'];
  let sx = 0, sy = 0, armed = false;
  const modalOpen = () => !!document.querySelector('.modal:not(.hidden)');
  document.addEventListener('touchstart', (e) => {
    armed = false;
    if (modalOpen()) return;
    if (moreMenu && !moreMenu.classList.contains('hidden')) return;
    const det = document.getElementById('view-detail');
    if (det && !det.classList.contains('hidden')) return;
    // не мешаем горизонтальным прокруткам и формам
    if (e.target.closest('input, textarea, select, .hero-row, .similar-row, .genre-chips, .trailer-genre-chips')) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    armed = true;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!armed) return;
    armed = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45) return;
    const cur = curTab === 'fav' ? 'mine' : curTab;
    const i = ORDER.indexOf(cur);
    if (i === -1) return;
    const next = dx < 0 ? ORDER[i + 1] : ORDER[i - 1];
    if (!next) return;
    haptic('light');
    openView(next);
  }, { passive: true });
})();

// ---------- «Ещё»: нижний лист (bottom-sheet) с группами ----------
// Было выпадающее меню на 13 плоских пунктов («админка»): на телефоне это и
// мелко, и без структуры. Стало: лист снизу, крупные плитки с подписью, группы.
// Кнопки остаются в index.html плоским списком (совместимость + кэш-микс), а
// раскладка по группам идёт здесь — порядок разделов правится в одном месте.
const moreTab = document.getElementById('tab-more');
const moreMenu = document.getElementById('more-menu');
const sheetBackdrop = document.getElementById('sheet-backdrop');
const SHEET_GROUPS = [
  ['🌙 Сегодня', ['tonight', 'duo', 'quiz']],
  ['🎮 Играть', ['capgame', 'arena', 'game', 'chain', 'marathon']],
  ['🎰 Казино на фишках', ['bj', 'slots', 'rl', 'mn', 'dice', 'hilo', 'plinko', 'poker']],
  ['▶️ Смотреть', ['trailers', 'news', 'map', 'cols', 'top', 'mycols', 'tinder']],
  ['🏅 Прогресс', ['achievements', 'year']],
  ['👤 Твоё', ['library', 'profile', 'fav']],
  ['⚙️ Настройки', ['mute', 'info', 'catalog', 'changelog']],
];
const SHEET_LABELS = {
  bj: ['♠️ Блэкджек', 'до 21 на фишках'],
  slots: ['🎰 Киноавтомат', 'слоты с бонусом'],
  rl: ['🎡 Рулетка', 'ставки на столе'],
  mn: ['💣 Мины', 'забирай вовремя'],
  plinko: ['🔮 Плинко', 'шарик по колышкам'],
  dice: ['🎲 Кости', 'меньше или больше'],
  hilo: ['🃏 Выше / Ниже', 'лесенка карт'],
  poker: ['🃏 Кино-покер', 'холдем и видеопокер'],
  trailers: ['🎥 Трейлеры', 'новинки и классика'],
  news: ['📰 Новости', 'что происходит в кино'],
  tonight: ['🌙 Сегодня вечером', 'подберём по настроению'],
  duo: ['👥 Выбор на двоих', 'фильм для обоих'],
  quiz: ['🧠 Викторина дня', '5 вопросов · серия дней'],
  capgame: ['🎮 Капитан в пути', 'игра на 45 секунд'],
  arena: ['⚔️ Кино-арена', '3 жизни · дуэли знаний'],
  map: ['🌍 Кино-карта', 'фильмы по странам мира'],
  library: ['📚 Моя библиотека', 'хочу · смотрел · любимое'],
  mute: ['🔔 Звук и вибрация', 'вкл'],
  info: ['ℹ️ О боте', 'что здесь и зачем'],
  cols: ['📚 Подборки', 'готовые тематические'],
  top: ['🏆 Топ', 'лучшее за неделю'],
  mycols: ['🗂 Мои подборки', 'что собрал сам'],
  tinder: ['🎴 Тиндер кино', 'свайпай и выбирай'],
  game: ['🏋 Тренажёр', 'кадр и загадка'],
  chain: ['🔗 Кино-путь', 'фильм → похожее'],
  marathon: ['🎬 Марафон', 'трейлеры подряд'],
  achievements: ['🎖 Достижения', 'коллекция наград'],
  year: ['🏆 Мой год', 'итоги просмотров'],
  profile: ['👤 Профиль', 'уровень и баллы'],
  fav: ['❤️ Моё', 'хочу посмотреть'],
  catalog: ['🖼 Постер каталога', 'картинкой в канал'],
  changelog: ['🎁 Что нового', 'что добавили в афишу'],
};
// Ключ плитки: data-view, а у «Постер каталога» и «Что нового» — id.
function sheetKey(btn) {
  if (btn.dataset.view) return btn.dataset.view;
  if (btn.id === 'more-catalog') return 'catalog';
  if (btn.id === 'more-changelog') return 'changelog';
  if (btn.id === 'more-capgame') return 'capgame';
  if (btn.id === 'more-duo') return 'duo';
  if (btn.id === 'more-arena') return 'arena';
  if (btn.id === 'more-mute') return 'mute';
  { const m = /^more-(bj|slots|rl|mn|dice|hilo|plinko|poker)$/.exec(btn.id || ''); if (m) return m[1]; }
  if (btn.id === 'more-info') return 'info';
  return '';
}
function buildMoreSheet() {
  if (!moreMenu || !moreMenu.querySelector('.more-item')) return;
  if (moreMenu.querySelector('.sheet-body')) return;   // уже разложено
  const items = Array.from(moreMenu.querySelectorAll('.more-item'));
  const body = document.createElement('div');
  body.className = 'sheet-body';
  SHEET_GROUPS.forEach(([title, keys]) => {
    const group = document.createElement('div');
    group.className = 'sheet-group';
    const h = document.createElement('div');
    h.className = 'sheet-group-title';
    h.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'sheet-grid';
    keys.forEach(k => {
      const btn = items.find(b => sheetKey(b) === k);
      if (!btn) return;
      const [main, sub] = SHEET_LABELS[k] || ['', ''];
      btn.innerHTML = `<b>${main}</b><i>${sub}</i>`;
      grid.appendChild(btn);        // перенос узла: плоский список исчезает сам
    });
    group.appendChild(h);
    group.appendChild(grid);
    body.appendChild(group);
  });
  // «Цвет оформления» — отдельный блок перед настройками, на всю ширину
  const accent = moreMenu.querySelector('#more-accent');
  if (accent) {
    const groups = body.querySelectorAll('.sheet-group');
    const last = groups[groups.length - 1];
    if (last) body.insertBefore(accent, last);
    else body.appendChild(accent);
  }
  moreMenu.appendChild(body);
  syncMoreMute();
}
let _sheetTimer = null;
function openMoreMenu() {
  if (!moreMenu) return;
  clearTimeout(_sheetTimer);
  moreMenu.style.transform = '';     // v124: после свайпа мог остаться inline-transform
  moreMenu.style.transition = '';
  moreMenu.classList.remove('hidden');
  if (sheetBackdrop) sheetBackdrop.classList.remove('hidden');
  void moreMenu.offsetHeight;       // reflow: без него transition не запускается
  moreMenu.classList.add('show');
  if (sheetBackdrop) sheetBackdrop.classList.add('show');
  if (moreTab) moreTab.setAttribute('aria-expanded', 'true');
}
function closeMoreMenu() {
  if (!moreMenu) return;
  if (moreTab) moreTab.setAttribute('aria-expanded', 'false');
  if (moreMenu.classList.contains('hidden')) return;
  moreMenu.classList.remove('show');
  if (sheetBackdrop) sheetBackdrop.classList.remove('show');
  clearTimeout(_sheetTimer);
  // .hidden ставим после анимации — иначе лист исчезает рывком
  _sheetTimer = setTimeout(() => {
    moreMenu.classList.add('hidden');
    moreMenu.style.transform = '';   // v124: следующий показ снова поедет снизу
    if (sheetBackdrop) sheetBackdrop.classList.add('hidden');
  }, 320);
}
if (moreTab && moreMenu) {
  buildMoreSheet();
  moreTab.addEventListener('click', (e) => {
    e.stopPropagation();
    haptic('light');
    if (moreMenu.classList.contains('hidden')) openMoreMenu();
    else closeMoreMenu();
  });
  if (sheetBackdrop) sheetBackdrop.addEventListener('click', closeMoreMenu);
  const sheetX = document.getElementById('sheet-close');
  if (sheetX) sheetX.addEventListener('click', closeMoreMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMoreMenu(); });
  // Свайп вниз по «ручке»/шапке — привычный жест закрытия. Лист едет за
  // пальцем (иначе жест выглядит «мёртвым»), при отпускании либо закрывается,
  // либо возвращается на место. Тянем только вниз — вверх не «выпрыгивает».
  let sy = 0, dy = 0, dragging = false;
  moreMenu.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.sheet-grab, .sheet-head')) return;
    dragging = true;
    dy = 0;
    sy = e.touches[0].clientY;
    moreMenu.style.transition = 'none';
  }, { passive: true });
  moreMenu.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.touches[0].clientY - sy);
    moreMenu.style.transform = 'translateY(' + dy + 'px)';
    if (sheetBackdrop) sheetBackdrop.style.opacity = String(Math.max(.3, 1 - dy / 300));
  }, { passive: true });
  const dragEnd = (close) => {
    if (!dragging) return;
    dragging = false;
    moreMenu.style.transition = '';
    if (sheetBackdrop) sheetBackdrop.style.opacity = '';
    if (close) {
      // v125: жест довели до конца — «средний» удар ощутимее лёгкого тапа, и на
      // ощупь понятно, что лист именно закрылся, а не вернулся назад.
      haptic('medium');
      moreMenu.style.transform = 'translateY(100%)';   // доводим жест до конца
      closeMoreMenu();
    } else {
      moreMenu.style.transform = '';                   // не дотянул — назад
    }
    dy = 0;
  };
  moreMenu.addEventListener('touchend', () => dragEnd(dy > 90), { passive: true });
  moreMenu.addEventListener('touchcancel', () => dragEnd(false), { passive: true });
  document.querySelectorAll('.more-item').forEach(b => b.addEventListener('click', () => {
    closeMoreMenu();
    if (b.id === 'more-changelog') { showChangelog(true); return; }  // v101: открываемый инфоблок
    if (b.id === 'more-catalog') { shareCatalogPoster(); return; }   // v113: витрина одной картинкой
    if (b.id === 'more-mute') { const m = document.getElementById('btn-mute'); if (m) m.click(); syncMoreMute(); return; }
    if (b.id === 'more-capgame') { haptic('light'); openCaptainGame(); return; }
    if (b.id === 'more-duo') { haptic('light'); openDuo(); return; }
    if (b.id === 'more-arena') { haptic('light'); openArena(); return; }   // v158: игра прямо из меню
    if (b.id === 'more-bj') { haptic('light'); openBlackjackSafe(); return; }
    if (b.id === 'more-slots') { haptic('light'); openCasinoSafe('openSlots'); return; }
    if (b.id === 'more-rl') { haptic('light'); openCasinoSafe('openRoulette'); return; }
    if (b.id === 'more-mn') { haptic('light'); openCasinoSafe('openMines'); return; }
    if (b.id === 'more-plinko') { haptic('light'); openCasinoSafe('openPlinko'); return; }
    if (b.id === 'more-dice') { haptic('light'); openCasinoSafe('openDice'); return; }
    if (b.id === 'more-hilo') { haptic('light'); openCasinoSafe('openHilo'); return; }
    if (b.id === 'more-poker') { haptic('light'); openPokerSafe(); return; }
    if (b.id === 'more-info') { const i = document.getElementById('btn-info'); if (i) i.click(); return; }
    haptic('light');   // v125: плитка в листе — тоже переход, отзываемся так же
    openView(b.dataset.view);
  }));
}


// ---------- v183: «Сегодня» (главный экран), нижняя панель, хабы «Играть»/«Моё» ----------
function greetNow() {
  const h = new Date().getHours();
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}
function renderTonightHero() {
  const el = document.getElementById('tonight-hero');
  if (!el) return;
  const m = filmDayPick();
  if (!m) { el.classList.add('hidden'); return; }
  const fav = getFavs().includes(m.code);
  const seen = getWatched().map(String).includes(String(m.code));
  const genres = (m.genres || []).slice(0, 2).join(' · ');
  let dur = 0;
  try { dur = (typeof durOf === 'function') ? durOf(m) : 0; } catch (e) {}
  const meta = [m.year, m.rating ? '⭐ ' + m.rating : '', dur ? dur + ' мин' : ''].filter(Boolean).join(' · ');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="th-bg" style="background-image:url('${esc(m.poster)}')"></div>
    <div class="th-in">
      <div class="th-hello">${greetNow()}</div>
      <div class="th-sub">Капитан выбрал кино на сегодня</div>
      <div class="th-card" id="th-card">
        <div class="th-poster"><img src="${esc(m.poster)}" alt="" decoding="async" onerror="this.style.display='none'"/></div>
        <div class="th-info">
          <div class="th-title">${esc(m.title)}</div>
          <div class="th-meta">${esc(meta)}</div>
          ${genres ? `<div class="th-genres">${esc(genres)}</div>` : ''}
          <button class="th-seen${seen ? ' on' : ''}" id="th-seen">${seen ? '✅ Смотрел' + (myRating(m.code) ? ' · ' + '★'.repeat(myRating(m.code)) : ' · оценить') : '✔️ Уже смотрел'}</button>
          <div class="th-btns">
            <button class="th-open" id="th-open">▶️ Открыть</button>
            <button class="th-roll" id="th-roll" title="Другой фильм" aria-label="Другой фильм">🎲</button>
            <button class="fav-quick ${fav ? 'active' : ''}" data-code="${esc(m.code)}" aria-label="Моё" title="В «Моё»">${fav ? '♥︎' : '♡'}</button>
          </div>
        </div>
      </div>
    </div>`;
  const open = () => { haptic('light'); openDetail(m.code); };
  const po = el.querySelector('.th-poster'); if (po) po.onclick = open;
  const ti = el.querySelector('.th-title'); if (ti) ti.onclick = open;
  document.getElementById('th-open').onclick = open;
  document.getElementById('th-seen').onclick = (ev) => { ev.stopPropagation(); openSeenSheet(m, seen); };
  document.getElementById('th-roll').onclick = (ev) => {
    ev.stopPropagation();
    haptic('light');
    const cands = ALL.filter(x => (parseFloat(x.rating) || 0) >= 7.3 && x.poster && String(x.code) !== String(m.code));
    if (!cands.length) return;
    _fdManual = cands[Math.floor(Math.random() * cands.length)].code;
    renderTonightHero();
  };
  wireFavQuick(el);
}

// ---------- v185: «Я посмотрел» → оценка в одно касание + итог ----------
function _countriesSeen() {
  const set = new Set();
  const w = new Set(getWatched().map(String));
  ALL.forEach(x => { if (w.has(String(x.code))) (x.countries || []).forEach(c => set.add(c)); });
  return set;
}
function openSeenSheet(m, wasSeen) {
  const before = _countriesSeen();
  if (!wasSeen) {
    const w = new Set(getWatched().map(String)); w.add(String(m.code)); setWatched(w);
    try { bumpWeekStat('watched'); } catch (e) {}
    haptic('ok');
  }
  let el = document.getElementById('t-rate');
  if (el) el.remove();
  el = document.createElement('div');
  el.id = 't-rate';
  el.className = 'modal';
  const cur = myRating(m.code);
  el.innerHTML = `<div class="modal-card tr-card">
    <button class="modal-close" id="tr-x">✕</button>
    <div class="tr-emoji">🍿</div>
    <h3>Как тебе «${esc(m.title)}»?</h3>
    <div class="tr-stars" id="tr-stars">${[1, 2, 3, 4, 5].map(i => `<button data-r="${i}" class="${i <= cur ? 'on' : ''}">★</button>`).join('')}</div>
    <div class="tr-sum" id="tr-sum"></div>
    <button class="btn-primary" id="tr-ok">Готово</button>
  </div>`;
  document.body.appendChild(el);
  const sum = el.querySelector('#tr-sum');
  const total = getWatched().length;
  const after = _countriesSeen();
  const fresh = [...after].filter(c => !before.has(c));
  const showSum = (r) => {
    const lines = [`📚 В «Смотрел» теперь ${total} ${total % 10 === 1 && total % 100 !== 11 ? 'фильм' : (total % 10 >= 2 && total % 10 <= 4 && (total % 100 < 12 || total % 100 > 14) ? 'фильма' : 'фильмов')}`];
    if (fresh.length) lines.push(`🌍 Новая страна на кино-карте: ${esc(fresh.join(', '))}!`);
    else if (after.size) lines.push(`🌍 Стран на кино-карте: ${after.size}`);
    if (r >= 4) lines.push('Капитан запомнил: такое тебе заходит 😉');
    else if (r && r <= 2) lines.push('Принято. Подберу что-нибудь получше.');
    sum.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
    sum.classList.add('show');
  };
  showSum(cur);
  const close = () => { el.remove(); renderTonightHero(); try { renderTodayStrip(); } catch (e) {} };
  el.querySelector('#tr-x').onclick = close;
  el.querySelector('#tr-ok').onclick = close;
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelectorAll('#tr-stars button').forEach(b => b.onclick = () => {
    const r = +b.dataset.r;
    setRating(m.code, r);
    el.querySelectorAll('#tr-stars button').forEach(x => x.classList.toggle('on', +x.dataset.r <= (myRating(m.code) || 0)));
    showSum(myRating(m.code));
  });
}

// ---------- v185: «Что хочется?» — один фильм по настроению прямо на «Сегодня» ----------
let _tmMood = null, _tmShift = 0;
const TM_IDS = ['laugh', 'thrill', 'scary', 'date', 'friends', 'family'];
let _tmTime = 0;   // v188: «сколько времени» — 0 любое / 100 / 130 минут
function renderTMood() {
  const el = document.getElementById('t-mood');
  if (!el || !ALL.length) return;
  const moods = TM_IDS.map(id => TONIGHT_MOODS.find(x => x.id === id)).filter(Boolean);
  const chips = moods.map(md => `<button class="tm-chip${_tmMood === md.id ? ' active' : ''}" data-id="${md.id}">${md.emoji} ${esc(md.name.replace(/ \(.*\)/, ''))}</button>`).join('');
  let result = '';
  if (_tmMood) {
    const md = TONIGHT_MOODS.find(x => x.id === _tmMood);
    const seen = new Set(getWatched().map(String));
    const fitT = m => { if (!_tmTime) return true; const d = +m.duration || 0; return d > 0 && d <= _tmTime; };
    let pool = ALL.filter(m => md.ok(m) && fitT(m) && (+m.rating || 0) >= 6.8);
    if (!pool.length) pool = ALL.filter(m => md.ok(m) && fitT(m));
    if (!pool.length) pool = ALL.filter(m => md.ok(m));
    const fresh = pool.filter(m => !seen.has(String(m.code)));
    if (fresh.length) pool = fresh;
    if (!pool.length) result = '<div class="tm-empty">Под это настроение пока пусто — выбери другое 🙂</div>';
    else {
      const rnd = _seedRng(_todayKey() + 'tm' + md.id);
      pool = pool.map(m => [rnd(), m]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
      const m = pool[_tmShift % pool.length];
      const meta = [m.year, m.rating ? '⭐ ' + m.rating : '', (m.genres || []).slice(0, 2).join(' · ')].filter(Boolean).join(' · ');
      result = `<div class="tm-res" data-code="${esc(String(m.code))}">
        <div class="tm-poster">${m.poster ? `<img src="${esc(m.poster)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'"/>` : ''}</div>
        <div class="tm-info"><b>${esc(m.title)}</b><span>${esc(meta)}</span>
          <div class="tm-btns"><button class="tm-open">▶️ Открыть</button>${pool.length > 1 ? '<button class="tm-next">🔄 Другой</button>' : ''}</div></div>
      </div>`;
    }
  }
  el.classList.remove('hidden');
  const tchips = [[0, 'Любое время'], [100, '⏱ до 100 мин'], [130, 'до 2 ч 10 мин']].map(([v, t]) => `<button class="tm-chip tm-time${_tmTime === v ? ' active' : ''}" data-t="${v}">${t}</button>`).join('');
  el.innerHTML = `<div class="tm-head">Что хочется?</div><div class="tm-chips">${chips}</div><div class="tm-chips tm-times">${tchips}</div>${result}`;
  el.querySelectorAll('.tm-time').forEach(b => b.onclick = () => { _tmTime = +b.dataset.t; _tmShift = 0; haptic('light'); renderTMood(); });
  el.querySelectorAll('.tm-chip:not(.tm-time)').forEach(b => b.onclick = () => {
    _tmMood = (_tmMood === b.dataset.id) ? null : b.dataset.id; _tmShift = 0; haptic('light'); renderTMood();
  });
  const res = el.querySelector('.tm-res');
  if (res) {
    el.querySelector('.tm-open').onclick = () => openDetail(res.dataset.code);
    const poster = el.querySelector('.tm-poster'); if (poster) poster.onclick = () => openDetail(res.dataset.code);
    const nx = el.querySelector('.tm-next'); if (nx) nx.onclick = () => { _tmShift++; haptic('light'); renderTMood(); };
  }
}

// ---------- v186: ранги Капитана, итог недели, микроанимации ----------
function popMsg(text, kind) {
  const el = document.createElement('div');
  el.className = 'pop-msg' + (kind ? ' ' + kind : '');
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
function confetti(n = 26) {
  const cols = ['#ff5a5f', '#ffc43d', '#3ecf7a', '#4aa3ff', '#c77dff'];
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.left = (5 + Math.random() * 90) + '%';
    p.style.background = cols[i % cols.length];
    p.style.animationDelay = (Math.random() * .25) + 's';
    p.style.animationDuration = (1.2 + Math.random() * .9) + 's';
    p.style.transform = 'rotate(' + Math.floor(Math.random() * 360) + 'deg)';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2600);
}
const RANKS = [
  [0, '🎟', 'Зритель', 'Знакомишься с афишей'],
  [50, '🍿', 'Киноман', 'Смотришь и оцениваешь регулярно'],
  [150, '✍️', 'Критик', 'Есть вкус и своё мнение'],
  [350, '🎬', 'Режиссёр', 'Разгадываешь коды и играешь в арене'],
  [700, '⚓', 'Капитан', 'Высшее звание — ты на мостике'],
];
function kinoXP() {
  let arena = 0;
  try { arena = parseInt(localStorage.getItem('kino_arena_best') || '0', 10) || 0; } catch (e) {}
  const d = dailyState();
  return getWatched().length * 3 + Object.keys(getRatings()).length * 2 + getUnlocked().length * 5
    + getFavs().length + Math.floor(arena / 10) + Math.max(d.best || 0, d.series || 0) * 2;
}
function rankInfo() {
  const xp = kinoXP();
  let i = 0;
  RANKS.forEach((r, k) => { if (xp >= r[0]) i = k; });
  const cur = RANKS[i], nxt = RANKS[i + 1] || null;
  const pct = nxt ? Math.round(100 * (xp - cur[0]) / (nxt[0] - cur[0])) : 100;
  return { xp, i, cur, nxt, pct };
}
function rankCardHtml() {
  const r = rankInfo();
  return `<div class="rk-card">
    <div class="rk-ico">${r.cur[1]}</div>
    <div class="rk-body">
      <div class="rk-name">${r.cur[2]}</div>
      <div class="rk-sub">${r.nxt ? `${r.xp} оч. · до «${r.nxt[2]}» ${r.nxt[0] - r.xp}` : `${r.xp} оч. · высший ранг 👑`}</div>
      <div class="rk-bar"><i style="width:${r.pct}%"></i></div>
    </div>
    <div class="rk-ladder">${RANKS.map((x, k) => `<span class="${k <= r.i ? 'on' : ''}" title="${x[2]} от ${x[0]}">${x[1]}</span>`).join('')}</div>
  </div>`;
}
function checkRankUp() {
  try {
    const r = rankInfo();
    const seen = parseInt(localStorage.getItem('kino_rank_seen') || '-1', 10);
    if (seen < 0) { localStorage.setItem('kino_rank_seen', String(r.i)); return; }
    if (r.i > seen) {
      localStorage.setItem('kino_rank_seen', String(r.i));
      haptic('ok'); confetti(34);
      popMsg(`${r.cur[1]} Новый ранг: ${r.cur[2]}!`, 'big');
    }
  } catch (e) {}
}
function weekData() {
  const w = week7();
  const sum = (k) => w.reduce((a, d) => a + (d[k] || 0), 0);
  const d = dailyState();
  return { watched: sum('watched'), rated: sum('rated'), trailers: sum('trailers'), favs: sum('favs'), opened: sum('open'),
    series: d.series || 0, rank: rankInfo(), days: w.filter(x => (x.open + x.trailers + x.favs + x.rated + x.watched) > 0).length };
}
function weekCanvas(wd) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 1080, 1920); gr.addColorStop(0, '#1d2140'); gr.addColorStop(1, '#3a1d3f');
  g.fillStyle = gr; g.fillRect(0, 0, 1080, 1920);
  g.fillStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.arc(900, 200, 320, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center';
  g.font = '800 78px system-ui,sans-serif'; g.fillText('Моя неделя в кино', 540, 170);
  g.font = '500 38px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('Капитан Кино · Киноафиша', 540, 232);
  const items = [['🎬', wd.watched, 'посмотрел'], ['⭐', wd.rated, 'оценок'], ['▶️', wd.trailers, 'трейлеров'], ['🔥', wd.series, 'дней серия']];
  items.forEach((it, i) => {
    const x = 90 + (i % 2) * 450, y = 330 + Math.floor(i / 2) * 330;
    g.fillStyle = 'rgba(255,255,255,.10)'; g.beginPath(); g.roundRect(x, y, 420, 290, 36); g.fill();
    g.textAlign = 'center'; g.fillStyle = '#fff';
    g.font = '90px system-ui,sans-serif'; g.fillText(it[0], x + 210, y + 105);
    g.font = '800 100px system-ui,sans-serif'; g.fillText(String(it[1]), x + 210, y + 205);
    g.font = '500 34px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(it[2], x + 210, y + 255);
  });
  // v247: задания дня и казино
  let chs = 0, bdg = 0, chips = 500;
  try { chs = chStreakAlive(chLoad()); } catch (e) {}
  try { bdg = cbCount(); } catch (e) {}
  try { chips = casinoBalance(); } catch (e) {}
  const extra = [['📅', chs, 'дней заданий'], ['🏅', bdg + '/' + CB_LIST.length, 'достижений'], ['🎞', chips, 'фишек']];
  extra.forEach((it, i) => {
    const x = 90 + i * 305;
    g.fillStyle = 'rgba(245,185,66,.16)'; g.beginPath(); g.roundRect(x, 1000, 290, 270, 36); g.fill();
    g.textAlign = 'center'; g.fillStyle = '#fff';
    g.font = '70px system-ui,sans-serif'; g.fillText(it[0], x + 145, 1080);
    g.font = '800 72px system-ui,sans-serif'; g.fillText(String(it[1]), x + 145, 1170);
    g.font = '500 30px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(it[2], x + 145, 1225);
  });
  g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.roundRect(90, 1320, 900, 190, 36); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '90px system-ui,sans-serif'; g.fillText(wd.rank.cur[1], 210, 1445);
  g.textAlign = 'left'; g.font = '800 54px system-ui,sans-serif'; g.fillText('Ранг: ' + wd.rank.cur[2], 300, 1410);
  g.font = '500 36px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(wd.rank.xp + ' очков · активных дней: ' + wd.days + ' из 7', 300, 1462);
  g.textAlign = 'center'; g.font = '700 44px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText('Сыграем вместе?', 540, 1680);
  g.font = '500 34px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText('t.me/kapitan_kino_bot', 540, 1740);
  return c;
}
function openWeekCard() {
  const wd = weekData();
  let el = document.getElementById('t-week'); if (el) el.remove();
  el = document.createElement('div'); el.id = 't-week'; el.className = 'modal';
  const cv = weekCanvas(wd);
  el.innerHTML = `<div class="modal-card tw-card"><button class="modal-close" id="tw-x">✕</button>
    <img class="tw-img" alt="Моя неделя в кино" src="${cv.toDataURL('image/png')}"/>
    <button class="btn-primary" id="tw-share">📤 Поделиться</button></div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector('#tw-x').onclick = close;
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelector('#tw-share').onclick = async () => {
    const txt = `🎬 Моя неделя в кино: посмотрел ${wd.watched}, оценок ${wd.rated}, серия ${wd.series} ${_daysWord(wd.series || 1)}. Ранг — ${wd.rank.cur[2]}!` + (() => { try { return ' Задания: ' + chStreakAlive(chLoad()) + ' дн. подряд, достижений ' + cbCount() + '/' + CB_LIST.length + '.'; } catch (e) { return ''; } })();
    try {
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      const f = new File([blob], 'week.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], text: txt }); return; }
    } catch (e) {}
    const u = 'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/kapitan_kino_bot') + '&text=' + encodeURIComponent(txt);
    try { tg.openTelegramLink(u); } catch (e) { window.open(u, '_blank'); }
  };
}

function renderTNudge() {
  const el = document.getElementById('t-nudge');
  if (!el) return;
  const s = dailyState();
  const today = _wdayKey();
  let txt = '';
  let onClick = null;
  const h = new Date().getHours();
  const wdn = new Date().getDay();
  checkRankUp();
  if ((wdn === 0 || wdn === 1) && weekData().days > 0) { txt = '📅 Итог недели готов — посмотри и поделись'; onClick = openWeekCard; }
  else if (s.series >= 2 && s.last !== today) txt = `🔥 Серия заходов: ${s.series} ${_daysWord(s.series)} — зайди в игру сегодня, чтобы не потерять`;
  else if (s.series >= 2 && s.last === today) txt = `🔥 Серия заходов: ${s.series} ${_daysWord(s.series)}. Капитан гордится`;
  else if (h >= 18) txt = '🎬 Вечер — самое время выбрать кино. Капитан уже подобрал';
  if (!txt) { el.classList.add('hidden'); return; }
  el.textContent = txt;
  el.onclick = onClick;
  el.classList.toggle('click', !!onClick);
  el.classList.remove('hidden');
}
function goKey(k) {
  const btn = Array.from(document.querySelectorAll('.more-item')).find(b => sheetKey(b) === k);
  if (btn) btn.click();
}
const GROUP_URL = 'https://www.facebook.com/groups/1951192206248508';   // группа «Кино Капитана» (пусто — чип скрыт)
function renderTLinks() {
  const el = document.getElementById('t-links');
  if (!el) return;
  const L = [['poker', '🃏 Покер'], ['blackjack', '♠️ Блэкджек'], ['trailers', '🎥 Трейлеры'], ['news', '📰 Новости'], ['tonight', '🌙 По настроению'],
             ['duo', '👥 На двоих'], ['tinder', '🎴 Тиндер']];
  el.classList.remove('hidden');
  el.innerHTML = L.map(([k, t]) => `<button class="tl-chip" data-k="${k}">${t}</button>`).join('') +
    (GROUP_URL ? '<button class="tl-chip tl-group" data-k="__group">💬 Обсуждаем в группе</button>' : '');
  el.querySelectorAll('.tl-chip').forEach(b => b.onclick = () => {
    haptic('light');
    if (b.dataset.k === '__group') { try { tg.openLink(GROUP_URL); } catch (e) { window.open(GROUP_URL, '_blank'); } return; }
    if (b.dataset.k === 'poker') { openPokerSafe(); return; }
    if (b.dataset.k === 'blackjack') { openBlackjackSafe(); return; }
    goKey(b.dataset.k);
  });
}
// ===== v244: Кино-челлендж дня =====
// 3 задания в день (игра + фильм + раздел) одинаковые для всех: выбираются по дате. Награда — фишки в общий кошелёк kino_poker.
// Прогресс считаем по тем же событиям, что уходят в аналитику (track): ничего не перехватываем в играх.
const CH_KEY = 'kino_chal';
const CH_POOL = {
  game: [
    { id: 'bj3', ico: '♠️', t: 'Сыграй 3 раздачи в блэкджек', ev: 'bj_hand', n: 3, r: 40 },
    { id: 'sl5', ico: '🎰', t: 'Сделай 5 спинов в Киноавтомате', ev: 'slots_spin', n: 5, r: 40 },
    { id: 'rl2', ico: '🎡', t: 'Сыграй 2 раунда в рулетку', ev: 'rl_spin', n: 2, r: 40 },
    { id: 'mn2', ico: '💣', t: 'Сыграй 2 раза в Мины', ev: 'mn_game', n: 2, r: 40 },
    { id: 'dc4', ico: '🎲', t: 'Брось кости 4 раза', ev: 'dc_roll', n: 4, r: 40 },
    { id: 'hl2', ico: '🃏', t: 'Сыграй 2 раза в «Выше/Ниже»', ev: 'hl_game', n: 2, r: 40 },
    { id: 'vp3', ico: '🃏', t: 'Сыграй 3 раздачи в видеопокер', ev: 'vp_hand', n: 3, r: 40 },
  ],
  film: [
    { id: 'mv3', ico: '🎬', t: 'Открой 3 карточки фильмов', ev: 'movie', n: 3, r: 30 },
    { id: 'mv5', ico: '🍿', t: 'Открой 5 карточек фильмов', ev: 'movie', n: 5, r: 40 },
  ],
  browse: [
    { id: 'vnews', ico: '📰', t: 'Загляни в раздел «Новости»', ev: 'view', a: 'news', n: 1, r: 20 },
    { id: 'vtr', ico: '🎥', t: 'Загляни в «Трейлеры»', ev: 'view', a: 'trailers', n: 1, r: 20 },
    { id: 'vton', ico: '🌙', t: 'Открой «Сегодня вечером»', ev: 'view', a: 'tonight', n: 1, r: 20 },
    { id: 'vquiz', ico: '🧠', t: 'Загляни в «Викторину дня»', ev: 'view', a: 'quiz', n: 1, r: 20 },
  ],
};
const CH_ALL_BONUS = 60;     // за все три задания
function chDay(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function chHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function chTasks(day) {
  return ['game', 'film', 'browse'].map((g, i) => { const pool = CH_POOL[g]; return pool[chHash(day + g + i) % pool.length]; });
}
function chLoad() {
  let st = null;
  try { st = JSON.parse(localStorage.getItem(CH_KEY) || 'null'); } catch (e) { st = null; }
  const day = chDay();
  if (!st || typeof st !== 'object') st = { streak: 0, last: '' };
  if (st.day !== day) { st = { day: day, prog: {}, claimed: {}, all: false, streak: st.streak || 0, last: st.last || '' }; }
  st.prog = st.prog || {}; st.claimed = st.claimed || {};
  return st;
}
function chSave(st) { try { localStorage.setItem(CH_KEY, JSON.stringify(st)); } catch (e) { /* пусто */ } }
function chStreakAlive(st) {
  if (!st.last) return 0;
  if (st.last === chDay() || st.last === chDay(new Date(Date.now() - 864e5))) return st.streak || 0;
  return 0;
}
function chPending(st, tasks) {
  let sum = 0;
  tasks.forEach(t => { if ((st.prog[t.id] || 0) >= t.n && !st.claimed[t.id]) sum += t.r; });
  return sum;
}
function chDot() {
  try {
    const st = chLoad(), el = document.getElementById('bn-play-dot');
    if (el) el.classList.toggle('hidden', !chPending(st, chTasks(st.day)));
  } catch (e) { /* пусто */ }
}
function chalHook(name, arg) {
  if (name === 'open' || name === 'view' && arg === 'play') { chDot(); }
  const st = chLoad(), tasks = chTasks(st.day);
  let changed = false;
  tasks.forEach(t => {
    if (t.ev !== name || (t.a && t.a !== String(arg))) return;
    const was = st.prog[t.id] || 0;
    if (was >= t.n) return;
    st.prog[t.id] = was + 1; changed = true;
    if (was + 1 >= t.n) { try { popMsg('✅ Задание выполнено! Награда ждёт в «Играть»'); } catch (e) { /* пусто */ } }
  });
  if (changed) { chSave(st); chDot(); }
}
function chClaim() {
  const st = chLoad(), tasks = chTasks(st.day);
  let sum = 0;
  tasks.forEach(t => { if ((st.prog[t.id] || 0) >= t.n && !st.claimed[t.id]) { st.claimed[t.id] = 1; sum += t.r; } });
  let bonusTxt = '';
  if (!st.all && tasks.every(t => st.claimed[t.id])) {
    st.all = true;
    const yest = chDay(new Date(Date.now() - 864e5));
    st.streak = (st.last === yest ? (st.streak || 0) : 0) + 1; st.last = st.day;
    const sb = Math.min(st.streak, 7) * 10;
    sum += CH_ALL_BONUS + sb;
    bonusTxt = ' · бонус за все три +' + (CH_ALL_BONUS + sb) + (st.streak > 1 ? ' · серия ' + st.streak + ' дн.' : '');
  }
  if (!sum) return;
  chSave(st);
  try {
    let w = JSON.parse(localStorage.getItem('kino_poker') || 'null');
    if (!w || typeof w.chips !== 'number') w = { chips: 500, best: 0, hands: 0, bonus: '', refill: '' };
    w.chips += sum; localStorage.setItem('kino_poker', JSON.stringify(w));
  } catch (e) { /* пусто */ }
  track('chal_claim', sum);
  try { haptic('success'); popMsg('🎞 +' + sum + ' фишек' + bonusTxt); } catch (e) { /* пусто */ }
  chDot(); renderHub('play');
}
function chalCardHtml() {
  const st = chLoad(), tasks = chTasks(st.day), pend = chPending(st, tasks), alive = chStreakAlive(st);
  const doneAll = !!st.all, doneCnt = tasks.filter(t => (st.prog[t.id] || 0) >= t.n).length;
  const rows = tasks.map(t => {
    const p = Math.min(st.prog[t.id] || 0, t.n), done = p >= t.n, cl = !!st.claimed[t.id];
    return `<div class="chal-r${done ? ' done' : ''}${cl ? ' cl' : ''}"><span class="chal-i">${done ? '✅' : t.ico}</span><div class="chal-tx"><b>${esc(t.t)}</b>` +
      `<div class="chal-bar"><i style="width:${Math.round(p / t.n * 100)}%"></i></div></div><em>${cl ? 'получено' : p + '/' + t.n}</em><u>+${t.r}</u></div>`;
  }).join('');
  const foot = pend ? `<button class="chal-btn" id="chal-claim">🎁 Забрать +${pend} 🎞</button>`
    : doneAll ? '<div class="chal-note">🏆 Всё выполнено! Новые задания — завтра</div>'
    : `<div class="chal-note">Выполни все три — бонус +${CH_ALL_BONUS}${alive ? ' и серия дней' : ''} 🎞</div>`;
  return `<div class="chal"><div class="chal-h"><b>🎯 Кино-челлендж дня</b><span class="chal-s">${alive ? '🔥 ' + alive + ' дн.' : doneCnt + '/3'}</span></div>${rows}${foot}</div>`;
}

// <badges>
const CB_KEY = 'kino_cgb';
const CB_LIST = [
  { id: 'bj1', ico: '♠️', t: 'Первая раздача', d: 'Сыграй руку в блэкджек', f: d => (d.bj.hands || 0) >= 1 },
  { id: 'bjn', ico: '🂡', t: 'Натуральный!', d: 'Поймай блэкджек с раздачи', f: d => (d.bj.bj || 0) >= 1 },
  { id: 'bjs', ico: '🔥', t: 'Серия', d: '3 победы подряд в блэкджеке', f: d => (d.bj.bestStreak || 0) >= 3 },
  { id: 'sl1', ico: '🎰', t: 'Первый спин', d: 'Крутани Киноавтомат', f: d => (d.cg.slots || {}).spins >= 1 },
  { id: 'slb', ico: '🎬', t: 'Бонусный сеанс', d: 'Запусти бонус в слотах', f: d => (d.cg.slots || {}).bonus >= 1 },
  { id: 'slw', ico: '💎', t: 'Куш', d: 'Выиграй 100+ за один спин', f: d => (d.cg.slots || {}).best >= 100 },
  { id: 'rl1', ico: '🎡', t: 'Ставки сделаны', d: 'Сыграй раунд рулетки', f: d => (d.cg.rl || {}).spins >= 1 },
  { id: 'rlh', ico: '🎯', t: 'В яблочко', d: 'Угадай точное число в рулетке', f: d => (d.cg.rl || {}).num >= 1 },
  { id: 'mn1', ico: '💣', t: 'Сапёр', d: 'Выиграй 5 раз в Минах', f: d => (d.cg.mn || {}).wins >= 5 },
  { id: 'mnx', ico: '🚀', t: 'Хладнокровие', d: 'Забери множитель ×5 в Минах', f: d => (d.cg.mn || {}).best >= 5 },
  { id: 'dc1', ico: '🎲', t: 'Бросок', d: 'Брось кости', f: d => (d.cg.dc || {}).games >= 1 },
  { id: 'dcl', ico: '🎯', t: 'Снайпер', d: 'Выиграй в костях при шансе до 10%', f: d => (d.cg.dc || {}).low >= 1 },
  { id: 'hl1', ico: '🃏', t: 'Карточный ум', d: 'Сыграй в «Выше/Ниже»', f: d => (d.cg.hl || {}).games >= 1 },
  { id: 'hlr', ico: '🔮', t: 'Предчувствие', d: 'Угадай 5 карт подряд', f: d => (d.cg.hl || {}).bestRun >= 5 },
  { id: 'pl1', ico: '🔮', t: 'Шарик пошёл', d: 'Брось шарик в Плинко', f: d => (d.cg.pl || {}).games >= 1 },
  { id: 'plx', ico: '🌠', t: 'В самый край', d: 'Поймай множитель ×13 и больше в Плинко', f: d => (d.cg.pl || {}).top >= 13 },
  { id: 'rich', ico: '🏦', t: 'Тысячник', d: 'Накопи 1000 фишек', f: d => d.w.chips >= 1000 },
  { id: 'chl', ico: '📅', t: 'Не пропускаю', d: 'Серия заданий дня 7 дней', f: d => (d.ch.streak || 0) >= 7 },
  { id: 'all', ico: '🎪', t: 'Все игры', d: 'Сыграй во все 4 игры казино', f: d => (d.bj.hands || 0) >= 1 && (d.cg.slots || {}).spins >= 1 && (d.cg.rl || {}).spins >= 1 && (d.cg.mn || {}).games >= 1 },
];
function cbRead(k) { try { return JSON.parse(localStorage.getItem(k) || 'null') || {}; } catch (e) { return {}; } }
function cbLoad() { const o = cbRead(CB_KEY); return o && typeof o === 'object' ? o : {}; }
function cbCount() { const o = cbLoad(); return CB_LIST.filter(b => o[b.id]).length; }
function casinoBadgeCheck() {
  try {
    const d = { w: cbRead('kino_poker'), bj: cbRead('kino_bj'), cg: cbRead('kino_cg'), ch: cbRead('kino_chal') };
    if (typeof d.w.chips !== 'number') d.w.chips = 0;
    const got = cbLoad(), fresh = [];
    CB_LIST.forEach(b => { let ok = false; try { ok = !!b.f(d); } catch (e) {} if (ok && !got[b.id]) { got[b.id] = Date.now(); fresh.push(b); } });
    if (fresh.length) {
      try { localStorage.setItem(CB_KEY, JSON.stringify(got)); } catch (e) {}
      fresh.forEach((b, i) => setTimeout(() => { popMsg('🏅 Достижение: ' + b.t); try { haptic('success'); } catch (e) {} }, i * 2300));
      document.querySelectorAll('.hub-bdg').forEach(el => el.textContent = '🏅 ' + cbCount() + '/' + CB_LIST.length);
    }
  } catch (e) {}
}
let _cbT = 0;
function casinoBadgeSoon() { clearTimeout(_cbT); _cbT = setTimeout(casinoBadgeCheck, 6500); }
function casinoShare(text) {
  try {
    document.querySelectorAll('.cg-share').forEach(e => e.remove());
    const b = document.createElement('button');
    b.className = 'cg-share'; b.textContent = '📤 Похвастаться';
    b.onclick = () => {
      const url = 'https://t.me/kapitan_kino_bot/kinokod?startapp=tab_play';
      try { tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text)); } catch (e) { try { window.open('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text), '_blank'); } catch (e2) {} }
      b.remove();
    };
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 9000);
  } catch (e) {}
}
window.casinoShare = casinoShare;
function openBadges() {
  const got = cbLoad();
  const ov = document.createElement('div'); ov.className = 'bdg-ov';
  ov.innerHTML = '<div class="bdg-card"><div class="bdg-h"><b>🏅 Достижения казино</b><button class="bdg-x" aria-label="Закрыть">✕</button></div><div class="bdg-s">' + cbCount() + ' из ' + CB_LIST.length + '</div><div class="bdg-grid">' +
    CB_LIST.map(b => '<div class="bdg-i' + (got[b.id] ? ' on' : '') + '"><span>' + (got[b.id] ? b.ico : '🔒') + '</span><b>' + b.t + '</b><i>' + b.d + '</i></div>').join('') + '</div></div>';
  const close = () => ov.remove();
  ov.onclick = e => { if (e.target === ov) close(); };
  ov.querySelector('.bdg-x').onclick = close;
  document.body.appendChild(ov);
}
// </badges>
const HUBS = {
  play: ['Играть', 'Игры и дуэли знаний — копи баллы и открывай награды', [
    ['🎮 Прямо сейчас', ['capgame', 'arena', 'game', 'poker', 'friends']],
    ['🎰 Казино на фишках', ['blackjack', 'slots', 'roulette', 'mines', 'dice', 'hilo', 'plinko']],
    ['🧠 Каждый день', ['quiz', 'duo', 'tonight']],
    ['🔎 Ещё', ['chain', 'marathon', 'tinder', 'top']],
  ]],
  mine: ['Моё', 'Твоё кино: списки, прогресс и итоги', [
    ['📚 Моё кино', ['library', 'fav', 'mycols']],
    ['🏅 Прогресс', ['week', 'profile', 'achievements', 'year', 'map']],
  ]],
};
const APP_VER = 231;   // совпадает с ?v= в index.html — видно в «Играть/Моё/Ещё», чтобы понимать, какая версия открыта
function casinoBalance() {
  try { const w = JSON.parse(localStorage.getItem('kino_poker') || 'null'); return w && typeof w.chips === 'number' ? w.chips : 500; } catch (e) { return 500; }
}
const HUB_HUE = { plinko: 280, dice: 150, hilo: 30, capgame: 340, arena: 2, game: 28, poker: 150, friends: 210, quiz: 268, duo: 190, tonight: 250, chain: 170, marathon: 20, tinder: 330, top: 45, library: 15, fav: 350, mycols: 200, week: 8, profile: 220, achievements: 45, year: 40, map: 160 };
function hubStatsHtml() {
  let chs = 0, bd = 0;
  try { chs = chStreakAlive(chLoad()); } catch (e) {}
  try { bd = cbCount(); } catch (e) {}
  return `<div class="hub-stats"><span class="hs"><i>🎞</i><b>${casinoBalance()}</b><em>фишек</em></span><span class="hs"><i>🔥</i><b>${chs}</b><em>дней заданий</em></span><span class="hs"><i>🏅</i><b>${bd}/${CB_LIST.length}</b><em>наград</em></span></div>`;
}
function renderHub(name) {
  const box = document.getElementById(name + '-container');
  const cfg = HUBS[name];
  if (!box || !cfg) return;
  const [title, sub, groups] = cfg;
  box.innerHTML = `<div class="hub-head"><h2>${title}</h2><p>${sub}</p></div>` + (name === 'play' ? hubStatsHtml() : '') + (name === 'mine' ? rankCardHtml() : '') + (name === 'play' ? chalCardHtml() : '') + groups.map(([gt, keys]) =>
    `<div class="hub-group${gt.indexOf('Казино') >= 0 ? ' casino' : ''}"><div class="hub-gt">${gt}${gt.indexOf('Казино') >= 0 ? '<span class="hub-bal">🎞 ' + casinoBalance() + '</span><button class="hub-bdg" id="hub-bdg">🏅 ' + cbCount() + '/' + CB_LIST.length + '</button>' : ''}</div><div class="hub-grid">` +
    keys.map((k, i) => {
      const [main, subl] = (k === 'fav' ? ['❤️ Хочу посмотреть', 'твой список'] : (k === 'week' ? ['📅 Моя неделя', 'итог и картинка'] : (k === 'friends' ? ['👥 Играть с друзьями', 'покер в твоём чате'] : (k === 'slots' ? ['🎰 Киноавтомат', 'слоты с бонусом'] : k === 'roulette' ? ['🎡 Рулетка', 'европейская, на фишках'] : k === 'mines' ? ['💣 Мины', 'забери до взрыва'] : k === 'plinko' ? ['🔮 Плинко', 'шарик по колышкам'] : k === 'dice' ? ['🎲 Кости', 'меньше или больше'] : k === 'hilo' ? ['🃏 Выше / Ниже', 'лесенка карт'] : k === 'blackjack' ? ['♠️ Блэкджек', 'до 21 на фишках'] : k === 'poker' ? ['🃏 Кино-покер', 'на фишках, без риска'] : SHEET_LABELS[k])))) || [k, ''];
      const sp = main.indexOf(' ');
      const ico = sp > 0 ? main.slice(0, sp) : '🎬';
      const txt = sp > 0 ? main.slice(sp + 1) : main;
      return `<button class="hub-tile${i === 0 && keys.length % 2 === 1 ? ' hub-wide' : ''}" data-k="${k}" style="--h:${HUB_HUE[k] == null ? 260 : HUB_HUE[k]};--i:${i}"><span class="ht-ico">${ico}</span><b>${esc(txt)}</b><i>${esc(subl)}</i></button>`;
    }).join('') + '</div></div>').join('') + `<div class="hub-ver">версия ${APP_BUILD}</div>`;
  const cb = box.querySelector('#chal-claim'); if (cb) cb.onclick = chClaim;
  const bd = box.querySelector('#hub-bdg'); if (bd) bd.onclick = () => { haptic('light'); casinoBadgeCheck(); openBadges(); };
  box.querySelectorAll('.hub-tile').forEach(b => b.onclick = () => { haptic('light'); if (b.dataset.k === 'week') openWeekCard(); else if (b.dataset.k === 'friends') { openFriendsPoker(); } else if (b.dataset.k === 'poker') { openPokerSafe(); } else if (b.dataset.k === 'blackjack') { openBlackjackSafe(); } else if (b.dataset.k === 'slots') { openCasinoSafe('openSlots'); } else if (b.dataset.k === 'roulette') { openCasinoSafe('openRoulette'); } else if (b.dataset.k === 'mines') { openCasinoSafe('openMines'); } else if (b.dataset.k === 'plinko') { openCasinoSafe('openPlinko'); } else if (b.dataset.k === 'dice') { openCasinoSafe('openDice'); } else if (b.dataset.k === 'hilo') { openCasinoSafe('openHilo'); } else goKey(b.dataset.k); });
}
// v191: покер с друзьями — стол ведёт бот в чате. startgroup даёт выбрать чат, куда добавить бота.
function openPokerSafe() {
  if (typeof window.openPoker === 'function') { try { window.openPoker(); } catch (e) { try { popMsg('Покер не открылся: ' + e.message); } catch (e2) {} } return; }
  try { popMsg('Покер загружается… обнови приложение'); } catch (e) {}
}
function openCasinoSafe(fn) {
  if (typeof window[fn] === 'function') { try { window[fn](); } catch (e) { try { popMsg('Игра не открылась: ' + e.message); } catch (e2) {} } return; }
  try { popMsg('Игра загружается… обнови приложение'); } catch (e) {}
}
function openBlackjackSafe() {
  if (typeof window.openBlackjack === 'function') { try { window.openBlackjack(); } catch (e) { try { popMsg('Блэкджек не открылся: ' + e.message); } catch (e2) {} } return; }
  try { popMsg('Блэкджек загружается… обнови приложение'); } catch (e) {}
}
function openFriendsPoker() {
  const url = 'https://t.me/kapitan_kino_bot?startgroup=poker';
  try { popMsg('В чате с друзьями напиши /poker'); } catch (e) {}
  try { tg.openTelegramLink(url); } catch (e) { window.open(url, '_blank'); }
}
const BN_MAP = {
  catalog: null, play: 'play', mine: 'mine',
  game: 'play', chain: 'play', tinder: 'play', marathon: 'play', quiz: 'play', tonight: 'play',
  library: 'mine', profile: 'mine', achievements: 'mine', year: 'mine', map: 'mine', mycols: 'mine', 'mycol-detail': 'mine',
  cols: 'grid', top: 'grid', trailers: 'grid', news: 'news',
};
const BN_HIDE = ['detail', 'game', 'mycol-detail'];   // v195: тиндер и марафон больше не прячут нижнее меню — иначе из них не выйти
function syncBottomNav(name) {
  const nav = document.getElementById('bnav');
  if (!nav) return;
  let key;
  if (name === 'catalog') key = (view === 'fav') ? 'mine' : (curTab === 'today' ? 'today' : 'grid');
  else if (name === 'detail') key = nav.dataset.key || 'today';
  else key = BN_MAP[name] || 'grid';
  nav.dataset.key = key;
  document.body.dataset.tab = (name === 'catalog') ? (curTab === 'today' ? 'today' : 'afisha') : String(name);
  nav.classList.toggle('bn-off', BN_HIDE.includes(name));
  nav.querySelectorAll('.bn[data-bn]').forEach(b => b.classList.toggle('active', b.dataset.bn === key));
}
(() => {
  document.body.dataset.tab = 'today';
  const nav = document.getElementById('bnav');
  if (!nav) return;
  nav.querySelectorAll('.bn[data-bn]').forEach(b => b.addEventListener('click', () => {
    haptic('light');
    const k = b.dataset.bn;
    if (k === 'more') { const t = document.getElementById('tab-more'); if (t) t.click(); return; }
    if (typeof closeMoreMenu === 'function') closeMoreMenu();
    if (curTab === k) { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {} return; }
    openView(k);
  }));
})();

// ---------- поиск с debounce (не рендерим на каждый символ) ----------
let _searchTimer = null;
document.getElementById('search').addEventListener('input', () => {
  clearTimeout(_searchTimer);
  // Поиск — всегда по ВСЕЙ афише: если был активен жанровый фильтр (например,
  // после тапа по чипу жанра в карточке фильма), сбрасываем его — иначе поиск
  // ищет только внутри одного жанра и выглядит «сломанным».
  if (activeGenre) {
    activeGenre = '';
    renderGenreChips();
  }
  // v89: сброс фильтра по стране при вводе поиска — как и жанровый
  if (activeCountry) {
    activeCountry = '';
    renderCountryChips();
  }
  initSearchHist(document.getElementById('search').value);
  // v100: живая подсказка «код найден» под строкой поиска
  const hint = document.getElementById('code-hint');
  const cq = document.getElementById('search').value.trim();
  if (hint) {
    if (/^\d+$/.test(cq) && cq.length >= 2) {
      const m = ALL.find(x => String(x.code) === cq);
      hint.textContent = m
        ? '🔑 ' + cq + ' · ' + (m.title || '') + ' — Enter откроет'
        : '🤷 Кода ' + cq + ' нет в афише';
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  }
  try { renderSearchSug(); } catch (e) {}
  _searchTimer = setTimeout(renderGrid, 180);
});
document.getElementById('sort').addEventListener('change', renderGrid);
document.getElementById('search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const q = document.getElementById('search').value.trim();
    if (/^\d+$/.test(q)) {
      // v100: ввёл чистый код → Enter = мгновенно открыть карточку
      const m = ALL.find(x => String(x.code) === q);
      if (m) {
        addSearchHist(q); initSearchHist();
        haptic('ok');
        openDetail(m.code);
        return;
      }
    }
    if (q) { addSearchHist(q); initSearchHist(); }
  }
});


// ---------- v186: подсказки поиска (люди, страны, жанры, названия) ----------
function renderSearchSug() {
  const box = document.getElementById('search-sug');
  const inp = document.getElementById('search');
  if (!box || !inp) return;
  const raw = inp.value.trim();
  const q = raw.toLowerCase().replace(/ё/g, 'е');
  if (q.length < 2 || /^\d+$/.test(q) || !ALL.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const n = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е');
  const hit = (t) => { const x = n(t); return x.includes(q) && x !== q; };
  const out = [], seen = new Set();
  const add = (ico, text, kind) => { const k = kind + text; if (!seen.has(k) && out.length < 7) { seen.add(k); out.push({ ico, text }); } };
  const people = new Map();
  ALL.forEach(m => {
    if (m.director && hit(m.director)) people.set(m.director, '🎬');
    (m.actors || []).forEach(a => { if (hit(a) && !people.has(a)) people.set(a, '⭐'); });
  });
  [...people.entries()].slice(0, 3).forEach(([p, ico]) => add(ico, p, 'p'));
  const countries = new Set(), genres = new Set();
  ALL.forEach(m => { (m.countries || []).forEach(c => hit(c) && countries.add(c)); (m.genres || []).forEach(g => hit(g) && genres.add(g)); });
  [...countries].slice(0, 2).forEach(c => add('🌍', c, 'c'));
  [...genres].slice(0, 2).forEach(g => add('🎭', g, 'g'));
  ALL.filter(m => hit(m.title)).slice(0, 3).forEach(m => add('🎞', m.title, 't'));
  if (!out.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = out.map((o, i) => `<button class="sug-chip" data-i="${i}">${o.ico} ${esc(o.text)}</button>`).join('');
  box.querySelectorAll('.sug-chip').forEach(b => b.onclick = () => {
    inp.value = out[+b.dataset.i].text;
    haptic('light');
    box.classList.add('hidden');
    renderGrid();
    try { addSearchHist(inp.value); } catch (e) {}
  });
}

// ---------- поиск/сортировка трейлеров ----------
document.getElementById('trailer-search').addEventListener('input', () => {
  clearTimeout(_trailerSearchTimer);
  _trailerPage = 1;
  if (trailerGenre) { trailerGenre = ''; renderTrailerGenreChips(); }
  _trailerSearchTimer = setTimeout(renderTrailers, 180);
});
document.getElementById('trailer-sort').addEventListener('change', () => { _trailerPage = 1; renderTrailers(); });

// ---------- кнопка «наверх» (glass-дизайн) ----------
const btnTop = document.getElementById('btn-top');
window.addEventListener('scroll', () => {
  btnTop.classList.toggle('hidden', window.scrollY < 700);
}, { passive: true });
btnTop.addEventListener('click', () => {
  haptic('light');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ---------- переключатель темы ----------
document.getElementById('btn-theme').addEventListener('click', toggleTheme);

// ---------- v109: «🔇 без вибраций» ----------
(() => {
  const btn = document.getElementById('btn-mute');
  if (!btn) return;
  const sync = () => { btn.textContent = hapticsEnabled() ? '🔔' : '🔇'; };
  btn.addEventListener('click', () => {
    const off = toggleHaptics();
    sync();
    if (!off) haptic('light');   // при включении вибраций сразу подтверждаем
    try {
      tg.showPopup({
        type: 'ok',
        title: off ? '🔇 Звук и вибрация выключены' : '🔔 Звук и вибрация включены',
        message: off ? 'Приложение больше не вибрирует и не звучит на действиях.' : 'Звуки и тактильный отклик вернулись.',
      });
    } catch (e) {}
  });
  sync();
})();

// ---------- «О боте» ----------
// v136: показываем версию сборки и клиент Telegram. Версию берём из СВОЕГО
// script-тега (?v=N), а не из константы: константу забыли бы поднять при бампе,
// а тег всегда совпадает с реально загруженным бандлом — по нему и видно,
// не отдал ли SW прошлую сборку.
function buildLabel() {
  const tag = document.querySelector('script[src*="script.js?v="]');
  const m = tag && /[?&]v=(\d+)/.exec(tag.getAttribute('src') || '');
  const parts = ['Сборка ' + (m ? 'v' + m[1] : 'неизвестна')];
  try {
    if (tg && tg.version) parts.push('Telegram ' + tg.version);
    if (tg && tg.platform) parts.push(tg.platform);
  } catch (e) { /* диагностика не должна мешать открыть «О боте» */ }
  return parts.join(' · ');
}
document.getElementById('btn-info').addEventListener('click', () => {
  haptic('light');
  const build = document.getElementById('about-build');
  if (build) {
    try { build.textContent = buildLabel(); } catch (e) { build.textContent = ''; }
  }
  document.getElementById('about').classList.remove('hidden');
});
document.getElementById('btn-about-close').addEventListener('click', () =>
  document.getElementById('about').classList.add('hidden'));
document.getElementById('about').addEventListener('click', (e) => {
  if (e.target.id === 'about') document.getElementById('about').classList.add('hidden');
});
document.getElementById('btn-about-channel').addEventListener('click', () =>
  tg.openTelegramLink(CHANNEL_URL));

// 🎲 «Мне повезёт» — случайный фильм
document.getElementById('btn-lucky').addEventListener('click', () => {
  if (!ALL.length) return;
  haptic('light');
  const m = ALL[Math.floor(Math.random() * ALL.length)];
  openDetail(m.code);
});

// ---------- v72: «🎲 Случайный фильм» и «⟳ Обновить афишу» ----------
const rndModal = document.getElementById('random-modal');
document.getElementById('btn-random').addEventListener('click', () => {
  if (!ALL.length) return;
  rndModal.classList.remove('hidden');
  renderRandomMovie();
});
document.getElementById('btn-random-close').addEventListener('click', closeRandom);
document.getElementById('btn-random-again').addEventListener('click', renderRandomMovie);
rndModal.addEventListener('click', (e) => { if (e.target === rndModal) closeRandom(); });

// v90: «▶️ С трейлером» — фильтр афиши по наличию видео
document.getElementById('btn-only-tr').addEventListener('click', () => {
  onlyTrailer = !onlyTrailer;
  haptic('light');
  document.getElementById('btn-only-tr').classList.toggle('active', onlyTrailer);
  renderGrid();
});

// v91: «🟢 Онлайн» — фильтр афиши по прямой ссылке на просмотр
document.getElementById('btn-only-online').addEventListener('click', () => {
  onlyOnline = !onlyOnline;
  haptic('light');
  document.getElementById('btn-only-online').classList.toggle('active', onlyOnline);
  renderGrid();
});

// v90: лайтбокс — закрытие по тапу в любом месте
(function initLightbox() {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  lb.addEventListener('click', () => { lb.classList.add('hidden'); lb.querySelector('img').src = ''; });
})();

const refreshBtn = document.getElementById('btn-refresh');
refreshBtn.addEventListener('click', async () => {
  if (refreshBtn.dataset.busy) return;
  refreshBtn.dataset.busy = '1';
  refreshBtn.classList.add('spin');
  haptic('light');
  try { await loadMovies(); } catch (e) {}
  refreshBtn.classList.remove('spin');
  delete refreshBtn.dataset.busy;
  refreshBtn.textContent = '✓';
  setTimeout(() => { refreshBtn.textContent = '⟳'; }, 1600);
});

// 👇 Pull-to-refresh: на верху страницы тянешь список вниз — данные обновляются
(function () {
  const ind = document.getElementById('ptr');
  if (!ind) return;
  let startY = 0, pulling = false, dist = 0;
  const modalOpen = () => !!document.querySelector('.modal:not(.hidden)');
  document.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0 || modalOpen()) { pulling = false; return; }
    startY = e.touches[0].clientY;
    dist = 0;
    pulling = true;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    dist = e.touches[0].clientY - startY;
    if (dist <= 0) { ind.style.opacity = '0'; return; }
    const d = Math.min(dist, 120);
    ind.textContent = dist > 90 ? '🔄 Отпусти — обновлю' : '↓ Тяни вниз';
    ind.style.transform = 'translate(-50%, ' + Math.round(40 + d * 0.4) + 'px)';
    ind.style.opacity = String(Math.min(d / 80, 1));
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    if (dist > 90) {
      ind.textContent = '⏳ Обновляю…';
      loadMovies().then(() => {
        if (view === 'trailers') { renderTrailerGenreChips(); renderTrailers(); }
        if (view === 'news') renderNews();
        setTimeout(() => { ind.style.opacity = '0'; ind.style.transform = ''; }, 700);
      });
    } else {
      ind.style.opacity = '0';
      ind.style.transform = '';
    }
  });
})();

// 🎬 «Мой Киногод» — карточка-итог прямо в приложении (без сворачивания);
// данные берём из синхронизированного профиля (PROFILE). Если не синхронизирован —
// предлагаем нажать 🔁, а самому можно зайти в бота кнопкой ниже.
function openKinogod() {
  const modal = document.getElementById('kinogod-modal');
  const body = document.getElementById('kinogod-body');
  const p = PROFILE || {};
  const unlocked = getUnlocked();
  const favs = getFavs();
  const pts = p.pts || 0;
  const streak = p.str || 0;
  const level = p.tit || 'Зритель';
  const rank = p.rank;   // может быть undefined
  const topText = (typeof rank === 'number')
    ? `<div class="kg-row"><span>📍 Место в топе</span><b>${rank}</b></div>`
    : '';
  // любимый жанр — локально по избранному/разгаданным
  const genreCount = new Map();
  [...favs, ...unlocked].forEach(code => {
    const m = ALL.find(x => x.code === code);
    (m && Array.isArray(m.genres) ? m.genres : []).forEach(g => genreCount.set(g, (genreCount.get(g) || 0) + 1));
  });
  const topGenre = [...genreCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  body.innerHTML = `
    <div class="kg-head">
      <div class="kg-emoji">🎬</div>
      <h2>Мой Киногод</h2>
      <p class="modal-muted">Твой год в кино — как ты угадываешь фильмы</p>
    </div>
    <div class="kg-stats">
      ${p.uid ? '' : '<p class="kg-hint">🔁 Синхронизируйся с ботом, чтобы сюда добавились уровень и баллы.</p>'}
      <div class="kg-row"><span>🏅 Уровень</span><b>${esc(level)}</b></div>
      <div class="kg-row"><span>💰 Кинобаллы</span><b>${pts}</b></div>
      <div class="kg-row"><span>🔥 Стрик</span><b>${streak} ${streak % 10 === 1 && streak % 100 !== 11 ? 'день' : 'дней'}</b></div>
      <div class="kg-row"><span>🔓 Разгадано кодов</span><b>${unlocked.length}</b></div>
      <div class="kg-row"><span>❤️ В «Моём»</span><b>${favs.length}</b></div>
      ${topText}
      ${topGenre ? `<div class="kg-row"><span>🎯 Любимый жанр</span><b>${esc(topGenre)}</b></div>` : ''}
    </div>
    <div class="kg-actions">
      <button class="btn-primary" id="kg-bot">🤖 Открыть бота</button>
    </div>`;
  modal.classList.remove('hidden');
  document.getElementById('kg-bot')?.addEventListener('click', () => {
    tg.openTelegramLink('https://t.me/kapitan_kino_bot');
  });
}
document.getElementById('btn-cap-game')?.addEventListener('click', () => { haptic('light'); openCaptainGame(); });
document.getElementById('btn-ask-captain')?.addEventListener('click', () => {
  haptic('light');
  sendOrDeepLink({ action: 'ask_captain' });
});
document.getElementById('btn-kinogod').addEventListener('click', () => {
  haptic('light');
  openKinogod();
});
document.getElementById('btn-kinogod-close').addEventListener('click', () => {
  document.getElementById('kinogod-modal').classList.add('hidden');
});
document.getElementById('kinogod-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) document.getElementById('kinogod-modal').classList.add('hidden');
});

// ❓ «Как играть» — короткая справка по кодам и боту
document.getElementById('btn-howto').addEventListener('click', () => {
  haptic('light');
  document.getElementById('howto-modal').classList.remove('hidden');
});
document.getElementById('btn-howto-close').addEventListener('click', () => {
  document.getElementById('howto-modal').classList.add('hidden');
});
document.getElementById('howto-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) document.getElementById('howto-modal').classList.add('hidden');
});

// 🎲 «Фильм на вечер» — модалка подбора по вкусу
const pickModal = document.getElementById('pick-modal');
const pickResults = document.getElementById('pick-results');
function fillPickGenres() {
  const sel = document.getElementById('pick-genre');
  if (!sel || sel.options.length > 1) return;
  const genres = new Set();
  ALL.forEach(m => (m.genres || []).forEach(g => { if (g) genres.add(g); }));
  [...genres].sort((a, b) => a.localeCompare(b, 'ru')).forEach(g => {
    const o = document.createElement('option');
    o.value = g; o.textContent = g;
    sel.appendChild(o);
  });
}
function runPick() {
  const genre = document.getElementById('pick-genre').value;
  const dur = document.getElementById('pick-dur').value;
  const minRate = parseFloat(document.getElementById('pick-rate').value) || 0;
  if (!pickResults) return;
  let pool = [...ALL];
  if (genre) pool = pool.filter(m => (m.genres || []).includes(genre));
  if (dur === 'short') pool = pool.filter(m => (parseInt(m.duration, 10) || 0) > 0 && (parseInt(m.duration, 10) || 0) <= 90);
  else if (dur === 'mid') pool = pool.filter(m => { const d = parseInt(m.duration, 10) || 0; return d > 90 && d <= 120; });
  else if (dur === 'long') pool = pool.filter(m => (parseInt(m.duration, 10) || 0) > 120);
  if (minRate) pool = pool.filter(m => parseFloat(m.rating) >= minRate);
  if (!pool.length) {
    pickResults.innerHTML = '<p class="error">Ничего не нашлось под такие вкусы 😔 Попробуй ослабить фильтры.</p>';
    return;
  }
  const picks = [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const m of shuffled) {
    if (picks.length >= 3) break;
    picks.push(m);
  }
  pickResults.innerHTML = picks.map(m => `
    <div class="pick-card" data-code="${esc(m.code)}">
      <div class="pick-thumb">
        ${m.poster
          ? `<img src="${esc(m.poster)}" alt="" loading="lazy" ${FADE}${dimStyle(m)} onerror="this.style.display='none'"/>`
          : `<div class="trailer-thumb-ph">🎬</div>`}
      </div>
      <div class="pick-info">
        <b>${esc(m.title)}</b>
        <span class="rating">${ratingBadge(m)}${m.duration ? ' · ⏱ ' + esc(fmtDuration(m.duration)) : ''}</span>
        ${m.description ? `<p>${esc((m.description || '').slice(0, 120))}…</p>` : ''}
      </div>
    </div>`).join('');
  pickResults.querySelectorAll('.pick-card').forEach(el =>
    el.addEventListener('click', () => openDetail(el.dataset.code)));
}
document.getElementById('btn-pick').addEventListener('click', () => {
  if (!pickModal) return;
  fillPickGenres();
  pickModal.classList.remove('hidden');
});
const btnPickClose = document.getElementById('btn-pick-close');
if (btnPickClose) btnPickClose.onclick = () => pickModal.classList.add('hidden');
const btnPickRun = document.getElementById('btn-pick-run');
if (btnPickRun) btnPickRun.onclick = () => { haptic('light'); runPick(); };
pickModal.addEventListener('click', (e) => {
  if (e.target === pickModal) pickModal.classList.add('hidden');
});




// ---------- v177: «Моя библиотека» — полки Хочу / Смотрел / Любимое / Разгадано ----------
function renderLibrary() {
  const c = document.getElementById('library-container');
  if (!c) return;
  const byCode = new Map(ALL.map(m => [String(m.code), m]));
  const pickList = (codes) => codes.map(x => byCode.get(String(x))).filter(Boolean);
  const wantC = getFavs(), watchedC = getWatched().map(String), unl = getUnlocked().map(String);
  const rates = getRatings();
  const want = pickList(wantC).filter(m => !watchedC.includes(String(m.code)));
  const watched = pickList(watchedC);
  const loved = Object.keys(rates).filter(k => rates[k] >= 4).sort((a, b) => rates[b] - rates[a]).map(k => byCode.get(k)).filter(Boolean);
  const solved = pickList(unl);
  const shelves = [
    { key: 'want', mode: 'fav', icon: '❤️', title: 'Хочу посмотреть', list: want, empty: 'Нажми ❤️ в карточке фильма — он появится здесь.' },
    { key: 'watched', mode: 'watched', icon: '✅', title: 'Уже смотрел', list: watched, empty: 'Отмечай просмотренные фильмы — соберём твою историю.' },
    { key: 'loved', mode: 'rated', icon: '⭐', title: 'Любимое', list: loved, empty: 'Поставь фильму 4–5 звёзд — он попадёт на эту полку.' },
    { key: 'solved', mode: 'done', icon: '🔑', title: 'Разгаданные коды', list: solved, empty: 'Открой первый код — и полка оживёт.' },
  ];
  const total = new Set([...wantC.map(String), ...watchedC, ...Object.keys(rates), ...unl]).size;
  const card = (m, sh) => `<div class="lb-film" data-code="${esc(m.code)}">
      <div class="lb-poster">${m.poster ? `<img src="${esc(m.poster)}" alt="" loading="lazy" onerror="this.style.display='none'"/>` : '<span>🎬</span>'}${sh.key === 'loved' && rates[m.code] ? `<em class="lb-star">⭐${rates[m.code]}</em>` : ''}${sh.key === 'want' && watchedC.includes(String(m.code)) ? '<em class="lb-star">✓</em>' : ''}</div>
      <b>${esc(m.title)}</b></div>`;
  const tonight = want.length ? want[Math.floor(Math.random() * want.length)] : null;
  c.innerHTML = `
    <h2 class="lb-title">📚 Моя библиотека</h2>
    <div class="lb-stats">
      ${shelves.map(sh => `<div class="lb-stat" data-go="${sh.key}"><b>${sh.list.length}</b><span>${sh.icon} ${sh.key === 'want' ? 'хочу' : sh.key === 'watched' ? 'смотрел' : sh.key === 'loved' ? 'любимое' : 'кодов'}</span></div>`).join('')}
    </div>
    ${tonight ? `<button class="lb-tonight" id="lb-tonight">🎲 Что посмотреть из «Хочу»? <small>выбрать для меня</small></button>` : ''}
    ${total === 0 ? '<p class="lb-empty-all">Полки пока пустые 🙂 Добавляй фильмы в «Хочу», отмечай просмотренное и ставь оценки — здесь вырастет твоя личная кинобиблиотека.</p>' : ''}
    ${shelves.map(sh => `<section class="lb-shelf" id="lb-${sh.key}">
        <div class="lb-head"><span>${sh.icon} ${sh.title} <em>${sh.list.length}</em></span>${sh.list.length ? `<button class="lb-all" data-mode="${sh.mode}">Все →</button>` : ''}</div>
        ${sh.list.length ? `<div class="lb-row">${sh.list.slice(0, 14).map(m => card(m, sh)).join('')}</div>` : `<p class="lb-empty">${sh.empty}</p>`}
      </section>`).join('')}`;
  c.querySelectorAll('.lb-film').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.code)));
  c.querySelectorAll('.lb-all').forEach(b => b.addEventListener('click', () => {
    try { localStorage.setItem(FAV_MODE_KEY, b.dataset.mode); } catch (e) {}
    haptic('light'); openView('fav');
  }));
  c.querySelectorAll('.lb-stat').forEach(el => el.addEventListener('click', () => {
    const t = document.getElementById('lb-' + el.dataset.go); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const tn = c.querySelector('#lb-tonight');
  if (tn) tn.onclick = () => { haptic('ok'); openDetail(tonight.code); };
}

// ---------- v176: «Кино-карта» — фильмы по странам, паспорт путешественника ----------
const MAP_LAND = [   // грубые контуры материков [lon, lat] — стилизованная карта без внешних картографических данных
  [[-168,66],[-141,70],[-110,73],[-80,73],[-62,60],[-55,50],[-67,45],[-76,36],[-81,25],[-97,26],[-97,18],[-87,21],[-83,10],[-78,8],[-86,14],[-105,20],[-117,32],[-124,40],[-125,49],[-135,58],[-150,60],[-165,60]],
  [[-55,60],[-45,60],[-20,70],[-20,82],[-60,82],[-70,76]],
  [[-78,8],[-60,10],[-50,0],[-35,-6],[-40,-22],[-48,-27],[-58,-38],[-65,-42],[-68,-55],[-74,-50],[-72,-30],[-70,-18],[-81,-6],[-80,0]],
  [[-10,36],[-9,43],[-2,48],[5,53],[8,57],[10,59],[5,62],[15,68],[28,71],[40,67],[40,56],[30,46],[28,41],[23,36],[14,38],[8,44],[-5,36]],
  [[-17,21],[-6,36],[10,37],[32,31],[35,28],[43,12],[51,12],[40,-5],[40,-16],[33,-26],[20,-35],[12,-18],[9,-1],[9,4],[-8,4],[-17,14]],
  [[30,46],[40,67],[60,70],[100,77],[140,72],[170,66],[160,55],[142,48],[135,35],[122,30],[120,22],[108,12],[104,2],[98,8],[92,22],[80,8],[72,20],[58,24],[50,30],[36,32],[30,40]],
  [[114,-22],[122,-17],[136,-12],[142,-11],[153,-26],[147,-38],[135,-35],[115,-34]],
];
const MAP_GEO = {   // страна → [lon, lat]
  'сша': [-98, 39], 'канада': [-100, 58], 'мексика': [-102, 23], 'бразилия': [-52, -11], 'аргентина': [-64, -34], 'чили': [-71, -33], 'колумбия': [-74, 4],
  'великобритания': [-2, 54], 'ирландия': [-8, 53], 'франция': [2, 47], 'германия': [10, 51], 'дания': [10, 56], 'испания': [-4, 40], 'португалия': [-8, 39.5],
  'исландия': [-19, 65], 'швейцария': [8, 47], 'италия': [12, 42], 'швеция': [16, 62], 'норвегия': [9, 61], 'финляндия': [26, 64], 'люксембург': [6, 49.8],
  'польша': [19, 52], 'греция': [22, 39], 'бельгия': [4.5, 50.6], 'нидерланды': [5.5, 52.2], 'австрия': [14, 47.5], 'чехия': [15.5, 49.8], 'венгрия': [19, 47],
  'румыния': [25, 46], 'украина': [31, 49], 'беларусь': [28, 53.5], 'россия': [95, 62], 'ссср': [95, 62], 'турция': [35, 39], 'израиль': [35, 31.5], 'иран': [53, 32],
  'индия': [78, 22], 'китай': [104, 35], 'гонконг': [114, 22.3], 'япония': [138, 37], 'южная корея': [128, 36], 'таиланд': [101, 15], 'новая зеландия': [172, -41],
  'австралия': [134, -25], 'юар': [24, -29], 'египет': [30, 27], 'марокко': [-6, 32],
};
let _mapSel = '', _mapZoom = 'world';
function renderMap() {
  const c = document.getElementById('map-container');
  if (!c) return;
  const by = new Map();
  ALL.forEach(m => (m.countries || []).forEach(ct => { const k = String(ct).trim(); if (!k) return; if (!by.has(k)) by.set(k, []); by.get(k).push(m); }));
  let unlocked = []; try { unlocked = getUnlocked().map(String); } catch (e) {}
  const visited = new Set();
  by.forEach((arr, ct) => { if (arr.some(m => unlocked.includes(String(m.code)))) visited.add(ct); });
  const list = [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  const eu = _mapZoom === 'eu';
  const vb = eu ? { x: 155, y: 8, w: 85, h: 52 } : { x: 0, y: 0, w: 360, h: 145 };   // Европа: lon -25..60, lat 72..20
  const px = (lon) => lon + 180, py = (lat) => 80 - lat;
  const poly = MAP_LAND.map(pl => `<polygon class="mp-land" points="${pl.map(([lo, la]) => px(lo) + ',' + py(la)).join(' ')}"/>`).join('');
  const k = eu ? 3.2 : 1;     // в режиме «Европа» пузырьки относительно меньше
  const dots = list.filter(([ct]) => MAP_GEO[ct.toLowerCase()]).map(([ct, arr]) => {
    const [lo, la] = MAP_GEO[ct.toLowerCase()];
    if (eu && (lo < -25 || lo > 62 || la < 20 || la > 74)) return '';
    const r = (Math.min(15, 3.2 + Math.sqrt(arr.length) * 1.7)) / k;
    const cls = 'mp-dot' + (visited.has(ct) ? ' seen' : '') + (_mapSel === ct ? ' sel' : '');
    return `<g class="${cls}" data-c="${esc(ct)}"><circle cx="${px(lo)}" cy="${py(la)}" r="${r.toFixed(1)}"/>${r >= (eu ? 2.2 : 6) ? `<text x="${px(lo)}" y="${(py(la) + (eu ? 0.9 : 2.2)).toFixed(1)}" font-size="${eu ? 2.6 : 6.5}">${arr.length}</text>` : ''}</g>`;
  }).join('');
  const grat = [-60, -30, 0, 30, 60].map(la => `<line class="mp-grat" x1="0" x2="360" y1="${py(la)}" y2="${py(la)}"/>`).join('');
  const sel = _mapSel && by.get(_mapSel) ? by.get(_mapSel).slice().sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0)) : null;
  const pct = list.length ? Math.round(visited.size / list.length * 100) : 0;
  c.innerHTML = `
    <h2 class="mp-title">🌍 Кино-карта</h2>
    <div class="mp-pass"><div class="mp-pass-top"><b>🧳 Паспорт: ${visited.size} из ${list.length} стран</b><span>${pct}%</span></div>
      <div class="mp-bar"><i style="width:${pct}%"></i></div>
      <p>Открывай коды фильмов из новых стран — они загораются золотом.</p></div>
    <div class="mp-zoom"><button class="chip${eu ? '' : ' active'}" data-z="world">🌍 Мир</button><button class="chip${eu ? ' active' : ''}" data-z="eu">🇪🇺 Европа</button></div>
    <svg class="mp-svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMid meet">${grat}${poly}${dots}</svg>
    <div class="mp-chips">${list.map(([ct, arr]) => `<button class="chip${_mapSel === ct ? ' active' : ''}${visited.has(ct) ? ' mp-seen' : ''}" data-c="${esc(ct)}">${flagOf(ct)} ${esc(ct)} <em>${arr.length}</em></button>`).join('')}</div>
    ${sel ? `<h3 class="mp-sel-title">${flagOf(_mapSel)} ${esc(_mapSel)} · ${sel.length}</h3>
      <div class="mp-films">${sel.map(m => `<div class="mp-film" data-code="${esc(m.code)}"><div class="mp-poster">${m.poster ? `<img src="${esc(m.poster)}" alt="" loading="lazy" onerror="this.style.display='none'"/>` : '<span>🎬</span>'}${unlocked.includes(String(m.code)) ? '<em class="mp-got">✓</em>' : ''}</div><b>${esc(m.title)}</b><i>${esc([m.year, m.rating ? '⭐ ' + m.rating : ''].filter(Boolean).join(' · '))}</i></div>`).join('')}</div>`
      : '<p class="mp-hint">Тапни страну на карте или в списке — покажу её фильмы 🎬</p>'}`;
  const pick = (ct) => { _mapSel = (_mapSel === ct) ? '' : ct; haptic('light'); renderMap(); const t = document.querySelector('.mp-sel-title'); if (t && _mapSel) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  c.querySelectorAll('.mp-dot').forEach(g => g.addEventListener('click', () => pick(g.dataset.c)));
  c.querySelectorAll('.mp-chips .chip').forEach(b => b.addEventListener('click', () => pick(b.dataset.c)));
  c.querySelectorAll('.mp-zoom .chip').forEach(b => b.addEventListener('click', () => { _mapZoom = b.dataset.z; haptic('light'); renderMap(); }));
  c.querySelectorAll('.mp-film').forEach(el => el.addEventListener('click', () => { detailOrigin = 'map'; openDetail(el.dataset.code); }));
}

// ---------- v174: «Кино-арена» — дуэли знаний на 3 жизни ----------
const ARENA_BEST_KEY = 'kino_arena_best';
function openArena() {
  let ov = document.getElementById('arena');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'arena'; ov.className = 'arena hidden';
    document.body.appendChild(ov);
  }
  ov.classList.remove('hidden');
  document.body.classList.add('no-scroll');
  const close = () => { stopTimer(); ov.classList.add('hidden'); document.body.classList.remove('no-scroll'); };
  const num = (v) => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : 0; };
  // «Дуэль дня»: один и тот же набор вопросов для всех в этот день (генератор от даты)
  const DAILY_Q = 12, DAILY_KEY = 'kino_arena_daily';
  const dayKey = capDayStr(new Date());
  let daily = false, rnd = Math.random;
  const seededRnd = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let dailyDone = null; try { const d = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null'); if (d && d.day === dayKey) dailyDone = d; } catch (e) {}
  const pickN = (arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
  const pool = ALL.filter(m => m.title && num(m.rating) > 0 && parseInt(m.year, 10) > 1900).sort((a, b) => String(a.code).localeCompare(String(b.code)));
  let best = 0; try { best = parseInt(localStorage.getItem(ARENA_BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let lives = 3, score = 0, streak = 0, asked = 0, seen = new Set(), busy = false, maxStreak = 0;
  let hints = 1, tm = null, t0 = 0, tLimit = 12;      // 💡 подсказки 50/50 и таймер вопроса
  const stopTimer = () => { if (tm) { clearTimeout(tm); tm = null; } };

  const cardH = (m, extra = '') => `<div class="ar-film" data-code="${esc(m.code)}">
      <div class="ar-poster">${m.poster ? `<img src="${esc(m.poster)}" alt="" onerror="this.style.display='none'"/>` : '<span>🎬</span>'}</div>
      <b>${esc(m.title)}</b><i class="ar-val">${extra}</i></div>`;

  // генераторы вопросов: {q, kind:'duel'|'opts', ...}
  const gens = {
    rating() { const [a, b] = pickN(pool, 2); if (Math.abs(num(a.rating) - num(b.rating)) < 0.3) return null;
      return { kind: 'duel', q: 'Какой фильм выше по рейтингу?', films: [a, b], win: num(a.rating) > num(b.rating) ? a : b, show: m => '⭐ ' + num(m.rating).toFixed(1) }; },
    older() { const [a, b] = pickN(pool, 2); if (Math.abs(parseInt(a.year, 10) - parseInt(b.year, 10)) < 3) return null;
      return { kind: 'duel', q: 'Какой фильм вышел раньше?', films: [a, b], win: parseInt(a.year, 10) < parseInt(b.year, 10) ? a : b, show: m => '📅 ' + m.year }; },
    longer() { const p2 = pool.filter(m => parseInt(m.duration, 10) > 0); if (p2.length < 2) return null; const [a, b] = pickN(p2, 2);
      if (Math.abs(parseInt(a.duration, 10) - parseInt(b.duration, 10)) < 15) return null;
      return { kind: 'duel', q: 'Какой фильм идёт дольше?', films: [a, b], win: parseInt(a.duration, 10) > parseInt(b.duration, 10) ? a : b, show: m => '⏱ ' + fmtDuration(m.duration) }; },
    director() { const p2 = pool.filter(m => m.director); if (p2.length < 4) return null; const m = pickN(p2, 1)[0];
      const others = [...new Set(p2.filter(x => x.director !== m.director).map(x => x.director))]; if (others.length < 2) return null;
      const opts = pickN([m.director, ...pickN(others, 2)], 3);
      return { kind: 'opts', q: `Кто снял «${m.title}»?`, film: m, opts, ans: m.director }; },
    actor() { const p2 = pool.filter(m => (m.actors || []).length); if (p2.length < 4) return null; const m = pickN(p2, 1)[0]; const act = m.actors[0];
      const wrong = pool.filter(x => !(x.actors || []).includes(act) && x.code !== m.code); if (wrong.length < 2) return null;
      const opts = pickN([m, ...pickN(wrong, 2)], 3);
      return { kind: 'opts', q: `В каком фильме снимался(ась) ${act}?`, opts: opts.map(x => x.title), ans: m.title }; },
    cast() { const p2 = pool.filter(m => (m.actors || []).length >= 2); if (p2.length < 4) return null; const m = pickN(p2, 1)[0];
      const [a1, a2] = m.actors;
      const wrong = pool.filter(x => x.code !== m.code && !(x.actors || []).includes(a1) && !(x.actors || []).includes(a2)); if (wrong.length < 2) return null;
      const opts = pickN([m, ...pickN(wrong, 2)], 3);
      return { kind: 'opts', q: `Какой фильм с ${a1} и ${a2}?`, opts: opts.map(x => x.title), ans: m.title }; },
    country() { const p2 = pool.filter(m => (m.countries || []).length); if (p2.length < 4) return null; const m = pickN(p2, 1)[0]; const c0 = m.countries[0];
      const others = [...new Set(pool.flatMap(x => x.countries || []).filter(c => c && !(m.countries || []).includes(c)))]; if (others.length < 2) return null;
      const opts = pickN([c0, ...pickN(others, 2)], 3);
      return { kind: 'opts', q: `Какая страна сняла «${m.title}»?`, film: m, opts, ans: c0 }; },
    decade() { const p2 = pool.filter(x => !/\d{4}/.test(x.title)); if (p2.length < 4) return null; const m = pickN(p2, 1)[0]; const y = parseInt(m.year, 10); const d0 = Math.floor(y / 10) * 10;
      const decs = [d0 - 10, d0 + 10, d0 - 20, d0 + 20].filter(d => d >= 1920 && d <= new Date().getFullYear());
      if (decs.length < 2) return null;
      const opts = pickN([d0, ...pickN(decs, 2)], 3).sort((a, b) => a - b).map(d => d + '-е');
      return { kind: 'opts', q: `В каком десятилетии вышел «${m.title}»?`, film: m, opts, ans: d0 + '-е' }; },
  };
  const next = () => {
    // с ростом серии добавляем более трудные типы
    const kinds = (daily ? asked < 4 : streak < 3) ? ['rating', 'older', 'longer'] : ['rating', 'older', 'longer', 'director', 'actor', 'cast', 'country', 'decade', 'director', 'actor', 'cast'];
    for (let i = 0; i < 120; i++) {
      const g = gens[kinds[Math.floor(rnd() * kinds.length)]]();
      if (!g) continue;
      const key = g.q; if (seen.has(key)) continue; seen.add(key); return g;
    }
    // запасной вариант: сравнение рейтингов без порога, чтобы раунд не обрывался на редких данных
    for (let i = 0; i < 40; i++) {
      const [a, b] = pickN(pool, 2);
      if (num(a.rating) === num(b.rating)) continue;
      const key = 'r:' + a.code + b.code; if (seen.has(key)) continue; seen.add(key);
      return { kind: 'duel', q: 'Какой фильм выше по рейтингу?', films: [a, b], win: num(a.rating) > num(b.rating) ? a : b, show: m => '⭐ ' + num(m.rating).toFixed(1) };
    }
    return null;
  };

  const head = () => `<div class="ar-top"><button class="ar-x" id="ar-x">✕</button>
      <div class="ar-lives">${'❤️'.repeat(lives)}${'🖤'.repeat(3 - lives)}</div>
      <div class="ar-score">${score}${streak >= 3 ? ` <span class="ar-streak">🔥${streak}</span>` : ''}</div></div>`;

  const bind = () => { const x = ov.querySelector('#ar-x'); if (x) x.onclick = close; };

  const finish = () => {
    stopTimer();
    if (daily && lives > 0 && asked >= DAILY_Q) score += 50;       // прошёл все вопросы дуэли — бонус
    const rec = !daily && score > best;
    if (!daily && score > best) { best = score; try { localStorage.setItem(ARENA_BEST_KEY, String(score)); } catch (e) {} }
    let rightN = 0;
    if (daily) {
      rightN = Math.max(0, asked - (3 - lives));
      dailyDone = { day: dayKey, score, right: rightN, total: asked };
      try { localStorage.setItem(DAILY_KEY, JSON.stringify(dailyDone)); } catch (e) {}
    }
    haptic(rec ? 'ok' : 'light');
    if (rec) confetti(30);
    try { scheduleCloudSync(3000); } catch (e) {}
    try { checkRankUp(); } catch (e) {}
    const title = score >= 300 ? 'Киноман 🏆' : score >= 150 ? 'Знаток 🎬' : score >= 60 ? 'Зритель 🍿' : 'Новичок 🎟';
    ov.innerHTML = `${head()}<div class="ar-end"><div class="ar-end-emoji">${rec ? '🏆' : '🎬'}</div>
      <h2>${daily ? 'Дуэль дня пройдена' : rec ? 'Новый рекорд!' : 'Игра окончена'}</h2>
      <div class="ar-stars">${[60, 150, 300].map(t => `<i class="${score >= t ? 'on' : ''}">★</i>`).join('')}</div>
      <div class="ar-end-score" id="ar-sc">0</div><div class="ar-end-title">${title}${!daily && best && !rec ? ` · рекорд ${best}` : ''}</div>
      <div class="ar-stats"><span><b>${Math.max(0, asked - (3 - lives))}</b><em>верных</em></span><span><b>${asked ? Math.round(Math.max(0, asked - (3 - lives)) / asked * 100) : 0}%</b><em>точность</em></span><span><b>${maxStreak}</b><em>серия 🔥</em></span></div>
      ${(() => { const nx = score >= 300 ? 0 : score >= 150 ? 300 : score >= 60 ? 150 : 60; return nx ? `<div class="ar-next"><div><i style="width:${Math.min(100, Math.round(score / nx * 100))}%"></i></div><em>до следующего звания — ${nx - score} очков</em></div>` : '<div class="ar-next"><em>Высшее звание получено 🏆</em></div>'; })()}
      <div class="ar-end-btns"><button class="btn-primary" id="ar-again">🔄 Ещё раз</button><button class="btn-secondary" id="ar-share">📤 Поделиться</button></div></div>`;
    bind();
    { const el = ov.querySelector('#ar-sc'); const t0 = performance.now(); const tick = (t) => { const k = Math.min(1, (t - t0) / 900); if (el && el.isConnected) { el.textContent = Math.round(score * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); } }; requestAnimationFrame(tick); }
    ov.querySelector('#ar-again').onclick = () => { lives = 3; score = 0; streak = 0; maxStreak = 0; asked = 0; hints = 1; seen = new Set(); daily = false; rnd = Math.random; render(); };
    ov.querySelector('#ar-share').onclick = () => {
      const t = daily
        ? `⚔️ Дуэль дня ${dayKey.slice(8)}.${dayKey.slice(5, 7)}: ${score} очков, верно ${rightN} из ${asked}. Одни и те же вопросы для всех — побьёшь?`
        : `⚔️ Кино-арена: ${score} очков (${title})! Сможешь больше?`;
      const u = 'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/kapitan_kino_bot') + '&text=' + encodeURIComponent(t);
      try { tg.openTelegramLink(u); } catch (e) { window.open(u, '_blank'); }
    };
  };

  const answer = (g, ok, picked, reveal) => {
    if (busy) return; busy = true; asked++; stopTimer();
    const quick = ok && (Date.now() - t0) < tLimit * 400;       // быстрый ответ — бонус
    if (ok) { streak++; if (streak > maxStreak) maxStreak = streak; score += 10 + Math.min(streak, 10) * 2 + (quick ? 5 : 0); haptic('ok');
      if (streak % 5 === 0 && hints < 2) hints++; }
    else { streak = 0; lives--; haptic('medium'); }
    const bar0 = ov.querySelector('.ar-timer i'); if (bar0) bar0.style.animationPlayState = 'paused';
    if (ok) popMsg('+' + (10 + Math.min(streak, 10) * 2 + (quick ? 5 : 0)));
    reveal(ok);
    const sc = ov.querySelector('.ar-score'); if (sc) sc.textContent = score;
    setTimeout(() => { busy = false; if (lives <= 0 || (daily && asked >= DAILY_Q)) finish(); else render(); }, ok ? 900 : 1500);
  };

  const timerBar = () => {
    tLimit = Math.max(7, 13 - Math.floor(streak / 3));     // с серией времени на ответ меньше
    return `<div class="ar-timer"><i style="animation-duration:${tLimit}s"></i></div>`;
  };
  const startTimer = (g) => {
    t0 = Date.now(); stopTimer();
    tm = setTimeout(() => {
      if (busy) return;
      if (g.kind === 'duel') answer(g, false, null, () => {
        ov.querySelectorAll('.ar-film').forEach(e2 => {
          const ff = g.films.find(x => x.code === e2.dataset.code);
          e2.querySelector('.ar-val').textContent = g.show(ff);
          e2.classList.add(ff === g.win ? 'ok' : 'bad');
        });
      });
      else answer(g, false, null, () => ov.querySelectorAll('.ar-opt').forEach(x => { x.disabled = true; if (x.dataset.o === g.ans) x.classList.add('ok'); }));
    }, tLimit * 1000);
  };
  const render = () => {
    const g = next();
    if (!g) { finish(); return; }
    if (g.kind === 'duel') {
      ov.innerHTML = `${head()}${timerBar()}<div class="ar-body"><div class="ar-q">${esc(g.q)}</div>
        <div class="ar-duel">${g.films.map(f => cardH(f)).join('')}</div></div>`;
      bind(); startTimer(g);
      ov.querySelectorAll('.ar-film').forEach(el => el.onclick = () => {
        const f = g.films.find(x => x.code === el.dataset.code);
        answer(g, f === g.win, f, (ok) => {
          ov.querySelectorAll('.ar-film').forEach(e2 => {
            const ff = g.films.find(x => x.code === e2.dataset.code);
            e2.querySelector('.ar-val').textContent = g.show(ff);
            e2.classList.add(ff === g.win ? 'ok' : 'bad');
          });
        });
      });
    } else {
      ov.innerHTML = `${head()}${timerBar()}<div class="ar-body"><div class="ar-q">${esc(g.q)}</div>
        ${g.film ? `<div class="ar-one">${cardH(g.film)}</div>` : ''}
        <div class="ar-opts">${g.opts.map(o => `<button class="ar-opt" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
        ${hints > 0 ? `<button class="ar-hint" id="ar-hint">💡 Убрать лишнее (${hints})</button>` : ''}</div>`;
      bind(); startTimer(g);
      const hb = ov.querySelector('#ar-hint');
      if (hb) hb.onclick = () => {
        if (busy || hints < 1) return;
        const wrong = [...ov.querySelectorAll('.ar-opt')].filter(x => x.dataset.o !== g.ans && !x.disabled);
        if (wrong.length < 2) return;
        hints--; haptic('light');
        const w = wrong[Math.floor(Math.random() * wrong.length)]; w.disabled = true; w.classList.add('gone');
        hb.remove();
      };
      ov.querySelectorAll('.ar-opt').forEach(b => b.onclick = () => {
        answer(g, b.dataset.o === g.ans, b.dataset.o, (ok) => {
          ov.querySelectorAll('.ar-opt').forEach(x => { x.disabled = true; if (x.dataset.o === g.ans) x.classList.add('ok'); });
          if (!ok) b.classList.add('bad');
        });
      });
    }
  };

  if (pool.length < 6) { ov.innerHTML = `${head()}<div class="ar-end"><h2>Мало фильмов</h2><p>Загляни позже 🙂</p></div>`; bind(); return; }
  // заставка
  ov.innerHTML = `<div class="ar-top"><button class="ar-x" id="ar-x">✕</button><div></div><div></div></div>
    <div class="ar-end"><div class="ar-end-emoji">⚔️</div><h2>Кино-арена</h2>
    <p class="ar-lead">Отвечай на вопросы о кино — чем быстрее и длиннее серия, тем больше очков.</p>
    <div class="ar-rules"><span><i>❤️</i><b>3 жизни</b><em>ошибка — минус одна</em></span><span><i>⏱</i><b>Таймер</b><em>на каждый вопрос</em></span><span><i>💡</i><b>Подсказка</b><em>за каждые 5 верных</em></span></div>
    ${best ? `<p class="ar-best">Твой рекорд: <b>${best}</b></p>` : ''}
    <div class="ar-end-btns ar-col"><button class="btn-primary" id="ar-daily">📅 Дуэль дня${dailyDone ? ` · ${dailyDone.score}` : ''}</button><button class="btn-secondary" id="ar-go">Свободная игра</button></div>
    <p class="ar-note">${dailyDone ? 'Сегодня уже сыграно — можно ещё раз для тренировки.' : '12 вопросов, одинаковых для всех сегодня. Сравни счёт с друзьями!'}</p></div>`;
  bind();
  ov.querySelector('#ar-go').onclick = () => { haptic('light'); daily = false; rnd = Math.random; render(); };
  ov.querySelector('#ar-daily').onclick = () => {
    haptic('light'); daily = true;
    rnd = seededRnd(parseInt(dayKey.replace(/-/g, ''), 10) + pool.length * 7);
    lives = 3; score = 0; streak = 0; maxStreak = 0; asked = 0; hints = 1; seen = new Set();
    render();
  };
}

// ---------- v166: «Выбор на двоих» — каждый отмечает свои жанры, ищем фильм на пересечении ----------
let _duoA = new Set(), _duoB = new Set(), _duoSeed = 0;
function openDuo() {
  let md = document.getElementById('duo-modal');
  if (!md) {
    md = document.createElement('div');
    md.id = 'duo-modal'; md.className = 'modal hidden';
    md.innerHTML = `<div class="modal-card duo-card">
      <button class="modal-close" id="duo-close">✕</button>
      <h2>👥 Выбор на двоих</h2>
      <p class="modal-muted">Каждый отмечает, что хочет. Найду фильм, который зайдёт обоим.</p>
      <div class="duo-who">🙋 Первый</div><div class="duo-chips" id="duo-a"></div>
      <div class="duo-who">🙋‍♀️ Второй</div><div class="duo-chips" id="duo-b"></div>
      <button class="btn-primary" id="duo-run">🎬 Подобрать на двоих</button>
      <div id="duo-results" class="pick-results"></div>
    </div>`;
    document.body.appendChild(md);
    md.addEventListener('click', (e) => { if (e.target === md) md.classList.add('hidden'); });
    md.querySelector('#duo-close').onclick = () => md.classList.add('hidden');
    md.querySelector('#duo-run').onclick = () => { haptic('light'); _duoSeed++; runDuo(); };
  }
  const cnt = new Map();
  ALL.forEach(m => (m.genres || []).forEach(g => { if (g) cnt.set(g, (cnt.get(g) || 0) + 1); }));
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);
  const fill = (id, set) => {
    const box = md.querySelector(id);
    box.innerHTML = top.map(g => `<button class="duo-chip${set.has(g) ? ' on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('');
    box.querySelectorAll('.duo-chip').forEach(b => b.onclick = () => {
      haptic('light');
      if (set.has(b.dataset.g)) set.delete(b.dataset.g); else set.add(b.dataset.g);
      b.classList.toggle('on');
    });
  };
  fill('#duo-a', _duoA); fill('#duo-b', _duoB);
  md.classList.remove('hidden');
}
function runDuo() {
  const out = document.getElementById('duo-results');
  if (!out) return;
  if (!_duoA.size || !_duoB.size) { out.innerHTML = '<p class="error">Пусть каждый отметит хотя бы один жанр 🙂</p>'; return; }
  // детерминированный «рандом» на нажатие: один и тот же набор не прыгает при перерисовке
  const rnd = (code) => { let h = _duoSeed * 2654435761; for (const ch of String(code)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; };
  const hits = (m, set) => (m.genres || []).filter(g => set.has(g));
  const rows = ALL.map(m => {
    const a = hits(m, _duoA), b = hits(m, _duoB);
    const both = a.length && b.length;
    const same = [...new Set(a.filter(g => b.includes(g)))];
    const base = (parseFloat(m.rating) || 6) / 10;
    return { m, a, b, both, same, score: (both ? 2 : (a.length || b.length) ? 1 : 0) + (same.length ? 0.6 : 0) + base * 0.7 + rnd(m.code) * 0.5 };
  }).filter(r => r.score >= 1).sort((x, y) => y.score - x.score).slice(0, 3);
  if (!rows.length) { out.innerHTML = '<p class="error">Ничего не нашлось 😔 Попробуйте отметить больше жанров.</p>'; return; }
  out.innerHTML = rows.map(r => {
    const why = r.both
      ? (r.same.length ? `✅ Оба любят: ${r.same.map(esc).join(', ')}` : `✅ ${r.a.map(esc).join(', ')} + ${r.b.map(esc).join(', ')}`)
      : `🤝 Компромисс: подходит ${r.a.length ? 'первому' : 'второму'} (${(r.a.length ? r.a : r.b).map(esc).join(', ')})`;
    return `<div class="pick-card" data-code="${esc(r.m.code)}">
      <div class="pick-thumb">${r.m.poster ? `<img src="${esc(r.m.poster)}" alt="" loading="lazy" onerror="this.style.display='none'"/>` : '<div class="trailer-thumb-ph">🎬</div>'}</div>
      <div class="pick-info"><b>${esc(r.m.title)}</b>
        <span class="rating">${ratingBadge(r.m)}${r.m.duration ? ' · ⏱ ' + esc(fmtDuration(r.m.duration)) : ''}</span>
        <p class="duo-why">${why}</p></div></div>`;
  }).join('') + '<div class="duo-btns"><button class="btn-primary duo-again" id="duo-again">🔄 Ещё варианты</button><button class="btn-primary duo-share" id="duo-share">📤 Отправить</button></div>';
  out.querySelectorAll('.pick-card').forEach(el => el.addEventListener('click', () => {
    document.getElementById('duo-modal').classList.add('hidden'); openDetail(el.dataset.code);
  }));
  out.querySelector('#duo-share').onclick = () => {
    haptic('light');
    const pick = rows[0];
    const text = `🎬 Нашли фильм на вечер: «${pick.m.title}»${pick.m.year ? ' (' + pick.m.year + ')' : ''}${pick.m.rating ? ' · ⭐ ' + pick.m.rating : ''}\n` +
      `${[...rows.slice(1)].map(r => '• ещё вариант: ' + r.m.title).join('\n')}${rows.length > 1 ? '\n' : ''}Подбирал Капитан Кино 👥`;
    const u = 'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/kapitan_kino_bot') + '&text=' + encodeURIComponent(text);
    try { tg.openTelegramLink(u); } catch (e) { window.open(u, '_blank'); }
  };
  out.querySelector('#duo-again').onclick = () => { haptic('light'); _duoSeed++; runDuo(); };
}

// ---------- Трейлер: полноэкранный просмотр ----------
// v132: на телефоне трейлер не разворачивался, а кнопка «⛶» молча ничего не
// делала. Причина: браузерный Fullscreen API (Element.requestFullscreen) в
// WebView Telegram на iOS не поддерживается вообще, а iframe с YouTube сам
// развернуться не может. Теперь сначала разворачиваем сам мини-апп: у Telegram
// (Bot API 8.0+) есть свой полноэкранный режим tg.requestFullscreen() — он
// убирает полуэкран/шапку, и плеер занимает весь экран телефона. Дальше по
// цепочке — браузерный fullscreen (ПК и веб), webkitEnterFullscreen для нашего
// mp4 (iOS) и, как последний шов для YouTube-iframe на iOS, открытие трейлера
// в приложении YouTube: там полноэкранный плеер работает всегда.
const APP_FS_MIN_VERSION = '8.0';
const FS_BUILD = 'v133'; // версия логики фуллскрина — видна в диагностике (долгое нажатие на «⛶»)
let _appFsByUs = false;        // развернули мини-апп сами — сами же и свернём
let _appFsOff = false;         // клиент точно не умеет (два UNSUPPORTED подряд)
let _appFsFails = 0;
let _swipesWereDisabled = false;

function _appFsAvailable() {
  try {
    return !_appFsOff && !!tg && typeof tg.requestFullscreen === 'function'
      && !!tg.isVersionAtLeast && tg.isVersionAtLeast(APP_FS_MIN_VERSION);
  } catch (e) { return false; }
}

function _appInFs() {
  try { return !!tg.isFullscreen; } catch (e) { return false; }
}

function enterAppFullscreen() {
  if (!_appFsAvailable() || _appInFs()) return;
  try {
    // В полноэкранном режиме вертикальный свайп выходит из него, а он у нас
    // занят (свайпы в марафоне/шторке) — пока трейлер открыт, свайпы гасим.
    if (typeof tg.disableVerticalSwipes === 'function') {
      tg.disableVerticalSwipes(); _swipesWereDisabled = true;
    }
    tg.requestFullscreen();
    _appFsByUs = true;
  } catch (e) { /* пусто */ }
}

function exitAppFullscreen() {
  if (!_appFsByUs) return;
  _appFsByUs = false;
  try {
    if (_appInFs() && typeof tg.exitFullscreen === 'function') tg.exitFullscreen();
  } catch (e) { /* пусто */ }
  try {
    if (_swipesWereDisabled && typeof tg.enableVerticalSwipes === 'function') {
      tg.enableVerticalSwipes();
    }
  } catch (e) { /* пусто */ }
  _swipesWereDisabled = false;
}

function _syncTrailerFs() {
  const fsBtn = document.getElementById('btn-trailer-fs');
  if (!fsBtn) return;
  const inDeviceFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  const inAnyFs = inDeviceFs || _appInFs();
  fsBtn.textContent = inAnyFs ? '⤢' : '⛶';
  fsBtn.title = inAnyFs ? 'Свернуть' : 'На весь экран';
  // Прячем кнопку только в «настоящем» fullscreen браузера (там поверх плеера
  // ничего не нужно); в полноэкранном режиме Telegram она остаётся — ею же
  // можно вернуться назад.
  fsBtn.classList.toggle('hidden', inDeviceFs);
}

// v133: возвращает Promise<boolean> — удалось развернуть или нет. Раньше отказ
// вебвью проглатывался (.catch(() => {})) и на Android кнопка «молчала», не
// доходя до фолбэков: requestFullscreen в WebView Telegram может существовать,
// но отклоняться (нет разрешения на fullscreen в чужом вебвью).
function _requestFs(el) {
  return new Promise((resolve) => {
    try {
      if (!el) { resolve(false); return; }
      if (el.requestFullscreen) {
        const p = el.requestFullscreen();
        if (p && typeof p.then === 'function') {
          p.then(() => resolve(true), () => resolve(false));
          return;
        }
        resolve(true); return;
      }
      if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); resolve(true); return; }
      if (el.msRequestFullscreen) { el.msRequestFullscreen(); resolve(true); return; }
    } catch (e) { /* пусто */ }
    resolve(false);
  });
}

// v133: диагностика — долгое нажатие (или правый клик) на «⛶» показывает,
// что умеет клиент. Если кнопка «молчит» и это не помогло — телефон ещё
// гоняет старый скрипт из кэша (сборка в отчёте будет старой).
function _showFsDiag() {
  const frame = document.getElementById('trailer-frame');
  const video = document.getElementById('trailer-video');
  const root = document.documentElement;
  const yt = !!(frame && !frame.classList.contains('hidden'));
  const mp4 = !!(video && !video.classList.contains('hidden'));
  let min8 = '?';
  try { min8 = !!(tg && tg.isVersionAtLeast && tg.isVersionAtLeast(APP_FS_MIN_VERSION)); } catch (e) { min8 = 'err'; }
  const lines = [
    'сборка: ' + FS_BUILD,
    'tg: ' + ((tg && tg.version) || '?') + ' / ' + ((tg && tg.platform) || '?'),
    'tg.requestFullscreen: ' + (tg ? typeof tg.requestFullscreen : 'нет tg'),
    'мин. ' + APP_FS_MIN_VERSION + ': ' + min8,
    'appFs: off=' + _appFsOff + ' fails=' + _appFsFails,
    'browserFs: ' + (root ? (typeof root.requestFullscreen) + '/' + (typeof root.webkitRequestFullscreen) : 'нет'),
    'трейлер: ' + (yt ? 'youtube' : (mp4 ? 'mp4' : 'нет')),
  ];
  const text = lines.join('\n');
  try { tg.showAlert(text); return; } catch (e) { /* пусто */ }
  try { alert(text); } catch (e2) { /* пусто */ }
}

function _exitFs() {
  try {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  } catch (e) { /* пусто */ }
}

// iOS: YouTube-iframe развернуть из вебвью нельзя — предлагаем открыть трейлер
// в приложении YouTube (там плеер полноэкранный и с поворотом).
function _offerTrailerInYouTube() {
  const frame = document.getElementById('trailer-frame');
  const src = (frame && frame.getAttribute('src')) || '';
  const match = src.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  if (!match) return;
  const url = 'https://youtu.be/' + match[1];
  const open = () => {
    try { tg.openLink(url, { try_instant_view: false }); }
    catch (e) { window.open(url, '_blank'); }
  };
  try {
    tg.showPopup({
      title: '⛶ Полный экран',
      message: 'Внутри Telegram на iPhone плеер YouTube развернуть нельзя. '
             + 'Открыть трейлер в YouTube?',
      buttons: [{ id: 'yt', type: 'default', text: '▶️ Открыть' },
                { id: 'no', type: 'cancel' }],
    }, (btn) => { if (btn === 'yt') open(); });
    return;
  } catch (e) { /* нет showPopup — открываем сразу */ }
  open();
}

async function _trailerFsFlow() {
  const inDeviceFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  if (inDeviceFs) { _exitFs(); return; }
  // 1) Полноэкранный режим мини-аппа — основной путь на телефоне.
  if (_appInFs()) { exitAppFullscreen(); _syncTrailerFs(); return; }
  if (_appFsAvailable()) { enterAppFullscreen(); _syncTrailerFs(); return; }
  // 2) ПК и веб: обычный браузерный fullscreen на обёртке/iframe.
  const root = document.documentElement;
  if (root && (typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function')) {
    const frame = document.getElementById('trailer-frame');
    const modal = document.getElementById('trailer-modal');
    const ok = await _requestFs(frame && !frame.classList.contains('hidden') ? frame : (modal || undefined));
    if (ok) return;
    // v133: в вебвью Telegram браузерный fullscreen может существовать, но
    // молча отклоняться (Android) — не «молчим», а идём по фолбэкам дальше.
  }
  // 3) iOS и старый Android: наш mp4 умеет своё webkitEnterFullscreen.
  const video = document.getElementById('trailer-video');
  if (video && !video.classList.contains('hidden') && video.webkitEnterFullscreen) {
    try { video.webkitEnterFullscreen(); return; } catch (err) { /* пусто */ }
  }
  // 4) YouTube-iframe из вебвью не развернуть — предлагаем приложение YouTube.
  _offerTrailerInYouTube();
}

(function initTrailerFsButton() {
  const fsBtn = document.getElementById('btn-trailer-fs');
  if (!fsBtn) return;
  let pressTimer = null, diagShown = false;
  fsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(pressTimer);
    if (diagShown) { diagShown = false; return; } // только что показали диагностику
    haptic('light');
    _trailerFsFlow();
  });
  // v133: долгое нажатие (0.6 с) на «⛶» — показать диагностику возможностей.
  fsBtn.addEventListener('touchstart', () => {
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { diagShown = true; _showFsDiag(); }, 600);
  }, { passive: true });
  ['touchend', 'touchcancel'].forEach((t) => {
    fsBtn.addEventListener(t, () => clearTimeout(pressTimer), { passive: true });
  });
  // На ПК — та же диагностика по правому клику.
  fsBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); _showFsDiag(); });
  document.addEventListener('fullscreenchange', _syncTrailerFs);
  document.addEventListener('webkitfullscreenchange', _syncTrailerFs);
  document.addEventListener('MSFullscreenChange', _syncTrailerFs);
  try {
    if (tg && typeof tg.onEvent === 'function') {
      tg.onEvent('fullscreenChanged', _syncTrailerFs);
      tg.onEvent('fullscreenFailed', (e) => {
        // UNSUPPORTED — клиент точно не умеет полноэкранный режим мини-аппа
        // (Telegram Web, Desktop или старый клиент) — отключаем сразу. Иные
        // сбои копим: после двух подряд больше не дёргаем метод и падаем
        // на фолбэки.
        if (e && e.error === 'UNSUPPORTED') {
          _appFsOff = true;
        } else {
          _appFsFails++;
          if (_appFsFails >= 2) _appFsOff = true;
        }
        _syncTrailerFs();
      });
    }
  } catch (e) { /* пусто */ }
})();

function openTrailer(m) {
  if (!m) return;
  window._challTrailerWatched = (window._challTrailerWatched || 0) + 1;
  challDone('watch_trailer');
  bumpWeekStat('trailers');
  pushTrailerWatch(m.code);      // v74: в «Продолжить смотреть»
  // v74: полка «Продолжить смотреть» обновляется сразу, если она видна
  if (view === 'grid' || view === 'fav') {
    const cs = document.getElementById('continue-shelf');
    if (cs && !cs.classList.contains('hidden')) renderTrailerShelf();
  }
  if (!m.trailer_yt && !m.trailer_file_id) {
    return;
  }
  haptic('light');
  // Приоритет — YouTube: играем прямо в приложении на весь экран,
  // ничего не сворачивая. Локальный файл в Telegram — только фолбэк,
  // если у фильма нет YouTube-версии (тогда бот пришлёт видео в чат).
  if (m.trailer_yt) {
    const modal = document.getElementById('trailer-modal');
    const frame = document.getElementById('trailer-frame');
    const video = document.getElementById('trailer-video');
    if (!modal || !frame || !video) return;
    video.classList.add('hidden');
    video.removeAttribute('src');
    frame.classList.remove('hidden');
    frame.src = 'https://www.youtube.com/embed/' + m.trailer_yt +
                '?autoplay=1&rel=0&playsinline=1&fs=1';
    modal.classList.remove('hidden');
    startWatchSession(m.code);   // v109: считаем время просмотра
    // v132: трейлер — единственное место, где нужен весь экран, поэтому просим
    // полноэкранный режим мини-аппа сразу при открытии: на телефоне он убирает
    // полуэкран Telegram и работает даже там, где браузерный fullscreen нельзя
    // (iPhone). Если клиент не умеет — тихо остаёмся как были, а кнопка
    // разворота предложит фолбэки.
    enterAppFullscreen();
    _syncTrailerFs();
    return;
  }
  if (m.trailer_file_id) {
    // Действие называется 'trailer_movie' — ровно как в маппинге sendOrDeepLink
    // (раньше тут было 'trailer', маппинг не совпадал, и вместо видео уходил
    // фолбэк ?start=afisha — трейлер «не открывался»).
    sendOrDeepLink({ action: 'trailer_movie', code: m.code });
  }
}

// v67: индикатор оффлайна — при потере сети показываем баннер,
// данные остаются доступны из кэша Service Worker.
(function () {
  const nb = document.getElementById('net-banner');
  if (!nb) return;
  const update = () => nb.classList.toggle('hidden', navigator.onLine !== false);
  window.addEventListener('offline', () => { update(); haptic('heavy'); });
  window.addEventListener('online', update);
  update();
})();

// v87: таб-бар «отрывается» от контента, когда прилип к верху —
// скруглённый низ + тень, чтобы не выглядел обрезанным при скролле.
(function () {
  const bar = document.querySelector('.tabs');
  window.__tabsDbg = { bar: !!bar, ran: 1, upds: 0 };
  if (!bar) return;
  let ticking = false;
  const upd = () => {
    ticking = false;
    window.__tabsDbg.upds++;
    const stuck = window.scrollY > 60 && bar.getBoundingClientRect().top <= 2;
    document.body.classList.toggle('tabs-stuck', stuck);
  };
  window.addEventListener('scroll', () => {
    // прямой вызов — rAF в части WebView не срабатывает, а вычисление дешёвое
    upd();
  }, { passive: true });
})();

function closeTrailer() {
  _exitFs();
  exitAppFullscreen();          // v132: вернуть мини-апп в обычный размер
  endWatchSession();            // v109: фиксируем реальное время просмотра
  const modal = document.getElementById('trailer-modal');
  const frame = document.getElementById('trailer-frame');
  const video = document.getElementById('trailer-video');
  if (frame) frame.src = 'about:blank'; // останавливаем воспроизведение
  if (video) { video.pause(); video.removeAttribute('src'); }
  if (modal) modal.classList.add('hidden');
}

// Глобальные обработчики модалки (один раз, а не на каждый openDetail)
(function initTrailerModal() {
  const bg = document.getElementById('trailer-modal');
  if (bg) bg.addEventListener('click', (e) => { if (e.target === bg) closeTrailer(); });
  const closeBtn = document.getElementById('btn-trailer-close');
  if (closeBtn) closeBtn.addEventListener('click', closeTrailer);
})();

// ---------- видимый отчёт об ошибках (чтобы вместо «белого экрана» было видно, что сломалось) ----------
function showErrorBanner(text) {
  try {
    const el = document.getElementById('err-banner');
    if (el) {
      el.textContent = '⚠️ ' + text;
      el.classList.remove('hidden');
    }
  } catch (_) {}
}
window.addEventListener('error', (e) => {
  // v126: ошибку не только показываем, но и увозим боту (errorStatsPrefix) —
  // о поломке у подписчиков узнаём из отчёта, а не из первой жалобы.
  try {
    const t = e && e.target;
    if (t && t !== window) {
      // Картинки/шрифты не считаем: они не мешают приложению и срываются
      // постоянно (то же правило, что у inline-сторожа в index.html).
      if (t.tagName === 'SCRIPT') bumpErrorStat('resource', 'script_load');
    } else {
      bumpErrorStat('js', e && e.message);
    }
  } catch (_) {}
  showErrorBanner('Ошибка приложения: ' + ((e && e.message) || 'неизвестная'));
});
// Сорванный промис (например, не доехал fetch) до window.onerror не доходит —
// исключение живёт внутри промиса, и в отчёте такие поломки были не видны вовсе.
window.addEventListener('unhandledrejection', (e) => {
  try {
    const r = e && e.reason;
    bumpErrorStat('promise', (r && r.message) || r || 'promise');
  } catch (_) {}
});

// ---------- ЗАПУСК (в самом конце файла: все объявления и обработчики готовы) ----------
// Раньше enterApp() вызывался в начале файла, до объявления ALL/COLLS — из-за TDZ
// гонки с fetch приложение открывалось пустым. Теперь запускаем, когда всё готово.
// ---------- онбординг (показывается один раз) ----------
const OB_KEY = 'kinoafisha_onb2';   // v183: новая навигация — показываем тур один раз всем
function showOnboarding() {
  if (localStorage.getItem(OB_KEY)) return;
  const modal = document.getElementById('onboarding');
  if (!modal) return;
  let slide = 0;
  const total = 5;
  const slides = modal.querySelectorAll('.ob-slide');
  const dots = modal.querySelectorAll('.ob-dot');
  const nextBtn = document.getElementById('ob-next');
  const skipBtn = document.getElementById('ob-skip');
  const render = () => {
    slides.forEach((s, i) => s.classList.toggle('active', i === slide));
    dots.forEach((d, i) => d.classList.toggle('active', i === slide));
    nextBtn.textContent = slide === total - 1 ? '🎁 Забрать и начать' : 'Далее';
  };
  const close = () => {
    localStorage.setItem(OB_KEY, '1');
    modal.classList.add('hidden');
    haptic('light');
    // v248: подарок за знакомство — один раз +100 фишек в общий кошелёк казино
    try {
      if (!localStorage.getItem('kino_welcome')) {
        localStorage.setItem('kino_welcome', '1');
        const w = JSON.parse(localStorage.getItem('kino_poker') || 'null') || { chips: 500, best: 0, hands: 0 };
        w.chips = (typeof w.chips === 'number' ? w.chips : 500) + 100;
        localStorage.setItem('kino_poker', JSON.stringify(w));
        setTimeout(() => { popMsg('🎁 +100 фишек! Загляни в «Играть»'); haptic('ok'); try { confetti(); } catch (e) {} }, 500);
      }
    } catch (e) { /* пусто */ }
  };
  nextBtn.onclick = () => {
    if (slide < total - 1) {
      slide++;
      render();
      haptic('light');
    } else {
      close();
    }
  };
  skipBtn.onclick = close;
  render();
  modal.classList.remove('hidden');
}

// v98: «Что нового» — показываем один раз на версию, только после входа в апп
const CHANGELOG_V = '155';
const CL_KEY = 'kinoafisha_seen_changelog';
function showChangelog(force = false) {
  // v101: force=true — открываем даже если уже видели («Ещё → Что нового»)
  try { if (!force && localStorage.getItem(CL_KEY) === CHANGELOG_V) return; } catch (e) { return; }
  const m = document.getElementById('changelog-modal');
  if (!m) return;
  m.classList.remove('hidden');
  const done = () => {
    m.classList.add('hidden');
    try { localStorage.setItem(CL_KEY, CHANGELOG_V); } catch (e) { /* пусто */ }
  };
  const ok = document.getElementById('btn-cl-ok');
  if (ok) ok.onclick = () => { haptic('light'); done(); };
  const x = document.getElementById('btn-cl-close');
  if (x) x.onclick = done;
  m.addEventListener('click', (e) => { if (e.target === m) done(); });
}

// v106: закрытие модалки карточки-шеринга (крестик / клик по фону)
(() => {
  const m = document.getElementById('sharecard-modal');
  if (!m) return;
  const close = () => { m.classList.add('hidden'); };
  const x = document.getElementById('btn-sharecard-close');
  if (x) x.onclick = close;
  m.addEventListener('click', (e) => { if (e.target === m) close(); });
})();

// v135: сторож запуска (inline-JS в index.html) читает этот флаг. Бандл доехал и
// выполняется? Если флаг так и не появился — значит скрипт не выполнился вообще
// (SyntaxError/404/офлайн), и вместо чёрного экрана надо показать сообщение.
window.__kinoBooted = true;

// v234: аналитика приложения (Cloudflare Worker, см. analytics_worker/README.md).
// Пустой ANALYTICS_URL — ничего никуда не уходит, приложение работает как раньше.
const ANALYTICS_URL = 'https://kinokod-stats.ata545ga.workers.dev';
const APP_BUILD = '256';
const _evq = []; let _evT = 0;
const _sid = Math.random().toString(36).slice(2, 10), _t0 = Date.now();
function track(name, arg) {
  try { chalHook(name, arg); } catch (e) { /* задания не должны ломать аналитику */ }
  try { casinoBadgeSoon(); } catch (e) {}
  if (!ANALYTICS_URL) return;
  try {
    _evq.push({ n: String(name).slice(0, 24), a: arg == null ? '' : String(arg).slice(0, 40), t: Math.round((Date.now() - _t0) / 1000) });
    if (_evq.length >= 20) flushEvents(); else if (!_evT) _evT = setTimeout(flushEvents, 15000);
  } catch (e) { /* аналитика не должна ломать приложение */ }
}
function flushEvents() {
  clearTimeout(_evT); _evT = 0;
  if (!ANALYTICS_URL || !_evq.length) return;
  const init = (tg && tg.initData) || '';
  if (!init) { _evq.length = 0; return; }   // открыто не из Telegram — подписи нет, не шлём
  const body = JSON.stringify({ init: init, sid: _sid, v: APP_BUILD, ev: _evq.splice(0, 40) });
  try { if (navigator.sendBeacon && navigator.sendBeacon(ANALYTICS_URL + '/e', new Blob([body], { type: 'text/plain' }))) return; } catch (e) {}
  try { fetch(ANALYTICS_URL + '/e', { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }); } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { track('end', Math.round((Date.now() - _t0) / 1000)); flushEvents(); }
});
window.addEventListener('pagehide', flushEvents);

// v232: глубокие ссылки из постов канала. Форматы:
//   t.me/<бот>?startapp=movie_514   -> карточка фильма 514
//   t.me/<бот>?startapp=tab_news    -> вкладка (news, trailers, play, mine, today, grid)
//   <MINIAPP_URL>/#movie=514        -> то же из web_app-кнопок бота
// Читаем ДО enterApp: parse*Hash очищают location.hash.
function readDeepLink() {
  let raw = '';
  try { raw = (tg.initDataUnsafe && tg.initDataUnsafe.start_param) || ''; } catch (e) {}
  if (!raw) {
    const h = (location.hash || '').match(/[#&](movie|tab)=([A-Za-z0-9_-]{1,32})/);
    if (h) raw = h[1] + '_' + h[2];
  }
  const m = String(raw).match(/^(movie|tab)_([A-Za-z0-9_-]{1,32})$/);
  return m ? { kind: m[1], value: m[2] } : null;
}
function applyDeepLink(dl) {
  if (!dl) return;
  let tries = 0;
  const t = setInterval(() => {
    if (ALL.length || ++tries > 50) {
      clearInterval(t);
      if (!ALL.length) return;
      try {
        if (dl.kind === 'movie') {
          if (ALL.find(x => String(x.code) === dl.value)) openDetail(String(ALL.find(x => String(x.code) === dl.value).code));
        } else {
          const btn = document.querySelector('#bnav [data-bn="' + dl.value + '"]') ||
                      document.querySelector('.tabs [data-view="' + dl.value + '"]');
          if (btn) btn.click();
        }
      } catch (e) { /* ссылка устарела — просто покажем афишу */ }
    }
  }, 300);
}
const _deepLink = readDeepLink();
track('open', _deepLink ? _deepLink.kind : (function () { try { return (tg.initDataUnsafe && tg.initDataUnsafe.start_param) ? 'start' : 'menu'; } catch (e) { return 'menu'; } })());
parseAccessHash();  // v96: подтверждение подписки (#access=1) — до решения гейт/вход
if (localStorage.getItem(ACCESS_KEY) === '1') {
  enterApp();
  showOnboarding();
  setTimeout(showChangelog, 900);  // v98: «Что нового» — раз на версию
  applyDeepLink(_deepLink);
} else if (_deepLink) {
  // v232: пришли по ссылке из поста — сразу показываем фильм, без стены подписки
  enterApp(true);
  applyDeepLink(_deepLink);
} else {
  track('gate');
  showGate();
}

// ---------- свайп вниз для закрытия модалок ----------
// Универсальный жест: потянул модалку вниз — закрывается (кроме полноэкранного
// трейлера и онбординга — там свой UX). Жест работает от области «шапки» модалки,
// чтобы случайные свайпы по контенту не срабатывали.
document.querySelectorAll('.modal:not(#trailer-modal):not(#onboarding)').forEach((modal, idx) => {
  let startY = 0;
  modal.addEventListener('touchstart', (e) => {
    if (modal.classList.contains('hidden')) return;
    const card = modal.querySelector('.modal-card, .onboarding-card, .kinogod-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    // срабатываем только если жест начат в верхних 30% карточки
    if (e.touches[0].clientY - r.top > r.height * 0.3) return;
    startY = e.touches[0].clientY;
  }, { passive: true });
  modal.addEventListener('touchmove', (e) => {
    if (!startY || modal.classList.contains('hidden')) return;
    const card = modal.querySelector('.modal-card, .onboarding-card, .kinogod-card');
    if (!card) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 12) {
      card.style.transition = 'transform .18s ease';
      card.style.transform = `translateY(${Math.min(dy, 90)}px)`;
      card.style.opacity = String(Math.max(0, 1 - dy / 220));
    }
  }, { passive: true });
  modal.addEventListener('touchend', (e) => {
    if (!startY || modal.classList.contains('hidden')) return;
    const card = modal.querySelector('.modal-card, .onboarding-card, .kinogod-card');
    const dy = card ? e.changedTouches[0].clientY - startY : 0;
    startY = 0;
    if (card) {
      card.style.transition = 'transform .18s ease, opacity .18s ease';
      if (dy > 70) {
        card.style.transform = 'translateY(120%)';
        card.style.opacity = '0';
        setTimeout(() => {
          modal.classList.add('hidden');
          card.style.transform = '';
          card.style.opacity = '';
        }, 150);
      } else {
        card.style.transform = '';
        card.style.opacity = '';
      }
    }
  }, { passive: true });
});

// ---------- Service Worker: оффлайн + мгновенные повторные загрузки ----------
// Регистрируем только на https (в Telegram webview и на GitHub Pages).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    // v195: когда новый service worker взял управление — один раз перезагружаемся, чтобы сразу показать свежую версию
    // (раньше обновление «доезжало» только со второго открытия)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      try { if (sessionStorage.getItem('sw_reloaded')) return; sessionStorage.setItem('sw_reloaded', '1'); } catch (e) { return; }
      location.reload();
    });
  });
}

// v195: самопроверка версии. Если на сайте уже новая версия, а открылась старая из кэша — чистим кэш и один раз перезагружаемся.
window.addEventListener('load', () => {
  setTimeout(async () => {
    try {
      if (sessionStorage.getItem('ver_reload')) return;
      const html = await (await fetch('./index.html?nc=' + Date.now(), { cache: 'no-store' })).text();
      const m = html.match(/script\.js\?v=(\d+)/);
      if (m && +m[1] > APP_VER) {
        sessionStorage.setItem('ver_reload', '1');
        if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
        location.reload();
      }
    } catch (e) { /* нет сети — остаёмся на текущей */ }
  }, 2500);
});

// ======================= v151: «Сегодня вечером» и «Викторина дня» =======================
function _seedRng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function _todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _lsGetJson(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }
function _lsSetJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

const TONIGHT_MOODS = [
  { id: 'family', emoji: '👨‍👩‍👧', name: 'Всей семьёй',
    ok: m => _hasG(m, ['семейный', 'мультфильм', 'приключения', 'фэнтези']) && !_hasG(m, ['ужасы', 'триллер', 'криминал', 'боевик']) },
  { id: 'laugh', emoji: '😂', name: 'Посмеяться', ok: m => _hasG(m, ['комедия']) && !_hasG(m, ['ужасы', 'криминал']) },
  { id: 'chill', emoji: '🛋', name: 'Расслабиться',
    ok: m => _hasG(m, ['драма', 'мелодрама', 'биография', 'комедия', 'приключения']) && !_hasG(m, ['ужасы', 'криминал', 'боевик']) },
  { id: 'thrill', emoji: '🧠', name: 'Чтобы удивило',
    ok: m => _hasG(m, ['фантастика', 'детектив', 'триллер', 'фэнтези']) && !_hasG(m, ['ужасы']) },
  { id: 'short', emoji: '⏱', name: 'Недолго (до 95 мин)', ok: m => (+m.duration || 999) <= 95 },
  { id: 'scary', emoji: '👻', name: 'Страшно',
    ok: m => _hasG(m, ['ужасы', 'триллер']) },
  { id: 'friends', emoji: '🍻', name: 'С друзьями',
    ok: m => _hasG(m, ['комедия', 'боевик', 'фантастика', 'триллер', 'ужасы', 'фэнтези']) },
  { id: 'date', emoji: '💞', name: 'Вдвоём',
    ok: m => _hasG(m, ['мелодрама', 'комедия', 'драма', 'приключения']) && !_hasG(m, ['ужасы']) },
  { id: 'ny', emoji: '🎄', name: 'Новогоднее',
    ok: m => /новый год|новогодн|рождеств|санта|дед мороз|ёлк|елк/i.test((m.title || '') + ' ' + (m.description || '')) },
];
function _hasG(m, list) {
  const g = (m.genres || []).map(x => String(x).toLowerCase());
  return list.some(x => g.includes(x));
}
let _tonightMood = null, _tonightShift = 0;

function renderTonight() {
  const box = document.getElementById('tonight-container');
  if (!box) return;
  if (!ALL.length) { box.innerHTML = '<p class="empty-note">Загрузка базы…</p>'; return; }
  const chips = TONIGHT_MOODS.map(md =>
    `<button class="tn-chip${_tonightMood === md.id ? ' active' : ''}" data-mood="${md.id}">${md.emoji} ${esc(md.name)}</button>`).join('');
  let body = '<p class="tn-hint">Выберите настроение — подберём один фильм на вечер.</p>';
  if (_tonightMood) {
    const md = TONIGHT_MOODS.find(x => x.id === _tonightMood);
    const seen = new Set(getWatched().map(String));
    let pool = ALL.filter(m => md.ok(m) && (+m.rating || 0) >= 6.8);
    if (!pool.length) pool = ALL.filter(m => md.ok(m));
    const fresh = pool.filter(m => !seen.has(String(m.code)));
    if (fresh.length) pool = fresh;
    if (!pool.length) {
      body = '<p class="tn-hint">Под это настроение пока ничего нет — скоро добавим. Попробуйте другое 🙂</p>';
    } else {
      const rnd = _seedRng(_todayKey() + md.id);
      pool = pool.map(m => [rnd(), m]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
      const m = pool[_tonightShift % pool.length];
      const meta = [m.year, fmtDuration(m.duration), (m.genres || []).slice(0, 2).join(' · ')].filter(Boolean).join(' · ');
      const desc = String(m.description || '').split(/(?<=[.!?])\s/).slice(0, 2).join(' ');
      body = `
        <article class="tn-card" data-code="${esc(String(m.code))}">
          <div class="tn-poster">${m.poster ? `<img src="${esc(m.poster)}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'"/>` : '<div class="poster-placeholder"><span>🎬</span></div>'}</div>
          <div class="tn-info">
            <span class="tn-badge">${md.emoji} ${esc(md.name)}</span>
            <h3>${esc(m.title)}</h3>
            <div class="tn-meta">${esc(meta)}</div>
            <span class="rating">${ratingBadge(m)}</span>
            ${desc ? `<p class="tn-desc">${esc(desc)}</p>` : ''}
            <div class="tn-actions">
              <button class="btn-primary tn-open">🎬 Открыть</button>
              ${pool.length > 1 ? '<button class="btn-secondary tn-next">🔄 Другой</button>' : ''}
            </div>
          </div>
        </article>`;
    }
  }
  box.innerHTML = `<div class="tn-head"><h2>🌙 Сегодня вечером</h2></div><div class="tn-chips">${chips}</div>${body}`;
  box.querySelectorAll('.tn-chip').forEach(b => b.onclick = () => {
    _tonightMood = b.dataset.mood; _tonightShift = 0; haptic('light'); renderTonight();
  });
  const card = box.querySelector('.tn-card');
  if (card) {
    box.querySelector('.tn-open').onclick = () => openDetail(card.dataset.code);
    const nx = box.querySelector('.tn-next');
    if (nx) nx.onclick = () => { _tonightShift++; haptic('light'); renderTonight(); };
  }
}

// ---- Викторина дня: 5 вопросов из нашей же базы, одни и те же в течение суток ----
const QUIZ_KEY = 'kinoafisha_quiz';
let _quizState = null;
function _quizBuild() {
  const rnd = _seedRng('quiz' + _todayKey());
  const pick = a => a[Math.floor(rnd() * a.length)];
  const shuf = a => a.map(x => [rnd(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
  const pool = shuf(ALL.filter(m => m.title));
  const directors = [...new Set(ALL.map(m => m.director).filter(Boolean))];
  const years = [...new Set(ALL.map(m => String(m.year)).filter(y => /^\d{4}$/.test(y)))];
  const qs = [];
  for (const m of pool) {
    if (qs.length >= 5) break;
    const kind = qs.length % 3;
    const pre = qs.map(q => q.code);
    if (pre.includes(m.code)) continue;
    if (kind === 0 && m.director && directors.length >= 4) {
      const wrong = shuf(directors.filter(d => d !== m.director)).slice(0, 3);
      qs.push({ code: m.code, q: `Кто снял фильм «${m.title}»?`, a: m.director, opts: shuf([m.director, ...wrong]) });
    } else if (kind === 1 && /^\d{4}$/.test(String(m.year)) && years.length >= 4) {
      const y = +m.year;
      const near = shuf([y - 3, y - 2, y - 1, y + 1, y + 2, y + 3].filter(v => v <= 2026 && v > 1950)).slice(0, 3);
      qs.push({ code: m.code, q: `В каком году вышел фильм «${m.title}»?`, a: String(y), opts: shuf([String(y), ...near.map(String)]) });
    } else if (kind === 2 && (m.actors || []).length) {
      const actor = m.actors[0];
      const others = shuf([...new Set(ALL.filter(x => x.code !== m.code && !(x.actors || []).includes(actor))
        .flatMap(x => (x.actors || []).slice(0, 2)))]).slice(0, 3);
      if (others.length === 3) qs.push({ code: m.code, q: `Кто из актёров снимался в фильме «${m.title}»?`, a: actor, opts: shuf([actor, ...others]) });
    }
  }
  return qs;
}
function renderQuiz() {
  const box = document.getElementById('quiz-container');
  if (!box) return;
  if (!ALL.length) { box.innerHTML = '<p class="empty-note">Загрузка базы…</p>'; return; }
  const st = _lsGetJson(QUIZ_KEY, { streak: 0, last: '', best: 0, results: {} });
  const today = _todayKey();
  const done = st.results && st.results[today];
  if (done != null) {
    box.innerHTML = `<div class="qz-card qz-done">
      <h2>🧠 Викторина дня</h2>
      <div class="qz-stars">${[1, 3, 5].map(t => `<i class="${done >= t ? 'on' : ''}">★</i>`).join('')}</div>
      <div class="qz-ring" style="--p:${done * 20}"><b>${done}</b><span>из 5</span></div>
      ${st.reward && st.reward[today] ? `<div class="qz-reward">🎞 +${st.reward[today]} фишек в казино</div>` : ''}
      <p>${done === 5 ? 'Безупречно! Вы настоящий киноман 🏆' : done >= 3 ? 'Отличный результат!' : 'Завтра будет новый шанс 🙂'}</p>
      <p class="qz-streak">🔥 Серия: ${st.streak} ${st.streak === 1 ? 'день' : 'дн.'} подряд · лучший результат ${st.best}/5</p>
      <p class="tn-hint">Новые вопросы появятся завтра.</p>
      <button class="qz-bot" type="button">💰 Играть в боте — за ответы дают кинобаллы</button></div>`;
    const qb = box.querySelector('.qz-bot');
    if (qb) qb.onclick = () => {
      haptic('light');
      const url = 'https://t.me/kapitan_kino_bot?start=dailyquiz';
      if (tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    };
    return;
  }
  const qs = _quizBuild();
  if (qs.length < 3) { box.innerHTML = '<p class="empty-note">Пока мало данных для викторины — скоро будет.</p>'; return; }
  _quizState = { qs, i: 0, score: 0 };
  drawQuizQuestion();
}
function drawQuizQuestion() {
  const box = document.getElementById('quiz-container');
  const s = _quizState;
  if (!box || !s) return;
  if (s.i >= s.qs.length) return finishQuiz();
  const q = s.qs[s.i];
  box.innerHTML = `<div class="qz-card">
    <div class="qz-step">Вопрос ${s.i + 1} из ${s.qs.length}${s.run >= 2 ? `<span class="qz-run">🔥 ${s.run} подряд</span>` : ''}</div>
    <div class="qz-dots">${s.qs.map((_, k) => `<i class="${k < s.i ? (s.hist && s.hist[k] ? 'ok' : 'bad') : k === s.i ? 'cur' : ''}"></i>`).join('')}</div>
    <h3 class="qz-q">${esc(q.q)}</h3>
    <div class="qz-opts">${q.opts.map((o, k) => `<button class="qz-opt" data-v="${esc(o)}" style="animation-delay:${k * 60}ms"><b>${'АБВГ'[k] || k + 1}</b><span>${esc(o)}</span></button>`).join('')}</div>
    <div class="qz-fb" id="qz-fb"></div>
  </div>`;
  box.querySelectorAll('.qz-opt').forEach(b => b.onclick = () => {
    const ok = b.dataset.v === q.a;
    if (ok) s.score++;
    s.run = ok ? (s.run || 0) + 1 : 0; (s.hist = s.hist || []).push(ok);
    haptic(ok ? 'ok' : 'error');
    { const fb = box.querySelector('#qz-fb'); if (fb) { fb.className = 'qz-fb show ' + (ok ? 'ok' : 'bad'); fb.textContent = ok ? (s.run >= 3 ? '🔥 Верно! Серия ' + s.run : '✅ Верно!') : '❌ Правильно: ' + q.a; } }
    box.querySelectorAll('.qz-opt').forEach(x => {
      x.disabled = true;
      if (x.dataset.v === q.a) x.classList.add('right');
    });
    if (!ok) b.classList.add('wrong');
    setTimeout(() => { s.i++; drawQuizQuestion(); }, ok ? 1000 : 1500);
  });
}
function finishQuiz() {
  const s = _quizState;
  const st = _lsGetJson(QUIZ_KEY, { streak: 0, last: '', best: 0, results: {} });
  const today = _todayKey();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yKey = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
  st.streak = st.last === yKey ? (st.streak || 0) + 1 : 1;
  st.last = today;
  st.best = Math.max(st.best || 0, s.score);
  st.results = st.results || {};
  st.results[today] = s.score;
  // v255: награда за ответы — фишки в общий кошелёк казино (раз в день)
  try {
    const rw = s.score * 10 + (s.score === s.qs.length ? 20 : 0);
    if (rw > 0) {
      const w = JSON.parse(localStorage.getItem('kino_poker') || 'null') || { chips: 500, best: 0, hands: 0 };
      w.chips = (typeof w.chips === 'number' ? w.chips : 500) + rw;
      localStorage.setItem('kino_poker', JSON.stringify(w));
      st.reward = st.reward || {}; st.reward[today] = rw;
      try { confetti(s.score >= 4 ? 30 : 12); } catch (e) {}
    }
  } catch (e) {}
  _lsSetJson(QUIZ_KEY, st);
  _quizState = null;
  renderQuiz();
}
// ---------- v179: стартовая панель «Сегодня» над афишей ----------
function renderTodayStrip() {
  const box = document.getElementById('quick-row');
  if (!box) return;
  const today = capDayStr(new Date());
  let arenaDaily = null; try { const d = JSON.parse(localStorage.getItem('kino_arena_daily') || 'null'); if (d && d.day === today) arenaDaily = d; } catch (e) {}
  let quizDone = null; try { const st = _lsGetJson(QUIZ_KEY, { results: {} }); quizDone = st.results && st.results[_todayKey()]; } catch (e) {}
  let capBest = 0; try { capBest = parseInt(localStorage.getItem(CAP_BEST_KEY) || '0', 10) || 0; } catch (e) {}
  const cards = [
    { go: 'arena', ico: '⚔️', t: 'Дуэль дня', sub: arenaDaily ? `твой счёт ${arenaDaily.score}` : '12 вопросов · для всех', done: !!arenaDaily, todo: !arenaDaily },
    { go: 'quiz', ico: '🧠', t: 'Викторина дня', sub: quizDone != null ? `сегодня ${quizDone}/5` : '5 вопросов', done: quizDone != null, todo: quizDone == null },
    { go: 'tonight', ico: '🌙', t: 'Сегодня вечером', sub: 'по настроению' },
    { go: 'duo', ico: '👥', t: 'На двоих', sub: 'фильм для обоих' },
    { go: 'cap', ico: '🎮', t: 'Капитан в пути', sub: capBest ? `рекорд ${capBest}` : 'игра на 45 секунд' },
    { go: 'map', ico: '🌍', t: 'Кино-карта', sub: 'фильмы по странам' },
  ];
  const d = new Date();
  const dt = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  box.className = 'today-strip';
  box.innerHTML = `<div class="td-head"><b>📆 Сегодня</b><span>${esc(dt)}</span></div>
    <div class="td-row">${cards.map(c => `<button class="td-card${c.done ? ' done' : ''}${c.todo ? ' todo' : ''}" data-go="${c.go}">
      <span class="td-ico">${c.ico}</span><b>${c.t}</b><i>${esc(c.sub)}</i>${c.done ? '<em class="td-ok">✓</em>' : ''}</button>`).join('')}</div>`;
  box.querySelectorAll('.td-card').forEach(b => b.addEventListener('click', () => {
    haptic('light');
    const g = b.dataset.go;
    if (g === 'arena') openArena();
    else if (g === 'duo') openDuo();
    else if (g === 'cap') openCaptainGame();
    else openView(g);
  }));
}

// ===== v193: Кино-покер встроен в script.js (раньше был отдельным poker.js — при частичной выгрузке файлов не открывался) =====
/* v190: «Кино-покер» — видеопокер (Jacks or Better) на виртуальных кинофишках.
   Фишки хранятся отдельно (kino_poker) и НЕ влияют на ранг/очки/достижения. Купить или вывести их нельзя. */
(function () {
  'use strict';
  var KEY = 'kino_poker';
  var PAY = [['Роял-флеш', 250], ['Стрит-флеш', 50], ['Каре', 25], ['Фулл-хаус', 9], ['Флеш', 6], ['Стрит', 4], ['Тройка', 3], ['Две пары', 2], ['Валеты и выше', 1]];
  var SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];
  var st = null, deck = [], hand = [], held = [], phase = 'bet', bet = 10, lastWin = 0, lastName = '', root = null, fresh = [], winMask = [], popWin = 0;

  function today() { return new Date().toISOString().slice(0, 10); }
  function load() {
    try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; }
    if (!st || typeof st.chips !== 'number') st = { chips: 500, best: 0, hands: 0, bonus: '', refill: '' };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function rnd(n) {
    try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch (e) { return Math.floor(Math.random() * n); }
  }
  function newDeck() {
    var d = []; for (var s = 0; s < 4; s++) for (var r = 0; r < 13; r++) d.push({ r: r, s: s });
    for (var i = d.length - 1; i > 0; i--) { var j = rnd(i + 1), t = d[i]; d[i] = d[j]; d[j] = t; }
    return d;
  }
  // Оценка руки: возвращает [название, множитель] или null
  function evaluate(h) {
    var rs = h.map(function (c) { return c.r; }).sort(function (a, b) { return a - b; });
    var flush = h.every(function (c) { return c.s === h[0].s; });
    var cnt = {}; rs.forEach(function (r) { cnt[r] = (cnt[r] || 0) + 1; });
    var groups = Object.keys(cnt).map(function (k) { return [cnt[k], +k]; }).sort(function (a, b) { return b[0] - a[0] || b[1] - a[1]; });
    var uniq = rs.every(function (r, i) { return i === 0 || r !== rs[i - 1]; });
    var straight = uniq && (rs[4] - rs[0] === 4 || (rs.join() === '0,1,2,3,12'));
    var high = rs.join() === '8,9,10,11,12';
    if (straight && flush) return high ? PAY[0] : PAY[1];
    if (groups[0][0] === 4) return PAY[2];
    if (groups[0][0] === 3 && groups[1][0] === 2) return PAY[3];
    if (flush) return PAY[4];
    if (straight) return PAY[5];
    if (groups[0][0] === 3) return PAY[6];
    if (groups[0][0] === 2 && groups[1][0] === 2) return PAY[7];
    if (groups[0][0] === 2 && groups[0][1] >= 9) return PAY[8];
    return null;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function msg(t) { try { if (typeof popMsg === 'function') popMsg(t); } catch (e) {} }
  function buzz(k) { try { if (typeof haptic === 'function') haptic(k, true); } catch (e) {} }

  function dailyBonus() {
    if (st.bonus !== today()) { st.bonus = today(); st.chips += 200; save(); return true; }
    return false;
  }
  function refillIfBroke() {
    if (st.chips < 5 && st.refill !== today()) { st.refill = today(); st.chips = 100; save(); return true; }
    return false;
  }
  // звуки видеопокера (WebAudio, без файлов)
  var VAC = null;
  function vtone(f, d, type, vol, delay, slide) {
    try {
      if (st.snd === false) return;
      if (!VAC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return; VAC = new C(); }
      if (VAC.state === 'suspended') VAC.resume();
      var t0 = VAC.currentTime + (delay || 0), o = VAC.createOscillator(), g = VAC.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + d);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(VAC.destination); o.start(t0); o.stop(t0 + d + 0.02);
    } catch (e) {}
  }
  function vsfx(k, big) {
    if (k === 'deal') { for (var i = 0; i < 5; i++) vtone(500 + i * 40, 0.05, 'triangle', 0.07, i * 0.07, 300); }
    else if (k === 'hold') { vtone(880, 0.06, 'square', 0.05); }
    else if (k === 'win') { [523, 659, 784, 1046, 1318].slice(0, big ? 5 : 3).forEach(function (f, i) { vtone(f, 0.2, 'triangle', 0.14, i * 0.09); }); }
    else if (k === 'lose') { vtone(260, 0.3, 'sine', 0.1, 0, 130); }
    else if (k === 'dbl') { vtone(1200, 0.08, 'square', 0.06); vtone(1600, 0.1, 'square', 0.05, 0.08); }
  }
  var dealAnim = false, G2 = null;   // G2: режим «Удвоить»
  function gambleStart() {
    if (!lastWin || phase !== 'bet') return;
    st.chips -= lastWin; save();
    var d = newDeck(); G2 = { stake: lastWin, dealer: d[0], cards: d.slice(1, 5), picked: -1, step: (G2 && G2.step) || 0, over: false, res: '' };
    phase = 'gamble'; buzz('light'); draw();
  }
  function gamblePick(i) {
    if (!G2 || G2.picked >= 0) return;
    G2.picked = i; var me = G2.cards[i], dl = G2.dealer;
    vsfx('dbl'); if (me.r > dl.r) { G2.res = 'win'; vsfx('win', true); st.chips += G2.stake * 2; lastWin = G2.stake * 2; G2.step++; if (lastWin > st.best) st.best = lastWin; buzz('ok'); }
    else if (me.r === dl.r) { G2.res = 'push'; st.chips += G2.stake; buzz('light'); }
    else { G2.res = 'lose'; lastWin = 0; lastName = 'Мимо'; buzz('err'); }
    save(); draw();
  }
  function gambleStart2() { var step = G2.step; phase = 'bet'; G2 = { step: step }; gambleStart(); }
  function gambleEnd() { phase = 'bet'; G2 = null; draw(); }
  function deal() {
    if (st.chips < bet) { msg('Не хватает фишек — уменьши ставку'); return; }
    st.chips -= bet; st.hands++; save(); try { track('vp_hand'); } catch (e) { /* пусто */ }
    deck = newDeck(); hand = deck.splice(0, 5); held = [false, false, false, false, false]; phase = 'hold'; lastWin = 0; lastName = '';
    fresh = []; winMask = []; popWin = 0;
    buzz('light'); vsfx('deal'); dealAnim = true; draw(); dealAnim = false;
  }
  function drawCards() {
    fresh = [];
    for (var i = 0; i < 5; i++) if (!held[i]) { hand[i] = deck.shift(); fresh.push(i); }
    var res = evaluate(hand); phase = 'bet'; winMask = []; popWin = 0;
    if (res) {
      lastWin = bet * res[1]; lastName = res[0]; popWin = lastWin; st.chips += lastWin;
      var cnt = {}; hand.forEach(function (c) { cnt[c.r] = (cnt[c.r] || 0) + 1; });
      var all = /Стрит|Флеш|Фулл|Роял/.test(res[0]);
      winMask = hand.map(function (c) { return all || cnt[c.r] >= 2 || (res[0] === 'Валеты и выше' && c.r >= 9); }); if (lastWin > st.best) st.best = lastWin; buzz('ok'); vsfx('win', res[1] >= 6);
      try { if (res[1] >= 9 && typeof confetti === 'function') confetti(30); } catch (e) {}
    } else { lastName = 'Мимо'; buzz('light'); vsfx('lose'); }
    var broke = refillIfBroke(); save(); draw();
    if (broke) msg('🎞 Капитан подкинул 100 фишек');
  }
  function cardHtml(c, i) {
    var red = c.s === 1 || c.s === 2, h = held[i] && phase === 'hold';
    var fl = phase === 'bet' && fresh.indexOf(i) >= 0, wn = phase === 'bet' && lastWin && winMask[i];
    return '<button class="pk-card' + (red ? ' red' : '') + (h ? ' held' : '') + (dealAnim ? ' deal' : '') + (fl ? ' flip' : '') + (wn ? ' winc' : '') + '" style="animation-delay:' + (fl ? fresh.indexOf(i) * 0.09 : i * 0.07) + 's" data-i="' + i + '"' + (phase === 'hold' ? '' : ' disabled') + '>' +
      '<b>' + RANKS[c.r] + '</b><span>' + SUITS[c.s] + '</span>' + (h ? '<em>ДЕРЖУ</em>' : '') + '</button>';
  }
  function gambleView() {
    var g = G2, face = function (c, cls) { var red = c.s === 1 || c.s === 2; return '<div class="pk-card' + (red ? ' red' : '') + (cls || '') + '"><b>' + RANKS[c.r] + '</b><span>' + SUITS[c.s] + '</span></div>'; };
    var cards = g.cards.map(function (c, i) { return g.picked < 0 ? '<button class="pk-card pk-back" data-g="' + i + '"><span>🎬</span></button>' : face(c, (i === g.picked ? ' held' : ' dimmed')); }).join('');
    var status = g.picked < 0 ? 'Выбери карту старше карты дилера' : g.res === 'win' ? '🎉 Удвоил! +' + g.stake * 2 : g.res === 'push' ? '🤝 Ничья — ставка возвращена' : '💔 Не угадал';
    var again = g.res === 'win' && g.step < 3 ? '<button class="pk-go" id="pk-g-again">🎲 Ещё раз ×2 (' + g.stake * 2 + ')</button>' : '';
    var take = g.picked < 0 ? '' : '<button class="pk-go alt" id="pk-g-end">' + (g.res === 'win' ? '✅ Забрать ' + g.stake * 2 : 'Дальше') + '</button>';
    return '<div class="pk-top"><button class="pk-x" id="pk-x">✕</button><div class="pk-title">🎲 Удвоение</div><div class="pk-chips">🎞 ' + st.chips + '</div></div>' +
      '<div class="pk-status">' + status + '</div><div class="pk-felt"><div class="pk-brand">СТАВКА ' + g.stake + ' · ПОБЕДА ×2</div><div class="pk-dealer"><small>ДИЛЕР</small>' + face(g.dealer, '') + '</div><div class="pk-hand pk-g4">' + cards + '</div></div>' + again + take +
      '<div class="pk-note">Карта старше — выигрыш ×2, равная — ничья, младше — потеря. До 3 раз подряд.</div>';
  }
  function draw() {
    if (!root) return;
    if (phase === 'gamble' && G2) {
      root.innerHTML = gambleView();
      root.querySelector('#pk-x').onclick = function () { if (G2 && G2.picked < 0) { st.chips += G2.stake; save(); } close(); };
      root.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { gamblePick(+b.dataset.g); }; });
      var e = root.querySelector('#pk-g-end'); if (e) e.onclick = gambleEnd;
      var a = root.querySelector('#pk-g-again'); if (a) a.onclick = function () { gambleStart2(); };
      return;
    }
    var cards = hand.length ? hand.map(cardHtml).join('') : '<div class="pk-empty">Сдай карты и выбери, что оставить</div>';
    var cur = phase === 'bet' ? evaluate(hand.length ? hand : [{ r: 0, s: 0 }, { r: 2, s: 1 }, { r: 4, s: 2 }, { r: 6, s: 3 }, { r: 8, s: 0 }]) : null;
    var status = phase === 'hold' ? (evaluate(hand) ? '🃏 Сейчас: <b>' + esc(evaluate(hand)[0]) + '</b> ×' + evaluate(hand)[1] + ' · нажми на карты, что оставить' : 'Нажми на карты, которые оставляешь') :
      (hand.length ? (lastWin ? '🎉 ' + esc(lastName) + ' — +' + lastWin : 'Не повезло, попробуй ещё') : 'Сделай ставку');
    var bets = [5, 10, 25, 50].map(function (b) { return '<button class="pk-bet' + (b === bet ? ' on' : '') + '" data-b="' + b + '"' + (phase === 'hold' ? ' disabled' : '') + '>' + b + '</button>'; }).join('');
    var liveR = phase === 'hold' ? evaluate(hand) : null;
    var pay = PAY.map(function (p) { return '<div class="' + ((lastWin && p[0] === lastName) || (liveR && p[0] === liveR[0]) ? 'on' : '') + '"><span>' + p[0] + '</span><b>×' + p[1] + '</b></div>'; }).join('');
    root.innerHTML = '<div class="pk-top"><button class="pk-x" id="pk-x">✕</button><div class="pk-title">🃏 Видеопокер</div><div class="pk-chips">🎞 ' + st.chips + '</div><button class="hd-snd" id="pk-snd">' + (st.snd === false ? '🔇' : '🔊') + '</button></div>' +
      '<div class="pk-status' + (lastWin && phase === 'bet' ? ' win' : '') + '">' + status + '</div><div class="pk-felt"><div class="pk-brand">КАПИТАН КИНО · ВИДЕОПОКЕР</div><div class="pk-hand">' + cards + '</div>' + (popWin && phase === 'bet' ? '<div class="pk-pop">+' + popWin + '</div>' : '') + '</div>' +
      '<div class="pk-bets"><span>Ставка</span>' + bets + '</div>' +
      (phase === 'bet' && lastWin ? '<button class="pk-go alt" id="pk-dbl">🎲 Удвоить ' + lastWin + ' → ' + lastWin * 2 + '</button>' : '') + '<button class="pk-go" id="pk-go">' + (phase === 'hold' ? 'Заменить карты' : 'Сдать карты') + '</button>' +
      '<div class="pk-pay">' + pay + '</div>' +
      '<div class="pk-note">Виртуальные фишки для игры. Их нельзя купить или вывести, на ранг и очки они не влияют. Рекорд выигрыша: ' + st.best + ' · раздач: ' + st.hands + '</div>';
    root.querySelector('#pk-x').onclick = close;
    root.querySelector('#pk-snd').onclick = function () { st.snd = st.snd === false; save(); this.textContent = st.snd === false ? '🔇' : '🔊'; vsfx('hold'); };
    root.querySelector('#pk-go').onclick = function () { phase === 'hold' ? drawCards() : deal(); };
    var dbl = root.querySelector('#pk-dbl'); if (dbl) dbl.onclick = function () { G2 = { step: 0 }; gambleStart(); };
    root.querySelectorAll('.pk-card').forEach(function (b) { b.onclick = function () { var i = +b.dataset.i; held[i] = !held[i]; buzz('light'); vsfx('hold'); draw(); }; });
    root.querySelectorAll('.pk-bet').forEach(function (b) { b.onclick = function () { bet = +b.dataset.b; buzz('light'); draw(); }; });
    void cur;
  }
  function open() {
    load(); var got = dailyBonus();
    if (root) root.remove();
    root = document.createElement('div'); root.className = 'pk-overlay'; document.body.appendChild(root);
    hand = []; held = []; phase = 'bet'; lastWin = 0; lastName = '';
    if (st.chips < bet) bet = 5;
    draw();
    if (got) msg('🎁 Ежедневный бонус: +200 фишек');
  }
  function close() { if (root) { root.remove(); root = null; } }
  window.openPoker = open;
  window.__pokerEval = evaluate;   // для тестов
})();

// <blackjack>
// v236: Блэкджек. Шесть колод, дилер стоит на всех 17, блэкджек 3:2, удвоение (в т.ч. после сплита),
// одно разделение пар (у тузов — по одной карте), дилер заглядывает под десятку/туз. Есть страховка (2:1), «ровно 1:1» и поздняя сдача (возврат половины ставки).
// Фишки общие с видеопокером (localStorage kino_poker): один кошелёк на обе игры.
(function () {
  'use strict';
  var WKEY = 'kino_poker', SKEY = 'kino_bj';
  var SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];
  var BETS = [10, 20, 50, 100, 250], DECKS = 6, CUT = 78;
  var revN = 0, revHide = false, revTimer = null, flipNext = false, dealSeq = 0, shownChips = 0, chipRaf = 0, showSheet = false;
  var THEMES = ['green', 'wine', 'navy', 'night'], THEME_RU = { green: 'Классика', wine: 'Бордо', navy: 'Синий', night: 'Ночь' }, SIDES = [0, 10, 25];
  var root = null, G = null, wal = null, st = null, seen = {};

  // ---------- движок (чистые функции от состояния g) ----------
  function rnd(n) {
    try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch (e) { return Math.floor(Math.random() * n); }
  }
  function newShoe() {
    var d = [];
    for (var k = 0; k < DECKS; k++) for (var s = 0; s < 4; s++) for (var r = 0; r < 13; r++) d.push({ r: r, s: s });
    for (var i = d.length - 1; i > 0; i--) { var j = rnd(i + 1), t = d[i]; d[i] = d[j]; d[j] = t; }
    return d;
  }
  function val(c) { return c.r <= 8 ? c.r + 2 : (c.r === 12 ? 11 : 10); }
  function score(cards) {
    var t = 0, a = 0;
    cards.forEach(function (c) { t += val(c); if (c.r === 12) a++; });
    while (t > 21 && a > 0) { t -= 10; a--; }
    return { t: t, soft: a > 0 };
  }
  function isBJ(cards) { return cards.length === 2 && score(cards).t === 21; }
  function draw(g) { if (!g.shoe.length) g.shoe = newShoe(); return g.shoe.pop(); }
  function newGame(chips) { return { shoe: newShoe(), chips: chips, dealer: [], hands: [], cur: 0, phase: 'bet', bet: 10, net: 0, over: false }; }

  function startRound(g, bet, side) {
    if (g.shoe.length < CUT) g.shoe = newShoe();
    g.chips -= bet; g.bet = bet; g.over = false; g.ins = 0; g.insPay = 0; g.side = 0; g.sidePay = 0; g.sideRes = '';
    if (side && g.chips >= side) { g.chips -= side; g.side = side; }
    g.net = -bet - g.side; g.shuffled = g.shoe.length > DECKS * 52 - 5;
    var p1 = draw(g), d1 = draw(g), p2 = draw(g), d2 = draw(g);
    g.dealer = [d1, d2];
    if (g.side && p1.r === p2.r) {      // бонус «Пара»: 6:1 разномастная пара обычная, 13:1 одного цвета, 26:1 одной масти (с возвратом ставки)
      var red1 = p1.s === 1 || p1.s === 2, red2 = p2.s === 1 || p2.s === 2;
      g.sideRes = p1.s === p2.s ? 'perfect' : (red1 === red2 ? 'colored' : 'mixed');
      g.sidePay = g.side * { perfect: 26, colored: 13, mixed: 6 }[g.sideRes]; g.chips += g.sidePay;
    }
    g.hands = [{ cards: [p1, p2], bet: bet, done: false, dbl: false, split: false, aces: false, res: '', pay: 0 }];
    g.cur = 0; g.phase = 'play';
    if (val(d1) === 11) { g.phase = 'ins'; return; }     // туз у дилера: сначала предложение страховки
    peekEnd(g);
  }
  function peekEnd(g) {
    if (isBJ(g.hands[0].cards) || (val(g.dealer[0]) >= 10 && isBJ(g.dealer))) { g.hands[0].done = true; settle(g); }
  }
  function insure(g, yes) {
    if (g.phase !== 'ins') return;
    var c = g.bet / 2;
    if (yes && g.chips >= c) { g.ins = c; g.chips -= c; }
    g.phase = 'play'; peekEnd(g);
  }
  function canDouble(g) {
    var h = g.hands[g.cur];
    return g.phase === 'play' && !!h && !h.done && h.cards.length === 2 && !h.aces && g.chips >= h.bet;
  }
  function canSplit(g) {
    var h = g.hands[g.cur];
    return g.phase === 'play' && !!h && !h.done && g.hands.length === 1 && h.cards.length === 2 &&
      val(h.cards[0]) === val(h.cards[1]) && g.chips >= h.bet;
  }
  function canSurrender(g) {
    var h = g.hands[g.cur];
    return g.phase === 'play' && !!h && !h.done && g.hands.length === 1 && h.cards.length === 2 && !h.split;
  }
  function surrender(g) { var h = g.hands[g.cur]; h.sur = true; h.done = true; advance(g); }
  function advance(g) {
    while (g.cur < g.hands.length && g.hands[g.cur].done) g.cur++;
    if (g.cur >= g.hands.length) settle(g);
  }
  function hit(g) {
    var h = g.hands[g.cur]; h.cards.push(draw(g));
    if (score(h.cards).t >= 21) h.done = true;
    advance(g);
  }
  function stand(g) { g.hands[g.cur].done = true; advance(g); }
  function dbl(g) {
    var h = g.hands[g.cur]; g.chips -= h.bet; h.bet *= 2; h.dbl = true; h.cards.push(draw(g)); h.done = true; advance(g);
  }
  function split(g) {
    var h = g.hands[g.cur], c2 = h.cards.pop(), aces = h.cards[0].r === 12;
    g.chips -= h.bet;
    h.cards.push(draw(g)); h.split = true; h.aces = aces;
    var h2 = { cards: [c2, draw(g)], bet: h.bet, done: false, dbl: false, split: true, aces: aces, res: '', pay: 0 };
    g.hands.push(h2);
    if (aces) { h.done = true; h2.done = true; }
    else { if (score(h.cards).t === 21) h.done = true; if (score(h2.cards).t === 21) h2.done = true; }
    advance(g);
  }
  function settle(g) {
    var live = g.hands.some(function (h) { return !h.sur && score(h.cards).t <= 21 && !(isBJ(h.cards) && !h.split); });
    if (live) { while (score(g.dealer).t < 17) g.dealer.push(draw(g)); }       // дилер стоит на всех 17
    var ds = score(g.dealer).t, dBJ = isBJ(g.dealer), total = 0;
    if (g.ins && dBJ) { g.insPay = g.ins * 3; total += g.insPay; }
    g.hands.forEach(function (h) {
      var ps = score(h.cards).t, pBJ = isBJ(h.cards) && !h.split, pay = 0, res;
      if (h.sur) { res = 'surr'; pay = h.bet / 2; }
      else if (ps > 21) res = 'bust';
      else if (pBJ) { if (dBJ) { res = 'push'; pay = h.bet; } else { res = 'bj'; pay = h.bet * 2.5; } }
      else if (dBJ) res = 'lose';
      else if (ds > 21 || ps > ds) { res = 'win'; pay = h.bet * 2; }
      else if (ps === ds) { res = 'push'; pay = h.bet; }
      else res = 'lose';
      h.res = res; h.pay = pay; total += pay;
    });
    g.chips += total; g.phase = 'done'; g.over = true;
    g.net = total - g.hands.reduce(function (s, h) { return s + h.bet; }, 0) - g.ins - g.side + g.sidePay;
  }

  // Базовая стратегия (S17, 6 колод, удвоение после сплита, дилер смотрит под туза/десятку).
  function advice(g) {
    var h = g.hands[g.cur]; if (!h) return 'stand';
    var s = score(h.cards), up = val(g.dealer[0]), cd = canDouble(g), cs = canSplit(g);
    if (cs) {
      var v = val(h.cards[0]);
      var p = v === 11 ? 'P' : v === 10 ? 'S' : v === 9 ? (up === 7 || up >= 10 ? 'S' : 'P') : v === 8 ? 'P' :
        v === 7 ? (up <= 7 ? 'P' : 'H') : v === 6 ? (up <= 6 ? 'P' : 'H') : v === 5 ? 'D' :
        v === 4 ? (up === 5 || up === 6 ? 'P' : 'H') : (up <= 7 ? 'P' : 'H');
      if (p === 'P') return 'split';
      if (p === 'S') return 'stand';
      if (p === 'D') return cd && up <= 9 ? 'double' : 'hit';
      return 'hit';
    }
    var t = s.t;
    if (!s.soft && canSurrender(g) && ((t === 16 && up >= 9) || (t === 15 && up === 10))) return 'surrender';
    if (s.soft && h.cards.length >= 2) {
      if (t >= 20) return 'stand';
      if (t === 19) return 'stand';
      if (t === 18) { if (up >= 3 && up <= 6) return cd ? 'double' : 'stand'; return (up === 2 || up === 7 || up === 8) ? 'stand' : 'hit'; }
      if (t === 17) return (up >= 3 && up <= 6 && cd) ? 'double' : 'hit';
      if (t === 15 || t === 16) return (up >= 4 && up <= 6 && cd) ? 'double' : 'hit';
      return (up >= 5 && up <= 6 && cd) ? 'double' : 'hit';            // 13–14
    }
    if (t >= 17) return 'stand';
    if (t >= 13) return up <= 6 ? 'stand' : 'hit';
    if (t === 12) return (up >= 4 && up <= 6) ? 'stand' : 'hit';
    if (t === 11) return (cd && up <= 10) ? 'double' : 'hit';
    if (t === 10) return (cd && up <= 9) ? 'double' : 'hit';
    if (t === 9) return (cd && up >= 3 && up <= 6) ? 'double' : 'hit';
    return 'hit';
  }
  window.__bj = { surrender: surrender, canSurrender: canSurrender, insure: insure, newGame: newGame, startRound: startRound, hit: hit, stand: stand, dbl: dbl, split: split, canDouble: canDouble, canSplit: canSplit, advice: advice, score: score, isBJ: isBJ, newShoe: newShoe };

  // ---------- кошелёк и статистика ----------
  function today() { return new Date().toISOString().slice(0, 10); }
  function loadWallet() {
    try { wal = JSON.parse(localStorage.getItem(WKEY) || 'null'); } catch (e) { wal = null; }
    if (!wal || typeof wal.chips !== 'number') wal = { chips: 500, best: 0, hands: 0, bonus: '', refill: '' };
  }
  function saveWallet() { try { wal.chips = G.chips; localStorage.setItem(WKEY, JSON.stringify(wal)); } catch (e) {} }
  function loadSt() {
    try { st = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { st = null; }
    if (!st) st = { hands: 0, wins: 0, bj: 0, net: 0, snd: true, hint: false };
    st.side = st.side || 0; st.theme = st.theme || 0; st.hist = st.hist || []; st.dec = st.dec || 0; st.ok = st.ok || 0; st.bet = st.bet || 10;
    st.streak = st.streak || 0; st.bestStreak = st.bestStreak || 0; st.maxWin = st.maxWin || 0;
  }
  function saveSt() { try { localStorage.setItem(SKEY, JSON.stringify(st)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function msg(t) { try { if (typeof popMsg === 'function') popMsg(t); } catch (e) {} }
  function buzz(k) { try { if (typeof haptic === 'function') haptic(k, true); } catch (e) {} }
  function trk(n, a) { try { if (typeof track === 'function') track(n, a); } catch (e) {} }

  // ---------- звук ----------
  var AC = null;
  function tone(f, d, type, vol, delay, slide) {
    try {
      if (st.snd === false) return;
      if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return; AC = new C(); }
      if (AC.state === 'suspended') AC.resume();
      var t0 = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + d);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + d + 0.02);
    } catch (e) {}
  }
  function sfx(k) {
    if (k === 'card') tone(520, 0.05, 'triangle', 0.07, 0, 300);
    else if (k === 'win') [523, 659, 784].forEach(function (f, i) { tone(f, 0.2, 'triangle', 0.14, i * 0.09); });
    else if (k === 'bj') [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, 0.2, 'triangle', 0.14, i * 0.09); });
    else if (k === 'lose') tone(260, 0.3, 'sine', 0.1, 0, 130);
  }

  // ---------- интерфейс ----------
  var ACT_RU = { hit: 'Ещё', stand: 'Хватит', double: 'Удвоить', split: 'Разделить', ins_y: 'Страховка', ins_n: 'Нет, спасибо', surrender: 'Сдаться' };
  var ACT_IC = { hit: '🃏', stand: '✋', double: '⚡', split: '✂️', ins_y: '🛡', ins_n: '👍', surrender: '🏳️' };
  function cardHtml(c, key, i, hidden) {
    var anim = i >= (seen[key] || 0), dl = anim ? ' style="animation-delay:' + ((dealSeq++) * 0.13).toFixed(2) + 's"' : '';
    if (hidden) return '<div class="pk-card bj-c pk-back' + (anim ? ' deal' : '') + '"' + dl + '><span>🎬</span></div>';
    var red = c.s === 1 || c.s === 2, flip = key === 'd' && i === 1 && flipNext;
    return '<div class="pk-card bj-c' + (red ? ' red' : '') + (anim ? ' deal' : '') + (flip ? ' flip' : '') + '"' + dl + '><b>' + RANKS[c.r] + '</b><i>' + SUITS[c.s] +
      '</i><span>' + SUITS[c.s] + '</span><u>' + RANKS[c.r] + '</u></div>';
  }
  function rowHtml(cards, key, hideSecond) {
    var html = cards.map(function (c, i) { return cardHtml(c, key, i, hideSecond && i === 1); }).join('');
    seen[key] = cards.length;
    return '<div class="bj-row' + (cards.length > 2 ? ' fan' : '') + '">' + html + '</div>';
  }
  function totalLabel(cards, hide) {
    if (hide) return '<span class="bj-pill">' + (val(cards[0]) === 11 ? 'Т' : val(cards[0])) + '</span>';
    var s = score(cards), cl = s.t > 21 ? ' bust' : (s.t === 21 ? ' g21' : '');
    return '<span class="bj-pill' + cl + '">' + (s.soft && s.t < 21 ? s.t + ' / ' + (s.t - 10) : s.t) + '</span>';
  }
  function chipCls(b) { return b >= 250 ? 'c250' : b >= 100 ? 'c100' : b >= 50 ? 'c50' : b >= 20 ? 'c20' : 'c10'; }
  function chipHtml(b, extra) { return '<span class="bj-chip ' + chipCls(b) + (extra || '') + '">' + b + '</span>'; }
  function animChips(target) {
    if (chipRaf) { cancelAnimationFrame(chipRaf); chipRaf = 0; }
    var from = shownChips, t0 = 0;
    if (from === target) return;
    function step(ts) {
      var el = document.getElementById('bj-cv'); if (!el) { shownChips = target; chipRaf = 0; return; }
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / 650), e = 1 - Math.pow(1 - k, 3);
      shownChips = Math.round(from + (target - from) * e); el.textContent = shownChips;
      if (k < 1) chipRaf = requestAnimationFrame(step); else { chipRaf = 0; shownChips = target; var pc = el.parentNode; if (pc && pc.classList) { pc.classList.remove('up', 'down'); void pc.offsetWidth; pc.classList.add(target > from ? 'up' : 'down'); } }
    }
    chipRaf = requestAnimationFrame(step);
  }
  function sideHtml() {
    if (G.phase !== 'bet' && G.phase !== 'done') return '';
    return '<div class="bj-side"><span>✨ Бонус «Пара»</span>' + SIDES.map(function (v) {
      var dis = v && G.chips < G.bet + v;
      return '<button class="bj-sb' + ((st.side || 0) === v ? ' on' : '') + '" data-s="' + v + '"' + (dis || revN ? ' disabled' : '') + '>' + (v ? v : 'выкл') + '</button>';
    }).join('') + '<small>одной масти 26:1 · цвета 13:1 · пара 6:1</small></div>';
  }
  function sheetHtml(winrate) {
    var acc = st.dec ? Math.round(st.ok / st.dec * 100) + '%' : '—';
    var cell = function (k, v) { return '<div><b>' + v + '</b><span>' + k + '</span></div>'; };
    return '<div class="bj-sheet"><div class="bj-card"><div class="bj-sh-t">📊 Твоя статистика</div><div class="bj-grid">' +
      cell('раздач', st.hands) + cell('побед', winrate + '%') + cell('блэкджеков', st.bj) + cell('итог', (st.net > 0 ? '+' : '') + Math.round(st.net)) +
      cell('лучшая серия', st.bestStreak) + cell('рекорд выигрыша', '+' + st.maxWin) + cell('точность по стратегии', acc) + cell('карт в колоде', G.shoe.length) +
      '</div><button class="pk-go" id="bj-sheet-x">Закрыть</button></div></div>';
  }
  function histHtml() {
    if (!st.hist.length) return '';
    return '<div class="bj-hist">' + st.hist.map(function (c) { return '<i class="h-' + c + '"></i>'; }).join('') + '</div>';
  }
  function bannerHtml(g) {
    if (!g.over || revN) return '';
    var bj = g.hands.some(function (h) { return h.res === 'bj'; }), n = Math.round(g.net);
    var t = bj ? 'БЛЭКДЖЕК!' : n > 0 ? 'ПОБЕДА' : n < 0 ? (g.hands[0].res === 'surr' ? 'СДАЛСЯ' : g.hands.every(function (h) { return h.res === 'bust'; }) ? 'ПЕРЕБОР' : 'ПРОИГРЫШ') : 'НИЧЬЯ';
    var cls = bj ? 'bj' : n > 0 ? 'win' : n < 0 ? 'lose' : 'push', fx = '';
    if (n > 0) for (var i = 0; i < 14; i++) fx += '<i style="left:' + (6 + i * 6.6) + '%;animation-delay:' + ((i * 53) % 400) / 1000 + 's">' + ['🎞', '✨', '🪙', '🎬'][i % 4] + '</i>';
    return '<div class="bj-banner ' + cls + '"><b>' + t + '</b><span>' + (n > 0 ? '+' + n : n < 0 ? n : '±0') + ' 🎞</span></div>' + (fx ? '<div class="bj-fx">' + fx + '</div>' : '');
  }
  function why(g, a) {
    var h = g.hands[g.cur]; if (!h) return '';
    var up = val(g.dealer[0]), t = score(h.cards).t;
    if (a === 'surrender') return 'Слабая рука против сильной карты дилера: потерять половину ставки выгоднее, чем играть.';
    if (a === 'split') return val(h.cards[0]) === 11 ? 'Тузы делят всегда: две руки с тузом — это сильный старт.' : 'Эту пару выгодно разделить: две руки лучше одной слабой.';
    if (a === 'double') return 'Сильная позиция: у тебя хорошие шансы на 19–21 — удвой ставку.';
    if (a === 'stand') return up >= 2 && up <= 6 ? 'У дилера слабая карта (2–6): он часто переберёт — не рискуй.' : 'Этого достаточно: добор чаще ведёт к перебору, чем к улучшению.';
    return t <= 11 ? 'Перебор невозможен — бери карту.' : 'У дилера сильная карта (' + (up === 11 ? 'туз' : up) + '): сумма ' + t + ' слабовата — нужно добирать.';
  }
  var RES_RU = { bj: '🎉 Блэкджек', win: '✅ Победа', push: '🤝 Ничья', lose: '❌ Проиграл', bust: '💥 Перебор', surr: '🏳️ Сдался' };
  function statusText() {
    var g = G;
    if (revN) return '🎬 Дилер открывает карты…';
    if (g.phase === 'ins') return g.hands[0] && isBJ(g.hands[0].cards) ? 'У тебя блэкджек, у дилера туз' : 'У дилера туз — страховка?';
    if (g.phase === 'bet') return g.chips < 10 ? 'Фишки закончились — бонус будет завтра' : 'Сделай ставку';
    if (g.phase === 'play') {
      var tip = '';
      if (st.hint) tip = ' · 💡 лучше: <b>' + ACT_RU[advice(g)] + '</b>';
      return (g.hands.length > 1 ? 'Рука ' + (g.cur + 1) + ' из 2' : 'Твой ход') + tip;
    }
    var parts = g.hands.map(function (h) { return RES_RU[h.res] + (h.pay - h.bet !== 0 ? ' ' + (h.pay - h.bet > 0 ? '+' : '') + (h.pay - h.bet) : ''); });
    if (g.side) parts.push(g.sidePay ? '✨ «Пара» (' + { perfect: 'одной масти', colored: 'одного цвета', mixed: 'разных цветов' }[g.sideRes] + ') +' + (g.sidePay - g.side) : '✨ «Пара» −' + g.side);
    if (g.ins) parts.push(g.insPay ? '🛡 страховка +' + (g.insPay - g.ins) : '🛡 страховка −' + g.ins);
    if (st.streak >= 2 && g.net > 0) parts.push('🔥 серия ' + st.streak);
    return parts.join(' · ');
  }
  function draw_ui() {
    if (!root) return;
    dealSeq = 0;
    var g = G, play = g.phase === 'play' && !revN, ins = g.phase === 'ins', hideHole = g.phase === 'play' || ins || revHide, shown = revN ? g.dealer.slice(0, revN) : g.dealer;
    var dealerHtml = shown.length ? rowHtml(shown, 'd', hideHole) +
      '<div class="bj-total">' + totalLabel(shown, hideHole) + '</div>' : '<div class="pk-empty">Дилер ждёт ставку</div>';
    var handsHtml = g.hands.map(function (h, i) {
      var cls = 'bj-hand' + (play && i === g.cur && g.hands.length > 1 ? ' active' : '') + (g.over && !revN ? ' ' + h.res : '');
      var s = score(h.cards);
      return '<div class="' + cls + '">' + rowHtml(h.cards, 'h' + i, false) +
        '<div class="bj-total">' + totalLabel(h.cards, false) + '<small class="bj-bet' + (seen.c ? '' : ' drop') + '">' + chipHtml(h.bet / (h.dbl ? 2 : 1)) + (h.dbl ? chipHtml(h.bet / 2, ' dbl') : '') + '</small></div></div>' + (s.t > 21 ? '' : '');
    }).join('');
    var rec = (play && st.hint) ? advice(g) : '';
    var ctl;
    if (ins) {
      var bjNow = isBJ(g.hands[0].cards), can2 = g.chips >= g.bet / 2;
      ctl = '<div class="bj-acts"><button class="bj-act a-stand' + (st.hint ? ' rec' : '') + '" data-a="ins_n"><i>' + ACT_IC.ins_n + '</i>' + (bjNow ? 'Играть дальше' : ACT_RU.ins_n) + '</button>' +
        '<button class="bj-act a-double" data-a="ins_y"' + (can2 ? '' : ' disabled') + '><i>' + ACT_IC.ins_y + '</i>' + (bjNow ? 'Ровно 1:1' : 'Страховка ' + g.bet / 2) + '</button></div>';
    } else if (play) {
      var acts = [['hit', true], ['stand', true], ['double', canDouble(g)], ['split', canSplit(g)]];
      if (canSurrender(g)) acts.push(['surrender', true]);
      ctl = '<div class="bj-acts">' + acts.map(function (a) {
        return '<button class="bj-act a-' + a[0] + (rec === a[0] ? ' rec' : '') + '" data-a="' + a[0] + '"' + (a[1] ? '' : ' disabled') + '><i>' + ACT_IC[a[0]] + '</i>' + ACT_RU[a[0]] + '</button>';
      }).join('') + '</div>' + (st.hint ? '<div class="bj-why">💡 ' + why(g, advice(g)) + '</div>' : '');
    } else {
      var can = g.chips >= g.bet && g.chips >= 10 && !revN;
      ctl = '<div class="pk-bets"><span>Ставка</span>' + BETS.map(function (b) {
        return '<button class="pk-bet bj-chipbtn ' + chipCls(b) + (b === g.bet ? ' on' : '') + '" data-b="' + b + '"' + (b > g.chips || revN ? ' disabled' : '') + '>' + b + '</button>';
      }).join('') + '</div><button class="pk-go" id="bj-go"' + (can ? '' : ' disabled') + '>' + (g.phase === 'done' ? '🔁 Ещё раздача' : '🃏 Раздать') + '</button>';
    }
    var winrate = st.hands ? Math.round(st.wins / st.hands * 100) : 0;
    root.innerHTML = '<div class="pk-top"><button class="pk-x" id="bj-x">✕</button><div class="pk-title">♠️ Блэкджек</div><div class="pk-chips">🎞 <span id="bj-cv">' + shownChips + '</span>' +
      '</div><button class="hd-snd" id="bj-hint" title="Подсказка">' + (st.hint ? '💡' : '🕯') + '</button><button class="hd-snd" id="bj-snd">' + (st.snd === false ? '🔇' : '🔊') + '</button></div>' +
      '<div class="pk-status' + (g.over && !revN && g.net > 0 ? ' win' : '') + '">' + statusText() + '</div>' +
      '<div class="pk-felt bj-felt"><div class="pk-brand">КАПИТАН КИНО · БЛЭКДЖЕК 3:2</div><div class="bj-shoe" title="Карт в колоде"><s></s><s></s><s></s><em>' + g.shoe.length + '</em></div>' +
      '<div class="bj-lbl">🎩 ДИЛЕР</div>' + dealerHtml + '<div class="bj-gap"></div>' +
      '<div class="bj-lbl">ТЫ</div>' + (handsHtml || '<div class="pk-empty">Выбери ставку и раздай</div>') + bannerHtml(g) + '</div>' + histHtml() + sideHtml() + ctl +
      '<div class="bj-tools"><button id="bj-th">🎨 Стол: ' + THEME_RU[THEMES[st.theme % THEMES.length]] + '</button><button id="bj-stat">📊 Статистика</button></div>' +
      '<div class="pk-note">Дилер стоит на 17 · блэкджек 3:2 · удвоение, разделение, сдача · ' + DECKS + ' колод. Виртуальные фишки, общие с видеопокером; купить или вывести их нельзя.</div>' +
      (showSheet ? sheetHtml(winrate) : '');
    root.setAttribute('data-th', THEMES[st.theme % THEMES.length]);
    animChips(revN ? shownChips : g.chips);
    seen.c = 1;
    root.querySelector('#bj-x').onclick = close;
    root.querySelector('#bj-th').onclick = function () { st.theme = (st.theme + 1) % THEMES.length; saveSt(); buzz('light'); draw_ui(); };
    root.querySelector('#bj-stat').onclick = function () { showSheet = true; draw_ui(); };
    var shx = root.querySelector('#bj-sheet-x'); if (shx) shx.onclick = function () { showSheet = false; draw_ui(); };
    root.querySelectorAll('.bj-sb').forEach(function (b) { b.onclick = function () { st.side = +b.dataset.s; saveSt(); buzz('light'); draw_ui(); }; });
    root.querySelector('#bj-snd').onclick = function () { st.snd = st.snd === false; saveSt(); sfx('card'); draw_ui(); };
    root.querySelector('#bj-hint').onclick = function () { st.hint = !st.hint; saveSt(); draw_ui(); };
    var go = root.querySelector('#bj-go'); if (go) go.onclick = deal;
    root.querySelectorAll('.pk-bet').forEach(function (b) { b.onclick = function () { G.bet = +b.dataset.b; buzz('light'); draw_ui(); }; });
    root.querySelectorAll('.bj-act').forEach(function (b) { b.onclick = function () { act(b.dataset.a); }; });
  }
  function applyEnd() {
    var won = G.net > 0;
    sfx(G.hands.some(function (h) { return h.res === 'bj'; }) ? 'bj' : (won ? 'win' : (G.net < 0 ? 'lose' : 'card')));
    buzz(won ? 'success' : 'light');
  }
  function revStep() {
    revTimer = null;
    if (!root || !G) { revN = 0; revHide = false; return; }
    if (revHide) { revHide = false; flipNext = true; sfx('card'); }
    else if (revN < G.dealer.length) { revN++; sfx('card'); }
    else { revN = 0; applyEnd(); draw_ui(); return; }
    draw_ui(); flipNext = false; revTimer = setTimeout(revStep, 600);
  }
  function finishIfOver() {
    if (G.phase !== 'done') return;
    st.hands++; st.net += G.net;
    var won = G.net > 0; if (won) st.wins++;
    if (won) { st.streak++; if (st.streak > st.bestStreak) st.bestStreak = st.streak; if (G.net > st.maxWin) st.maxWin = G.net; } else if (G.net < 0) st.streak = 0;
    if (G.hands.some(function (h) { return h.res === 'bj'; })) st.bj++;
    st.hist.push(G.hands.some(function (h) { return h.res === 'bj'; }) ? 'b' : G.net > 0 ? 'w' : G.net < 0 ? 'l' : 'p'); if (st.hist.length > 14) st.hist.shift();
    saveSt(); saveWallet();
    var live = G.hands.some(function (h) { return !h.sur && score(h.cards).t <= 21 && !(isBJ(h.cards) && !h.split); });
    if (live) { revN = 2; revHide = true; revTimer = setTimeout(revStep, 650); } else applyEnd();
  }
  function deal() {
    if (G.phase === 'play' || G.phase === 'ins' || revN) return;
    if (G.chips < G.bet) G.bet = BETS.filter(function (b) { return b <= G.chips; }).pop() || 10;
    if (G.chips < G.bet) return;
    seen = {}; st.bet = G.bet; startRound(G, G.bet, st.side || 0); saveWallet(); sfx('card'); buzz('light'); trk('bj_hand', G.bet);
    if (G.shuffled) msg('🔀 Колоду перетасовали');
    finishIfOver(); draw_ui();
  }
  function act(a) {
    if (!G || revN) return;
    if (G.phase === 'ins') { if (a === 'ins_y' || a === 'ins_n') { st.dec++; if (a === 'ins_n') st.ok++; insure(G, a === 'ins_y'); sfx('card'); buzz('light'); saveWallet(); finishIfOver(); draw_ui(); } return; }
    if (G.phase !== 'play') return;
    var best = advice(G);
    if (a === 'hit' || a === 'stand' || (a === 'double' && canDouble(G)) || (a === 'split' && canSplit(G)) || (a === 'surrender' && canSurrender(G))) { st.dec++; if (a === best) st.ok++; }
    if (a === 'surrender' && canSurrender(G)) surrender(G); else if (a === 'hit') hit(G); else if (a === 'stand') stand(G);
    else if (a === 'double' && canDouble(G)) dbl(G); else if (a === 'split' && canSplit(G)) split(G); else return;
    sfx('card'); buzz('light'); saveWallet(); finishIfOver(); draw_ui();
  }
  function open() {
    loadWallet(); loadSt();
    var got = false;
    if (wal.bonus !== today()) { wal.bonus = today(); wal.chips += 200; got = true; }
    if (wal.chips < 10 && wal.refill !== today()) { wal.refill = today(); wal.chips = 100; got = 'refill'; }
    try { localStorage.setItem(WKEY, JSON.stringify(wal)); } catch (e) {}
    if (root) root.remove();
    if (revTimer) { clearTimeout(revTimer); revTimer = null; } revN = 0; revHide = false;
    root = document.createElement('div'); root.className = 'pk-overlay bj-overlay'; document.body.appendChild(root);
    G = newGame(wal.chips); seen = {}; shownChips = wal.chips; showSheet = false;
    if (BETS.indexOf(st.bet) >= 0 && st.bet <= G.chips) G.bet = st.bet;
    if (G.chips < G.bet) G.bet = 10;
    trk('bj_open');
    draw_ui();
    if (got === true) msg('🎁 Ежедневный бонус: +200 фишек');
    else if (got === 'refill') msg('🎞 Фишки закончились — держи 100 на сегодня');
  }
  function close() {
    if (revTimer) { clearTimeout(revTimer); revTimer = null; } revN = 0; revHide = false; if (chipRaf) { cancelAnimationFrame(chipRaf); chipRaf = 0; }
    if (G && (G.phase === 'play' || G.phase === 'ins')) { msg('Раздача не закончена: ставка сгорела'); }
    if (root) { root.remove(); root = null; }
  }
  window.openBlackjack = open;
})();
// </blackjack>

// <casino>
// v241: Казино-игры на общих фишках (localStorage kino_poker): Киноавтомат (слоты), Рулетка, Мины.
// Общий каркас: кошелёк + ежедневный бонус + звук + шапка с плавным счётчиком фишек (без спойлера до конца анимации).
(function () {
  'use strict';
  var WKEY = 'kino_poker', SKEY = 'kino_cg';
  var BETS = [10, 20, 50, 100, 250];
  var W = null, S = null, root = null, cur = null, shown = 0, chipRaf = 0, AC = null, timers = [];

  // ---------- общее ----------
  function rnd(n) { try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch (e) { return Math.floor(Math.random() * n); } }
  function today() { return new Date().toISOString().slice(0, 10); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function msg(t) { try { if (typeof popMsg === 'function') popMsg(t); } catch (e) {} }
  function buzz(k) { try { if (typeof haptic === 'function') haptic(k, true); } catch (e) {} }
  function trk(n, a) { try { if (typeof track === 'function') track(n, a); } catch (e) {} }
  function later(fn, ms) { var t = setTimeout(function () { var i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); fn(); }, ms); timers.push(t); return t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; if (chipRaf) { cancelAnimationFrame(chipRaf); chipRaf = 0; } }
  function load() {
    try { W = JSON.parse(localStorage.getItem(WKEY) || 'null'); } catch (e) { W = null; }
    if (!W || typeof W.chips !== 'number') W = { chips: 500, best: 0, hands: 0, bonus: '', refill: '' };
    try { S = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { S = null; }
    if (!S) S = {};
    S.snd = S.snd !== false; S.turbo = !!S.turbo;
    S.slots = S.slots || { spins: 0, wagered: 0, won: 0, best: 0, bonus: 0, bet: 10 };
    S.rl = S.rl || { spins: 0, wagered: 0, won: 0, best: 0, hist: [] };
    S.mn = S.mn || { games: 0, wins: 0, best: 0, bet: 10, m: 3, wagered: 0, won: 0 };
    S.dc = S.dc || { games: 0, wins: 0, best: 0, bet: 10, chance: 50, dir: 'under', hist: [] };
    S.pl = S.pl || { games: 0, wins: 0, best: 0, bet: 10, risk: 'mid', hist: [], top: 0 };
    S.hl = S.hl || { games: 0, wins: 0, best: 0, bet: 10, bestRun: 0 };
  }
  function saveW() { try { localStorage.setItem(WKEY, JSON.stringify(W)); } catch (e) {} }
  function saveS() { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} }

  // ---------- звук ----------
  function tone(f, d, type, vol, delay, slide) {
    try {
      if (!S.snd) return;
      if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return; AC = new C(); }
      if (AC.state === 'suspended') AC.resume();
      var t0 = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + d);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + d + 0.02);
    } catch (e) {}
  }
  function sfx(k) {
    if (k === 'tick') tone(900, 0.03, 'square', 0.04, 0, 600);
    else if (k === 'spin') [300, 380, 460, 540].forEach(function (f, i) { tone(f, 0.08, 'sawtooth', 0.05, i * 0.07); });
    else if (k === 'stop') tone(220, 0.1, 'triangle', 0.12, 0, 110);
    else if (k === 'win') [523, 659, 784].forEach(function (f, i) { tone(f, 0.2, 'triangle', 0.14, i * 0.09); });
    else if (k === 'big') [523, 659, 784, 1046, 1318, 1568].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.15, i * 0.08); });
    else if (k === 'lose') tone(260, 0.3, 'sine', 0.1, 0, 130);
    else if (k === 'gem') tone(880 + rnd(300), 0.14, 'sine', 0.12, 0, 1400);
    else if (k === 'boom') { tone(140, 0.5, 'sawtooth', 0.2, 0, 40); tone(90, 0.6, 'square', 0.12, 0.05, 30); }
    else if (k === 'coin') { tone(988, 0.08, 'square', 0.07); tone(1318, 0.18, 'square', 0.07, 0.07); }
    else if (k === 'ball') tone(1200, 0.04, 'triangle', 0.06, 0, 800);
  }

  // ---------- оболочка ----------
  function openShell(id, title) {
    load();
    var got = false;
    if (W.bonus !== today()) { W.bonus = today(); W.chips += 200; got = true; }
    if (W.chips < 10 && W.refill !== today()) { W.refill = today(); W.chips = 100; got = 'refill'; }
    saveW();
    closeShell(true);
    root = document.createElement('div'); root.className = 'pk-overlay cg-overlay cg-' + id; document.body.appendChild(root);
    shown = W.chips; cur = id;
    return got;
  }
  function welcome(got) {
    if (got === true) msg('🎁 Ежедневный бонус: +200 фишек');
    else if (got === 'refill') msg('🎞 Фишки закончились — держи 100 на сегодня');
  }
  function head(title) {
    return '<div class="pk-top"><button class="pk-x" id="cg-x">✕</button><div class="pk-title">' + title + '</div><div class="pk-chips">🎞 <span id="cg-cv">' + shown +
      '</span></div><button class="hd-snd" id="cg-snd">' + (S.snd ? '🔊' : '🔇') + '</button></div>';
  }
  function bindHead(onSnd) {
    var x = root.querySelector('#cg-x'); if (x) x.onclick = function () { if (cur && api[cur] && api[cur].beforeClose) api[cur].beforeClose(); closeShell(); };
    var sn = root.querySelector('#cg-snd'); if (sn) sn.onclick = function () { S.snd = !S.snd; saveS(); sn.textContent = S.snd ? '🔊' : '🔇'; sfx('tick'); };
  }
  function closeShell(silent) {
    clearTimers();
    if (root) { root.remove(); root = null; }
    cur = null; shown = W ? W.chips : 0;
  }
  function setChips(target, instant) {
    if (chipRaf) { cancelAnimationFrame(chipRaf); chipRaf = 0; }
    var from = shown, t0 = 0;
    function put(v) { var el = document.getElementById('cg-cv'); if (el) el.textContent = v; }
    if (instant || from === target) { shown = target; put(target); return; }
    function step(ts) {
      var el = document.getElementById('cg-cv'); if (!el) { shown = target; chipRaf = 0; return; }
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / 650), e = 1 - Math.pow(1 - k, 3);
      shown = Math.round(from + (target - from) * e); el.textContent = shown;
      if (k < 1) chipRaf = requestAnimationFrame(step);
      else { chipRaf = 0; shown = target; var pc = el.parentNode; if (pc && pc.classList) { pc.classList.remove('up', 'down'); void pc.offsetWidth; pc.classList.add(target > from ? 'up' : 'down'); } }
    }
    chipRaf = requestAnimationFrame(step);
  }
  function chipCls(b) { return b >= 250 ? 'c250' : b >= 100 ? 'c100' : b >= 50 ? 'c50' : b >= 20 ? 'c20' : 'c10'; }
  function betChips(cur_, maxChips, locked, attr) {
    return '<div class="cg-bets">' + BETS.map(function (b) {
      return '<button class="cg-chip ' + chipCls(b) + (b === cur_ ? ' on' : '') + '" data-' + (attr || 'b') + '="' + b + '"' + (locked || b > maxChips ? ' disabled' : '') + '>' + b + '</button>';
    }).join('') + '</div>';
  }
  function banner(text, sub, cls, ms) {
    if (!root) return;
    var old = root.querySelector('.cg-banner'); if (old) old.remove();
    var el = document.createElement('div'); el.className = 'cg-banner ' + (cls || 'win');
    el.innerHTML = '<b>' + text + '</b>' + (sub ? '<span>' + sub + '</span>' : '');
    root.appendChild(el);
    later(function () { if (el.parentNode) el.remove(); }, ms || 2400);
  }
  function confetti(n) {
    if (!root) return; var fx = document.createElement('div'), h = ''; fx.className = 'cg-fx';
    for (var i = 0; i < (n || 16); i++) h += '<i style="left:' + (4 + i * (92 / (n || 16))) + '%;animation-delay:' + ((i * 53) % 420) / 1000 + 's">' + ['🎞', '✨', '🪙', '🎬', '🍿'][i % 5] + '</i>';
    fx.innerHTML = h; root.appendChild(fx); later(function () { fx.remove(); }, 2300);
  }
  var api = {};

  // =====================================================================
  //  🎰 КИНОАВТОМАТ
  // =====================================================================
  var SYM = ['🎟', '🍿', '🎞', '🎭', '🎥', '⭐', '🎬'], SYM_RU = ['билет', 'попкорн', 'плёнка', 'маски', 'камера', 'джокер', 'клапперборд'];
  var STRIP_COUNTS = [9, 7, 5, 4, 3, 2, 2], PAY = [3, 7, 13, 25, 70, 180];
  var LINES = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]], FREE_SPINS = 8, FREE_MULT = 2, SCATTER_PAY = 1, CELL = 76;
  function makeStrip(seed) {
    var rest = [], k = seed;
    STRIP_COUNTS.forEach(function (n, s) { for (var i = 0; i < n; i++) rest.push(s); });
    function r(n) { k = (k * 1103515245 + 12345) & 0x7fffffff; return k % n; }
    for (var i = rest.length - 1; i > 0; i--) { var j = r(i + 1), t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    for (var g = 0; g < 400; g++) {
      var bad = false;
      for (var q = 0; q < rest.length; q++) if (rest[q] === rest[(q + 1) % rest.length]) { var j2 = r(rest.length), t2 = rest[q]; rest[q] = rest[j2]; rest[j2] = t2; bad = true; }
      if (!bad) break;
    }
    return rest;
  }
  var STRIPS = [makeStrip(7), makeStrip(13), makeStrip(29)];
  function spinGrid() {
    var grid = [[], [], []];
    for (var r = 0; r < 3; r++) { var s = STRIPS[r], p = rnd(s.length); for (var w = 0; w < 3; w++) grid[r][w] = s[(p + w) % s.length]; }
    return grid;
  }
  function evalGrid(grid, lineBet, bet, mult) {
    var wins = [], total = 0;
    LINES.forEach(function (ln, li) {
      var a = [grid[0][ln[0]], grid[1][ln[1]], grid[2][ln[2]]], base = -1, ok = true;
      for (var i = 0; i < 3; i++) { if (a[i] === 6) { ok = false; break; } if (a[i] !== 5) { if (base < 0) base = a[i]; else if (base !== a[i]) { ok = false; break; } } }
      if (!ok) return;
      var sym = base < 0 ? 5 : base, amount = PAY[sym] * lineBet * mult;
      wins.push({ line: li, sym: sym, amount: amount }); total += amount;
    });
    var sc = 0, scPos = [];
    for (var r = 0; r < 3; r++) for (var w = 0; w < 3; w++) if (grid[r][w] === 6) { sc++; scPos.push([r, w]); }
    var scat = 0, free = 0;
    if (sc >= 3) { scat = SCATTER_PAY * bet * mult; free = FREE_SPINS; }
    return { wins: wins, lines: total, sc: sc, scPos: scPos, scat: scat, free: free, total: total + scat };
  }
  var SL = null;   // состояние сессии слотов
  function slOpen() {
    var got = openShell('slots');
    SL = { bet: BETS.indexOf(S.slots.bet) >= 0 ? S.slots.bet : 10, grid: spinGrid(), busy: false, fs: null, last: null, paytable: false, led: 0, winLines: null };
    if (SL.bet > W.chips) SL.bet = 10;
    trk('slots_open'); slDraw(); welcome(got);
  }
  function cellHtml(s, hit) { return '<div class="sl-cell s' + s + (hit ? ' hit' : '') + (s === 6 ? ' scat' : '') + (s === 5 ? ' wild' : '') + '">' + SYM[s] + '</div>'; }
  function slReelsHtml(hits) {
    var h = '';
    for (var r = 0; r < 3; r++) {
      h += '<div class="sl-reel"><div class="sl-strip" id="sl-r' + r + '">';
      for (var w = 0; w < 3; w++) h += cellHtml(SL.grid[r][w], hits && hits[r + ',' + w]);
      h += '</div></div>';
    }
    return h;
  }
  function slDraw(hits) {
    var lb = SL.bet / 5, canSpin = !SL.busy && !SL.fs && W.chips >= SL.bet;
    root.innerHTML = head('🎰 Киноавтомат') +
      '<div class="pk-status" id="sl-status">' + (SL.fs ? '🎬 Бесплатные спины: ' + SL.fs.left + ' · выиграно ' + SL.fs.total : (SL.last ? SL.last : (W.chips < SL.bet ? 'Мало фишек — уменьши ставку' : 'Крути барабаны!'))) + '</div>' +
      '<div class="sl-machine' + (SL.fs ? ' bonus' : '') + '"><div class="sl-lever' + (SL.busy ? ' pull' : '') + '"><i></i></div><div class="sl-marq">★ КАПИТАН КИНО · КИНОАВТОМАТ ★</div>' +
      '<div class="sl-bulbs">' + new Array(15).join('<i></i>') + '<i></i></div>' +
      '<div class="sl-win" id="sl-win">' + slReelsHtml(hits) + slLinesSvg() + '</div>' +
      '<div class="sl-led"><span>ВЫИГРЫШ</span><b id="sl-led">' + (SL.led || 0) + '</b></div>' +
      '<div class="sl-info"><span>5 линий · по ' + lb + ' на линию</span><span>🎬×3 — 8 бесплатных спинов</span></div></div>' +
      betChips(SL.bet, W.chips, SL.busy || !!SL.fs) +
      '<button class="cg-go" id="sl-go"' + (canSpin ? '' : ' disabled') + '>' + (SL.fs ? '🎬 Бонус идёт…' : (SL.busy ? '🎰 Крутится…' : '🎰 КРУТИТЬ · ' + SL.bet)) + '</button>' +
      '<div class="bj-tools"><button id="sl-pt">ℹ️ Выплаты</button><button id="sl-turbo">⚡ Быстро: ' + (S.turbo ? 'вкл' : 'выкл') + '</button></div>' +
      '<div class="pk-note">Джокер ⭐ заменяет любой символ, кроме 🎬. Три 🎬 в любом месте запускают бонус: 8 спинов с выигрышем ×2. Виртуальные фишки, общие с покером и блэкджеком; купить или вывести их нельзя. Лучший выигрыш: ' + (S.slots.best ? '+' + S.slots.best : '—') + '</div>' +
      (SL.paytable ? slPaytable() : '');
    bindHead();
    root.querySelectorAll('.cg-chip').forEach(function (b) { b.onclick = function () { SL.bet = +b.dataset.b; S.slots.bet = SL.bet; saveS(); buzz('light'); sfx('tick'); slDraw(); }; });
    var go = root.querySelector('#sl-go'); if (go) go.onclick = function () { slSpin(false); };
    root.querySelector('#sl-pt').onclick = function () { SL.paytable = true; slDraw(); };
    root.querySelector('#sl-turbo').onclick = function () { S.turbo = !S.turbo; saveS(); slDraw(); };
    var px = root.querySelector('#sl-pt-x'); if (px) px.onclick = function () { SL.paytable = false; slDraw(); };
  }
  var LINE_COL = ['#ffd25a', '#5be28c', '#5bb8ff', '#ff7ad9', '#ff9a4a'];
  function slLinesSvg() {
    if (!SL.winLines || !SL.winLines.length) return '';
    var h = '<svg class="sl-lines" viewBox="0 0 3 3" preserveAspectRatio="none">';
    SL.winLines.forEach(function (li) {
      var ln = LINES[li], y = function (r) { return ln[r] + 0.5; };
      h += '<polyline points="0.02,' + y(0) + ' 0.5,' + y(0) + ' 1.5,' + y(1) + ' 2.5,' + y(2) + ' 2.98,' + y(2) + '" stroke="' + LINE_COL[li] + '" class="sl-pl"/>';
    });
    return h + '</svg>';
  }
  function countUp(id, to) {
    var el = document.getElementById(id); if (!el || !to) return;
    var t0 = 0;
    (function step(ts) { var e = document.getElementById(id); if (!e) return; if (!t0) t0 = ts; var k = Math.min(1, (ts - t0) / 700); e.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(performance.now());
  }
  function slPaytable() {
    var rows = '';
    for (var s = 5; s >= 0 && s <= 5; s--) rows += '<div class="sl-prow"><span>' + SYM[s] + SYM[s] + SYM[s] + '</span><b>×' + PAY[s] + '</b></div>';
    return '<div class="bj-sheet"><div class="bj-card"><div class="bj-sh-t">ℹ️ Выплаты (×ставка на линию)</div><div class="sl-ptab">' + rows +
      '<div class="sl-prow"><span>🎬🎬🎬 где угодно</span><b>бонус</b></div></div><div class="pk-note">Линии: 3 горизонтали и 2 диагонали. ⭐ — джокер. В бонусе все выигрыши ×2.</div><button class="pk-go" id="sl-pt-x">Закрыть</button></div></div>';
  }
  function slSpin(free) {
    if (SL.busy) return;
    var bet = SL.bet, mult = free ? FREE_MULT : 1;
    if (!free) { if (W.chips < bet) { msg('Не хватает фишек'); return; } W.chips -= bet; S.slots.wagered += bet; }
    S.slots.spins++; SL.busy = true; SL.last = ''; SL.winLines = null; SL.led = free && SL.fs ? SL.fs.total : 0;
    var prev = SL.grid, grid = spinGrid(), res = evalGrid(grid, bet / 5, bet, mult);
    SL.grid = grid;
    W.chips += res.total; W.hands = (W.hands || 0) + 1; S.slots.won += res.total; saveW();   // зачисляем сразу, показываем после остановки
    if (res.total > S.slots.best) S.slots.best = res.total;
    saveS(); trk('slots_spin', free ? 'free' : bet);
    if (!free) setChips(W.chips - res.total);            // показываем только списание ставки
    // перерисовка с «летящими» барабанами
    if (!free) slDraw(); else { var go0 = root.querySelector('#sl-go'); if (go0) go0.disabled = true; }
    var spinMs = S.turbo ? 0.55 : 1.0, stagger = S.turbo ? 0.2 : 0.42, total = 0;
    sfx('spin');
    for (var r = 0; r < 3; r++) {
      var strip = root.querySelector('#sl-r' + r), F = 12 + r * 5, cells = '';
      for (var i = 0; i < 3; i++) cells += cellHtml(prev[r][i]);
      for (var f = 0; f < F; f++) cells += cellHtml(rnd(7));
      for (var j = 0; j < 3; j++) cells += cellHtml(grid[r][j]);
      strip.innerHTML = cells; strip.style.transition = 'none'; strip.style.transform = 'translateY(0)'; strip.classList.add('spinning');
      void strip.offsetWidth;
      var dur = spinMs + r * stagger; total = Math.max(total, dur);
      strip.style.transition = 'transform ' + dur + 's cubic-bezier(.2,.85,.25,1.04)';
      strip.style.transform = 'translateY(-' + ((F + 3) * CELL) + 'px)';
      (function (rr, d) { later(function () { sfx('stop'); var st = root && root.querySelector('#sl-r' + rr); if (st) st.classList.remove('spinning'); }, d * 1000); })(r, dur);
    }
    later(function () { slReveal(res, free); }, total * 1000 + 120);
  }
  function slReveal(res, free) {
    if (!root || cur !== 'slots') return;
    if (!free && SL && res.total >= SL.bet * 20) { try { window.casinoShare('🎰 Выбил +' + res.total + ' фишек в Киноавтомате «Капитана Кино»! Виртуальные фишки, только для fun.'); } catch (e) {} }
    var hits = {};
    res.wins.forEach(function (w) { LINES[w.line].forEach(function (row, reel) { hits[reel + ',' + row] = 1; }); });
    res.scPos.forEach(function (p) { if (res.sc >= 3) hits[p[0] + ',' + p[1]] = 1; });
    SL.busy = false;
    if (SL.fs) { SL.fs.total += res.total; SL.fs.left--; }
    SL.winLines = res.wins.map(function (w) { return w.line; });
    var txt = res.total > 0 ? ('✅ Выигрыш +' + res.total + (res.wins.length ? ' · линий: ' + res.wins.length : '')) : (free ? '— пусто —' : 'Не повезло — крути ещё');
    if (SL.fs) txt = '🎬 Бонус: осталось ' + SL.fs.left + ' · выиграно ' + SL.fs.total;
    SL.last = SL.fs ? '' : txt;
    setChips(W.chips);                                   // теперь показываем итог
    if (res.free && !SL.fs && !free) { SL.fs = { left: res.free, total: res.total }; }
    var big = res.total >= SL.bet * 10;
    if (res.total > 0) { sfx(big ? 'big' : 'win'); buzz('success'); if (big) confetti(18); } else sfx('lose');
    var ledTo = SL.fs ? SL.fs.total : res.total; SL.led = ledTo;
    slDraw(hits); if (ledTo) { var le = document.getElementById('sl-led'); if (le) le.textContent = 0; countUp('sl-led', ledTo); }
    if (SL.fs && SL.fs.left === res.free && res.free) {      // только что запустили бонус
      banner('🎬 БОНУС!', FREE_SPINS + ' спинов × ' + FREE_MULT, 'bj', 2000); sfx('big'); confetti(20);
      later(function () { slSpin(true); }, 2300);
    } else if (SL.fs && SL.fs.left > 0) {
      later(function () { slSpin(true); }, S.turbo ? 700 : 1300);
    } else if (SL.fs) {
      var t = SL.fs.total; SL.fs = null; SL.last = '🎬 Бонус завершён: +' + t; S.slots.bonus++; saveS();
      later(function () { if (cur !== 'slots') return; banner('БОНУС ЗАВЕРШЁН', '+' + t + ' 🎞', t >= SL.bet * 10 ? 'bj' : 'win', 2600); if (t > 0) { sfx('big'); confetti(18); } slDraw(); }, 500);
    } else if (res.total >= SL.bet * 5) {
      banner(big ? 'КРУПНЫЙ ВЫИГРЫШ!' : 'ВЫИГРЫШ', '+' + res.total + ' 🎞', big ? 'bj' : 'win', 2000);
    }
  }
  function slBeforeClose() {
    // закрыли посреди бонуса — доигрываем оставшиеся спины мгновенно, чтобы награда не пропала
    if (SL && SL.fs) {
      var left = SL.fs.left, bet = SL.bet;
      for (var i = 0; i < left; i++) { var r = evalGrid(spinGrid(), bet / 5, bet, FREE_MULT); W.chips += r.total; S.slots.won += r.total; }
      saveW(); saveS(); SL.fs = null;
    }
  }
  api.slots = { open: slOpen, beforeClose: slBeforeClose };

  // =====================================================================
  //  🎡 РУЛЕТКА (европейская, 37 ячеек)
  // =====================================================================
  var WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  var REDS = { 1: 1, 3: 1, 5: 1, 7: 1, 9: 1, 12: 1, 14: 1, 16: 1, 18: 1, 19: 1, 21: 1, 23: 1, 25: 1, 27: 1, 30: 1, 32: 1, 34: 1, 36: 1 };
  var STEP = 360 / 37;
  function numColor(n) { return n === 0 ? 'g' : (REDS[n] ? 'r' : 'b'); }
  var OUT = {   // внешние ставки: [подпись, множитель с возвратом ставки, функция выигрыша]
    low: ['1–18', 2, function (n) { return n >= 1 && n <= 18; }], high: ['19–36', 2, function (n) { return n >= 19; }],
    even: ['ЧЁТ', 2, function (n) { return n > 0 && n % 2 === 0; }], odd: ['НЕЧЕТ', 2, function (n) { return n % 2 === 1; }],
    red: ['🔴', 2, function (n) { return !!REDS[n]; }], black: ['⚫', 2, function (n) { return n > 0 && !REDS[n]; }],
    d1: ['1–12', 3, function (n) { return n >= 1 && n <= 12; }], d2: ['13–24', 3, function (n) { return n >= 13 && n <= 24; }], d3: ['25–36', 3, function (n) { return n >= 25; }],
    c1: ['2к1', 3, function (n) { return n > 0 && n % 3 === 1; }], c2: ['2к1', 3, function (n) { return n > 0 && n % 3 === 2; }], c3: ['2к1', 3, function (n) { return n > 0 && n % 3 === 0; }]
  };
  function betWin(key, n) {   // выплата по одной ставке (сумма × множитель), 0 если проиграла
    if (key.charAt(0) === 'n') return +key.slice(1) === n ? 36 : 0;
    return OUT[key][2](n) ? OUT[key][1] : 0;
  }
  var RL = null;
  function rlOpen() {
    var got = openShell('roulette');
    RL = { chip: 10, bets: {}, stack: [], last: null, busy: false, rot: 0, ball: 0, res: null, msg: '' };
    if (S.rl.chip && BETS.indexOf(S.rl.chip) >= 0) RL.chip = S.rl.chip;
    if (RL.chip > W.chips) RL.chip = 10;
    trk('rl_open'); rlDraw(); welcome(got);
  }
  function rlTotal() { var t = 0; for (var k in RL.bets) t += RL.bets[k]; return t; }
  function wheelSvg() {
    var s = '<svg viewBox="-100 -100 200 200" class="rl-svg"><defs><radialGradient id="rlwood" cx="50%" cy="50%" r="50%"><stop offset="86%" stop-color="#3b1f0c"/><stop offset="93%" stop-color="#8a5320"/><stop offset="100%" stop-color="#2a1507"/></radialGradient>' +
      '<radialGradient id="rlhub" cx="40%" cy="35%" r="70%"><stop offset="0%" stop-color="#ffe9a8"/><stop offset="55%" stop-color="#d9a441"/><stop offset="100%" stop-color="#7a5217"/></radialGradient></defs>' +
      '<circle r="100" fill="url(#rlwood)"/><circle r="98" fill="none" stroke="#f5b942" stroke-width="1"/><g id="rl-wheel" style="transform:rotate(' + RL.rot + 'deg)">';
    for (var i = 0; i < 37; i++) {
      var n = WHEEL[i], a0 = (i - 0.5) * STEP, a1 = (i + 0.5) * STEP, R = 96, r = 62;
      function P(rad, a) { var t = (a - 90) * Math.PI / 180; return (rad * Math.cos(t)).toFixed(2) + ' ' + (rad * Math.sin(t)).toFixed(2); }
      s += '<path d="M' + P(R, a0) + ' A' + R + ' ' + R + ' 0 0 1 ' + P(R, a1) + ' L' + P(r, a1) + ' A' + r + ' ' + r + ' 0 0 0 ' + P(r, a0) + ' Z" class="rl-s ' + numColor(n) + '"/>';
      var tp = P(80, i * STEP).split(' ');
      s += '<text x="' + tp[0] + '" y="' + tp[1] + '" class="rl-t" transform="rotate(' + (i * STEP).toFixed(2) + ' ' + tp[0] + ' ' + tp[1] + ')">' + n + '</text>';
    }
    s += '<circle r="60" class="rl-hub1"/><circle r="40" class="rl-hub2"/>';
    for (var q = 0; q < 4; q++) s += '<line x1="0" y1="-58" x2="0" y2="58" class="rl-spoke" transform="rotate(' + (q * 45) + ')"/>';
    s += '<circle r="15" fill="url(#rlhub)" stroke="#fff3c4" stroke-width="1"/><text y="7" class="rl-hubt">🎬</text></g></svg>';
    return s;
  }
  function rlCell(key, label, cls) {
    var amt = RL.bets[key], win = RL.res && !RL.busy && (RL.res.key[key] || key === 'n' + RL.res.n);
    return '<button class="rl-c ' + (cls || '') + (amt ? ' has' : '') + (win ? ' won' : '') + '" data-k="' + key + '"' + (RL.busy ? ' disabled' : '') + '>' + label + (amt ? '<em class="rl-tok ' + chipCls(amt >= 250 ? 250 : amt >= 100 ? 100 : amt >= 50 ? 50 : amt >= 20 ? 20 : 10) + '">' + amt + '</em>' : '') + '</button>';
  }
  function rlTable() {
    var h = '<div class="rl-table">' + rlCell('n0', '0', 'g z');
    for (var row = 0; row < 12; row++) for (var c = 1; c <= 3; c++) { var n = row * 3 + c; h += rlCell('n' + n, n, numColor(n)); }
    h += rlCell('c1', '2к1', 'o col') + rlCell('c2', '2к1', 'o col') + rlCell('c3', '2к1', 'o col');
    h += rlCell('d1', '1–12', 'o dz') + rlCell('d2', '13–24', 'o dz') + rlCell('d3', '25–36', 'o dz');
    h += '</div><div class="rl-out">' + ['low', 'even', 'red', 'black', 'odd', 'high'].map(function (k) { return rlCell(k, OUT[k][0], 'o ' + (k === 'red' ? 'r' : k === 'black' ? 'b' : '')); }).join('') + '</div>';
    return h;
  }
  function rlDraw() {
    var tot = rlTotal(), can = !RL.busy && tot > 0;
    var hist = S.rl.hist.slice(-14).map(function (n) { return '<i class="' + numColor(n) + '">' + n + '</i>'; }).join('');
    root.innerHTML = head('🎡 Рулетка') +
      '<div class="pk-status" id="rl-status">' + (RL.msg || (tot ? 'Ставок на столе: ' + tot : 'Ставь фишки на поле и крути')) + '</div>' +
      '<div class="rl-wheelbox' + (RL.res && !RL.busy ? ' done' : '') + '"><div class="rl-ptr">▼</div>' + wheelSvg() + '<div class="rl-ballw" id="rl-ballw" style="transform:rotate(' + RL.ball + 'deg)"><i class="rl-ball"></i></div>' +
      '<div class="rl-num ' + (RL.res ? numColor(RL.res.n) : '') + '" id="rl-num">' + (RL.res && !RL.busy ? RL.res.n : '') + '</div></div>' +
      (hist ? '<div class="rl-hist">' + hist + '</div>' : '') + '<div class="rl-felt">' + rlTable() + '</div>' +
      '<div class="pk-note">Европейская рулетка: один «0». Число — ×36, цвет/чёт/половина — ×2, дюжина и колонка — ×3. Виртуальные фишки, общие с другими играми; купить или вывести их нельзя.</div>' +
      '<div class="rl-bar">' + betChips(RL.chip, W.chips - tot, RL.busy) +
      '<div class="rl-btns"><button id="rl-undo"' + (RL.busy || !RL.stack.length ? ' disabled' : '') + '>↩️</button><button id="rl-clr"' + (RL.busy || !tot ? ' disabled' : '') + '>🗑</button>' +
      '<button id="rl-rep"' + (RL.busy || tot || !RL.last ? ' disabled' : '') + '>🔁</button>' +
      '<button class="cg-go" id="rl-go"' + (can ? '' : ' disabled') + '>' + (RL.busy ? 'Крутится…' : '🎡 Крутить · ' + tot) + '</button></div></div>';
    bindHead();
    root.querySelectorAll('.cg-chip').forEach(function (b) { b.onclick = function () { RL.chip = +b.dataset.b; S.rl.chip = RL.chip; saveS(); sfx('tick'); rlDraw(); }; });
    root.querySelectorAll('.rl-c').forEach(function (b) { b.onclick = function () { rlBet(b.dataset.k); }; });
    root.querySelector('#rl-undo').onclick = function () { var k = RL.stack.pop(); if (k) { RL.bets[k.k] -= k.a; if (RL.bets[k.k] <= 0) delete RL.bets[k.k]; } sfx('tick'); rlDraw(); };
    root.querySelector('#rl-clr').onclick = function () { RL.bets = {}; RL.stack = []; sfx('tick'); rlDraw(); };
    root.querySelector('#rl-rep').onclick = function () { rlRepeat(); };
    root.querySelector('#rl-go').onclick = rlSpin;
  }
  function rlBet(key) {
    if (RL.busy) return;
    if (W.chips - rlTotal() < RL.chip) { msg('Не хватает фишек на такую ставку'); return; }
    RL.bets[key] = (RL.bets[key] || 0) + RL.chip; RL.stack.push({ k: key, a: RL.chip }); RL.res = null; RL.msg = '';
    sfx('coin'); buzz('light'); rlDraw();
  }
  function rlRepeat() {
    var tot = 0; for (var k in RL.last) tot += RL.last[k];
    if (tot > W.chips) { msg('Не хватает фишек повторить ставки'); return; }
    RL.bets = {}; RL.stack = []; for (var k2 in RL.last) { RL.bets[k2] = RL.last[k2]; RL.stack.push({ k: k2, a: RL.last[k2] }); }
    RL.res = null; RL.msg = ''; sfx('coin'); rlDraw();
  }
  function rlSpin() {
    if (RL.busy) return; var tot = rlTotal(); if (!tot || tot > W.chips) return;
    var n = rnd(37), idx = WHEEL.indexOf(n), win = 0, hit = {};
    for (var k in RL.bets) { var m = betWin(k, n); if (m) { win += RL.bets[k] * m; hit[k] = 1; } }
    W.chips += win - tot; W.hands = (W.hands || 0) + 1; saveW();
    S.rl.spins++; for (var hk in hit) { if (hk.charAt(0) === 'n') S.rl.num = (S.rl.num || 0) + 1; } S.rl.wagered += tot; S.rl.won += win; if (win - tot > S.rl.best) S.rl.best = win - tot;
    S.rl.hist.push(n); if (S.rl.hist.length > 30) S.rl.hist.shift(); saveS(); trk('rl_spin', tot);
    RL.last = JSON.parse(JSON.stringify(RL.bets)); RL.busy = true; RL.res = { n: n, key: hit, win: win, tot: tot };
    setChips(W.chips - win);                                  // до конца вращения показываем остаток без выигрыша
    var dur = S.turbo ? 2.6 : 5.0;
    var target = (((-idx * STEP - RL.rot) % 360) + 360) % 360;
    RL.rot = RL.rot + 360 * 5 + target;
    RL.ball = RL.ball - 360 * 6;
    var wheel = root.querySelector('#rl-wheel'), ball = root.querySelector('#rl-ballw');
    root.querySelectorAll('.rl-c').forEach(function (b) { b.disabled = true; });
    ['rl-go', 'rl-undo', 'rl-clr', 'rl-rep'].forEach(function (id) { var e = root.querySelector('#' + id); if (e) e.disabled = true; });
    root.querySelector('#rl-status').textContent = '🎡 Шарик пошёл…';
    wheel.style.transition = 'transform ' + dur + 's cubic-bezier(.12,.6,.12,1)'; wheel.style.transform = 'rotate(' + RL.rot + 'deg)';
    ball.style.transition = 'transform ' + (dur + 0.2) + 's cubic-bezier(.2,.55,.15,1)'; ball.style.transform = 'rotate(' + RL.ball + 'deg)';
    for (var i = 0; i < 10; i++) (function (j) { later(function () { sfx('ball'); }, (dur * 1000) * (0.35 + j * 0.065)); })(i);
    later(function () { rlReveal(); }, dur * 1000 + 350);
  }
  function rlReveal() {
    if (!root || cur !== 'roulette') return;
    var r = RL.res, net = r.win - r.tot; RL.busy = false; RL.bets = {}; RL.stack = [];
    for (var hk2 in r.key) { if (hk2.charAt(0) === 'n') { try { window.casinoShare('🎡 Угадал точное число ' + r.n + ' в рулетке «Капитана Кино»! Виртуальные фишки, только для fun.'); } catch (e) {} } }
    RL.msg = (numColor(r.n) === 'g' ? '🟢' : numColor(r.n) === 'r' ? '🔴' : '⚫') + ' Выпало ' + r.n + ' · ' + (net > 0 ? 'выигрыш +' + net : net < 0 ? 'минус ' + (-net) : 'вернул ставку');
    setChips(W.chips);
    if (net > 0) { sfx(net >= r.tot * 5 ? 'big' : 'win'); buzz('success'); if (net >= r.tot * 3) confetti(16); } else if (net < 0) sfx('lose');
    rlDraw();
    banner('' + r.n, net > 0 ? '+' + net + ' 🎞' : net < 0 ? '−' + (-net) + ' 🎞' : 'ничья', net > 0 ? 'win' : net < 0 ? 'lose' : 'push', 1800);
  }
  api.roulette = { open: rlOpen, beforeClose: function () { } };

  // =====================================================================
  //  💣 МИНЫ (поле 5×5)
  // =====================================================================
  var MN = null, MN_EDGE = 0.97, MINES_OPT = [1, 3, 5, 10, 18];
  function mnMult(m, k) {      // множитель после k безопасных открытий (комиссия 3%)
    var x = MN_EDGE;
    for (var i = 0; i < k; i++) x *= (25 - i) / (25 - m - i);
    return x;
  }
  function fmtX(x) { return x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2); }
  function mnOpen() {
    var got = openShell('mines');
    MN = { bet: BETS.indexOf(S.mn.bet) >= 0 ? S.mn.bet : 10, m: MINES_OPT.indexOf(S.mn.m) >= 0 ? S.mn.m : 3, phase: 'bet', mines: [], open: [], k: 0, hit: -1, lastMsg: '' };
    if (MN.bet > W.chips) MN.bet = 10;
    trk('mn_open'); mnDraw(); welcome(got);
  }
  function mnPayout() { return Math.floor(MN.bet * mnMult(MN.m, MN.k)); }
  function mnDraw() {
    var play = MN.phase === 'play', over = MN.phase === 'over';
    var grid = '';
    for (var i = 0; i < 25; i++) {
      var o = MN.open.indexOf(i) >= 0, isM = MN.mines.indexOf(i) >= 0, cls = 'mn-t';
      var face = '';
      if (o) { cls += ' gem'; face = '<span>💎</span><em>✦</em><em class="b">✦</em>'; }
      else if (over && isM) { cls += (i === MN.hit ? ' boom' : ' mine'); face = '<span>' + (i === MN.hit ? '💥' : '💣') + '</span>' + (i === MN.hit ? [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) { return '<i class="sp" style="--a:' + a + 'deg"></i>'; }).join('') : ''); }
      else if (over) { cls += ' dim'; face = '<span>💎</span>'; }
      grid += '<button class="' + cls + '" data-i="' + i + '"' + (play && !o ? '' : ' disabled') + '>' + face + '</button>';
    }
    var next = '';
    var lad = '';
    if (play) {
      for (var st_ = MN.k + 1; st_ <= Math.min(25 - MN.m, MN.k + 4); st_++) lad += '<span class="' + (st_ === MN.k + 1 ? 'nx' : '') + '">×' + fmtX(mnMult(MN.m, st_)) + '</span>';
      lad = '<div class="mn-lad"><b>' + (MN.k ? '×' + fmtX(mnMult(MN.m, MN.k)) : 'старт') + '</b>' + lad + '</div>';
    }
    root.innerHTML = head('💣 Мины') +
      '<div class="pk-status">' + (play ? (MN.k ? '💎 ' + MN.k + ' · ×' + fmtX(mnMult(MN.m, MN.k)) + ' · забрать ' + mnPayout() : 'Открой клетку — не наступи на мину') : (MN.lastMsg || 'Выбери ставку и число мин')) + '</div>' +
      '<div class="mn-box' + (over && MN.hit >= 0 ? ' shake' : '') + '"><div class="mn-top"><span>💣 ' + MN.m + '</span><span>💎 ' + (MN.k) + ' / ' + (25 - MN.m) + '</span></div>' + lad + '<div class="mn-grid">' + grid + '</div>' + (over && MN.hit >= 0 ? '<div class="mn-flash"></div>' : '') + '</div>' +
      (play ?
        '<div class="mn-actions"><button class="cg-go gold" id="mn-cash"' + (MN.k ? '' : ' disabled') + '>💰 Забрать ' + (MN.k ? mnPayout() : '') + '</button><button class="cg-sec" id="mn-rand">🎲 Случайная</button></div>' :
        '<div class="mn-setup"><div class="mn-lbl">Мин на поле</div><div class="mn-opts">' + MINES_OPT.map(function (m) { return '<button class="mn-o' + (m === MN.m ? ' on' : '') + '" data-m="' + m + '">' + m + '</button>'; }).join('') + '</div>' +
        '<div class="mn-lbl">Ставка · первый шаг ×' + fmtX(mnMult(MN.m, 1)) + ' · максимум ×' + fmtX(mnMult(MN.m, 25 - MN.m)) + '</div>' + betChips(MN.bet, W.chips, false) +
        '<button class="cg-go" id="mn-go"' + (W.chips >= MN.bet ? '' : ' disabled') + '>' + (over ? '🔁 Ещё игра · ' : '💣 Играть · ') + MN.bet + '</button></div>') +
      '<div class="pk-note">Чем больше мин, тем выше множитель за каждую открытую клетку. Можно забрать выигрыш в любой момент — наступишь на мину, ставка сгорит. Комиссия 3%. Виртуальные фишки, общие с другими играми; купить или вывести их нельзя. Лучший множитель: ' + (S.mn.best ? '×' + fmtX(S.mn.best) : '—') + '</div>';
    bindHead();
    root.querySelectorAll('.cg-chip').forEach(function (b) { b.onclick = function () { MN.bet = +b.dataset.b; S.mn.bet = MN.bet; saveS(); sfx('tick'); mnDraw(); }; });
    root.querySelectorAll('.mn-o').forEach(function (b) { b.onclick = function () { MN.m = +b.dataset.m; S.mn.m = MN.m; saveS(); sfx('tick'); mnDraw(); }; });
    root.querySelectorAll('.mn-t').forEach(function (b) { b.onclick = function () { mnPick(+b.dataset.i); }; });
    var go = root.querySelector('#mn-go'); if (go) go.onclick = mnStart;
    var cash = root.querySelector('#mn-cash'); if (cash) cash.onclick = function () { mnCash(false); };
    var rd = root.querySelector('#mn-rand'); if (rd) rd.onclick = function () {
      var free = []; for (var i = 0; i < 25; i++) if (MN.open.indexOf(i) < 0) free.push(i);
      if (free.length) mnPick(free[rnd(free.length)]);
    };
  }
  function mnStart() {
    if (W.chips < MN.bet) { msg('Не хватает фишек'); return; }
    W.chips -= MN.bet; W.hands = (W.hands || 0) + 1; saveW(); S.mn.games++; S.mn.wagered += MN.bet; saveS(); trk('mn_game', MN.m);
    var mines = [];
    while (mines.length < MN.m) { var c = rnd(25); if (mines.indexOf(c) < 0) mines.push(c); }
    MN.mines = mines; MN.open = []; MN.k = 0; MN.hit = -1; MN.phase = 'play'; MN.lastMsg = '';
    setChips(W.chips); sfx('coin'); mnDraw();
  }
  function mnPick(i) {
    if (!MN || MN.phase !== 'play' || MN.open.indexOf(i) >= 0) return;
    if (MN.mines.indexOf(i) >= 0) {
      MN.hit = i; MN.phase = 'over'; MN.lastMsg = '💥 Мина! Ставка ' + MN.bet + ' сгорела';
      sfx('boom'); buzz('error'); mnDraw();
      banner('БУМ!', '−' + MN.bet + ' 🎞', 'lose', 1800);
      return;
    }
    MN.open.push(i); MN.k++; sfx('gem'); buzz('light');
    if (MN.k >= 25 - MN.m) { mnCash(true); return; }
    mnDraw();
  }
  function mnCash(perfect) {
    if (!MN || MN.phase !== 'play' || !MN.k) return;
    var pay = mnPayout(), x = mnMult(MN.m, MN.k), net = pay - MN.bet;
    W.chips += pay; saveW(); S.mn.wins++; S.mn.won += pay; if (x > S.mn.best) S.mn.best = x; saveS();
    if (x >= 5) { try { window.casinoShare('💣 Забрал ×' + fmtX(x) + ' в Минах «Капитана Кино»! Виртуальные фишки, только для fun.'); } catch (e) {} }
    MN.phase = 'over'; MN.hit = -1; MN.lastMsg = (perfect ? '🏆 Все клетки открыты! ' : '💰 Забрал ') + '+' + pay + ' (×' + fmtX(x) + ')';
    setChips(W.chips); sfx(x >= 5 ? 'big' : 'win'); buzz('success'); mnDraw();
    banner(perfect ? 'ИДЕАЛЬНО!' : 'ЗАБРАЛ!', '+' + pay + ' 🎞 · ×' + fmtX(x), net > 0 ? (x >= 5 ? 'bj' : 'win') : 'push', 2200);
    if (x >= 3) confetti(16);
  }
  api.mines = { open: mnOpen, beforeClose: function () { /* закрыли посреди игры — ставка сгорает (как в блэкджеке) */ if (MN && MN.phase === 'play') msg('Игра не закончена: ставка сгорела'); } };

  // =====================================================================
  //  🎲 КОСТИ (число 0–99: «меньше» или «больше», шанс выбираешь сам)
  // =====================================================================
  var DC = null, DC_EDGE = 0.97, DC_CH = [10, 25, 50, 75, 90];
  function dcMult(ch) { return DC_EDGE * 100 / ch; }
  function dcWinZone(dir, ch, roll) { return dir === 'under' ? roll < ch : roll >= 100 - ch; }
  function dcOpen() {
    var got = openShell('dice');
    var ch = S.dc.chance; if (ch < 5 || ch > 90) ch = 50;
    DC = { bet: BETS.indexOf(S.dc.bet) >= 0 ? S.dc.bet : 10, ch: ch, dir: S.dc.dir === 'over' ? 'over' : 'under', busy: false, roll: null, msg: '', win: null };
    if (DC.bet > W.chips) DC.bet = 10;
    trk('dc_open'); dcDraw(); welcome(got);
  }
  function dcDraw() {
    var m = dcMult(DC.ch), pay = Math.floor(DC.bet * m), zl = DC.dir === 'under' ? 0 : 100 - DC.ch;
    var hist = (S.dc.hist || []).slice(-10).map(function (x) { return '<i class="' + (x[1] ? 'w' : 'l') + '">' + x[0] + '</i>'; }).join('');
    var can = !DC.busy && W.chips >= DC.bet;
    root.innerHTML = head('🎲 Кости') +
      '<div class="pk-status" id="dc-status">' + (DC.busy ? '🎲 Кубики катятся…' : (DC.msg || 'Выбери шанс и сторону — ' + (DC.dir === 'under' ? 'выпадет МЕНЬШЕ' : 'выпадет БОЛЬШЕ'))) + '</div>' +
      '<div class="dc-box"><div class="dc-num' + (DC.win === true ? ' win' : DC.win === false ? ' lose' : '') + '" id="dc-num">' + (DC.roll == null ? '··' : DC.roll) + '</div>' +
      '<div class="dc-bar"><div class="dc-zone" style="left:' + zl + '%;width:' + DC.ch + '%"></div>' + (DC.roll != null && !DC.busy ? '<div class="dc-pin" style="left:' + DC.roll + '%"><b>' + DC.roll + '</b></div>' : '') + '<div class="dc-pin ghost" id="dc-ghost" style="left:50%;display:none"></div></div>' +
      '<div class="dc-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>99</span></div></div>' +
      '<div class="dc-dir"><button class="' + (DC.dir === 'under' ? 'on' : '') + '" data-d="under"' + (DC.busy ? ' disabled' : '') + '>⬇️ Меньше ' + DC.ch + '</button><button class="' + (DC.dir === 'over' ? 'on' : '') + '" data-d="over"' + (DC.busy ? ' disabled' : '') + '>⬆️ Больше ' + (99 - DC.ch) + '</button></div>' +
      '<div class="mn-setup"><div class="mn-lbl">Шанс <b>' + DC.ch + '%</b> · множитель <b>×' + fmtX(m) + '</b> · выигрыш ' + pay + '</div>' +
      '<input type="range" class="dc-range" id="dc-range" min="5" max="90" step="1" value="' + DC.ch + '"' + (DC.busy ? ' disabled' : '') + '>' +
      '<div class="mn-opts">' + DC_CH.map(function (c) { return '<button class="mn-o' + (c === DC.ch ? ' on' : '') + '" data-c="' + c + '"' + (DC.busy ? ' disabled' : '') + '>' + c + '%</button>'; }).join('') + '</div>' +
      '<div class="mn-lbl">Ставка</div>' + betChips(DC.bet, W.chips, DC.busy) +
      '<button class="cg-go" id="dc-go"' + (can ? '' : ' disabled') + '>' + (DC.busy ? 'Катится…' : '🎲 Бросить · ' + DC.bet) + '</button></div>' +
      '<div class="dc-hist">' + hist + '</div>' +
      '<div class="pk-note">Выпадает число от 0 до 99. Чем меньше шанс — тем выше множитель. Виртуальные фишки, не вывести.</div>';
    bindHead();
    root.querySelectorAll('.cg-chip').forEach(function (b) { b.onclick = function () { DC.bet = +b.dataset.b; S.dc.bet = DC.bet; saveS(); sfx('tick'); dcDraw(); }; });
    root.querySelectorAll('.dc-dir button').forEach(function (b) { b.onclick = function () { DC.dir = b.dataset.d; S.dc.dir = DC.dir; saveS(); sfx('tick'); dcDraw(); }; });
    root.querySelectorAll('.mn-o').forEach(function (b) { b.onclick = function () { DC.ch = +b.dataset.c; S.dc.chance = DC.ch; saveS(); sfx('tick'); dcDraw(); }; });
    var rg = root.querySelector('#dc-range');
    if (rg) { rg.oninput = function () { DC.ch = +rg.value; S.dc.chance = DC.ch; dcDraw(); var r2 = root.querySelector('#dc-range'); if (r2) r2.focus(); }; rg.onchange = function () { saveS(); }; }
    root.querySelector('#dc-go').onclick = dcRoll;
  }
  function dcRoll() {
    if (DC.busy || W.chips < DC.bet) return;
    var roll = rnd(100), win = dcWinZone(DC.dir, DC.ch, roll), pay = win ? Math.floor(DC.bet * dcMult(DC.ch)) : 0;
    W.chips += pay - DC.bet; W.hands = (W.hands || 0) + 1; saveW();
    S.dc.games++; if (win) { S.dc.wins++; if (DC.ch <= 10) S.dc.low = (S.dc.low || 0) + 1; if (pay - DC.bet > S.dc.best) S.dc.best = pay - DC.bet; }
    S.dc.hist = (S.dc.hist || []).concat([[roll, win ? 1 : 0]]).slice(-20); saveS(); trk('dc_roll', DC.ch);
    DC.busy = true; DC.win = null; DC.roll = null; DC.msg = '';
    setChips(W.chips - pay);
    dcDraw();
    var steps = S.turbo ? 8 : 16, i = 0, el;
    (function tick() {
      el = document.getElementById('dc-num'); if (!root || cur !== 'dice' || !el) return;
      if (i < steps) { el.textContent = rnd(100); sfx('tick'); i++; later(tick, 40 + i * 9); }
      else {
        DC.busy = false; DC.roll = roll; DC.win = win;
        var net = pay - DC.bet;
        DC.msg = win ? '✅ Выпало ' + roll + ' · +' + net : '❌ Выпало ' + roll + ' · −' + DC.bet;
        setChips(W.chips); if (win) { sfx(net >= DC.bet * 4 ? 'big' : 'win'); buzz('success'); if (net >= DC.bet * 3) confetti(16); } else { sfx('lose'); buzz('error'); }
        dcDraw();
        banner(win ? 'ПОБЕДА' : 'МИМО', win ? '+' + net + ' 🎞 · ×' + fmtX(dcMult(DC.ch)) : '−' + DC.bet + ' 🎞', win ? 'win' : 'lose', 1500);
      }
    })();
  }
  api.dice = { open: dcOpen, beforeClose: function () {} };

  // =====================================================================
  //  🃏 ВЫШЕ / НИЖЕ (лесенка карт: угадывай и забирай вовремя)
  // =====================================================================
  var HL = null, HL_EDGE = 0.97, HL_CAP = 500, HL_SUITS = ['♠', '♥', '♦', '♣'];
  function hlRank(r) { return r <= 10 ? String(r) : { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' }[r]; }
  function hlP(r, dir) { return dir === 'hi' ? (14 - r) / 13 : (r - 2) / 13; }
  function hlStep(r, dir) { var p = hlP(r, dir); return p > 0 ? HL_EDGE / p : 0; }
  function hlCard(c, cls) { var red = c.s === 1 || c.s === 2; return '<div class="hl-card' + (red ? ' red' : '') + (cls ? ' ' + cls : '') + '"><b>' + hlRank(c.r) + '</b><span>' + HL_SUITS[c.s] + '</span></div>'; }
  function hlNew() { return { r: 2 + rnd(13), s: rnd(4) }; }
  function hlOpen() {
    var got = openShell('hilo');
    HL = { bet: BETS.indexOf(S.hl.bet) >= 0 ? S.hl.bet : 10, phase: 'bet', card: hlNew(), mult: 1, k: 0, hist: [], msg: '', last: null };
    if (HL.bet > W.chips) HL.bet = 10;
    trk('hl_open'); hlDraw(); welcome(got);
  }
  function hlPay() { return Math.floor(HL.bet * HL.mult); }
  function hlDraw() {
    var play = HL.phase === 'play', over = HL.phase === 'over';
    var hi = hlStep(HL.card.r, 'hi'), lo = hlStep(HL.card.r, 'lo');
    var hist = HL.hist.slice(-6).map(function (c) { return hlCard(c, 'mini'); }).join('');
    root.innerHTML = head('🃏 Выше / Ниже') +
      '<div class="pk-status">' + (play ? (HL.k ? '🔥 Серия ' + HL.k + ' · ×' + fmtX(HL.mult) + ' · забрать ' + hlPay() : 'Угадай: следующая карта выше или ниже?') : (HL.msg || 'Угадывай карты — множитель растёт с каждым шагом')) + '</div>' +
      '<div class="hl-box"><div class="hl-hist">' + hist + '</div><div class="hl-main">' + hlCard(HL.card, HL.last === 'ok' ? 'ok' : HL.last === 'bad' ? 'bad' : 'deal') + '</div>' +
      (play ? '<div class="hl-odds">Шанс выше <b>' + Math.round(hlP(HL.card.r, 'hi') * 100) + '%</b> · ниже <b>' + Math.round(hlP(HL.card.r, 'lo') * 100) + '%</b> · при равной карте проигрыш</div>' : '') + '</div>' +
      (play ?
        '<div class="hl-btns"><button class="hl-b up" data-d="hi"' + (hi ? '' : ' disabled') + '>⬆️ Выше<small>' + (hi ? '×' + fmtX(HL.mult * hi) : '—') + '</small></button><button class="hl-b dn" data-d="lo"' + (lo ? '' : ' disabled') + '>⬇️ Ниже<small>' + (lo ? '×' + fmtX(HL.mult * lo) : '—') + '</small></button></div>' +
        '<button class="cg-go gold" id="hl-cash"' + (HL.k ? '' : ' disabled') + '>💰 Забрать ' + (HL.k ? hlPay() : '') + '</button>' :
        '<div class="mn-setup"><div class="mn-lbl">Ставка</div>' + betChips(HL.bet, W.chips, false) +
        '<button class="cg-go" id="hl-go"' + (W.chips >= HL.bet ? '' : ' disabled') + '>' + (over ? '🔁 Ещё раз · ' : '🃏 Играть · ') + HL.bet + '</button></div>') +
      '<div class="pk-note">Карты 2–Т, каждая раздаётся случайно. Забрать выигрыш можно в любой момент после первого угаданного шага. Виртуальные фишки.</div>';
    bindHead();
    root.querySelectorAll('.cg-chip').forEach(function (b) { b.onclick = function () { HL.bet = +b.dataset.b; S.hl.bet = HL.bet; saveS(); sfx('tick'); hlDraw(); }; });
    root.querySelectorAll('.hl-b').forEach(function (b) { b.onclick = function () { hlGuess(b.dataset.d); }; });
    var go = root.querySelector('#hl-go'); if (go) go.onclick = hlStart;
    var cs = root.querySelector('#hl-cash'); if (cs) cs.onclick = function () { hlCash(false); };
  }
  function hlStart() {
    if (W.chips < HL.bet) { msg('Не хватает фишек'); return; }
    W.chips -= HL.bet; W.hands = (W.hands || 0) + 1; saveW(); S.hl.games++; saveS(); trk('hl_game');
    HL.phase = 'play'; HL.card = hlNew(); HL.mult = 1; HL.k = 0; HL.hist = []; HL.msg = ''; HL.last = null;
    if (!hlStep(HL.card.r, 'hi') || !hlStep(HL.card.r, 'lo')) { /* туз/двойка: одна сторона недоступна — это нормально */ }
    setChips(W.chips); sfx('coin'); hlDraw();
  }
  function hlGuess(dir) {
    if (!HL || HL.phase !== 'play') return;
    var step = hlStep(HL.card.r, dir); if (!step) return;
    var nx = hlNew(), win = dir === 'hi' ? nx.r > HL.card.r : nx.r < HL.card.r;
    HL.hist.push(HL.card); HL.card = nx;
    if (win) {
      HL.k++; HL.mult *= step; HL.last = 'ok'; sfx('gem'); buzz('light');
      if (HL.k > S.hl.bestRun) { S.hl.bestRun = HL.k; saveS(); }
      if (HL.mult >= HL_CAP) { HL.mult = HL_CAP; hlCash(true); return; }
      hlDraw();
    } else {
      HL.phase = 'over'; HL.last = 'bad'; HL.msg = '💥 Не угадал: выпала ' + hlRank(nx.r) + HL_SUITS[nx.s] + ' · ставка ' + HL.bet + ' сгорела';
      sfx('lose'); buzz('error'); hlDraw(); banner('МИМО', '−' + HL.bet + ' 🎞', 'lose', 1600);
    }
  }
  function hlCash(max) {
    if (!HL || HL.phase !== 'play' || !HL.k) return;
    var pay = hlPay(), net = pay - HL.bet;
    W.chips += pay; saveW(); S.hl.wins++; if (net > S.hl.best) S.hl.best = net; saveS();
    HL.phase = 'over'; HL.last = null; HL.msg = (max ? '🏆 Потолок ×' + HL_CAP + '! ' : '💰 Забрал ') + '+' + pay + ' (×' + fmtX(HL.mult) + ', серия ' + HL.k + ')';
    setChips(W.chips); sfx(HL.mult >= 5 ? 'big' : 'win'); buzz('success'); hlDraw();
    banner(max ? 'ПОТОЛОК!' : 'ЗАБРАЛ!', '+' + pay + ' 🎞 · ×' + fmtX(HL.mult), net > 0 ? (HL.mult >= 5 ? 'bj' : 'win') : 'push', 2000);
    if (HL.mult >= 3) confetti(16);
    if (HL.mult >= 8) { try { window.casinoShare('🃏 Забрал ×' + fmtX(HL.mult) + ' в «Выше/Ниже» «Капитана Кино»! Серия ' + HL.k + '. Виртуальные фишки, только для fun.'); } catch (e) {} }
  }
  api.hilo = { open: hlOpen, beforeClose: function () { if (HL && HL.phase === 'play') msg('Игра не закончена: ставка сгорела'); } };

  // =====================================================================
  //  🔮 ПЛИНКО (шарик падает по колышкам в одну из 9 лунок)
  // =====================================================================
  var PL = null, PL_ROWS = 8, PL_DY = 34;
  var PL_MULT = { low: [5.6, 2.1, 1.1, 1.0, 0.43, 1.0, 1.1, 2.1, 5.6], mid: [13, 3, 1.3, 0.7, 0.33, 0.7, 1.3, 3, 13], high: [29, 4, 1.5, 0.3, 0.12, 0.3, 1.5, 4, 29] };
  var PL_RISK = [['low', 'Спокойно'], ['mid', 'Средне'], ['high', 'Рискованно']];
  function plOpen() {
    var got = openShell('plinko');
    PL = { bet: BETS.indexOf(S.pl.bet) >= 0 ? S.pl.bet : 10, risk: PL_MULT[S.pl.risk] ? S.pl.risk : 'mid', busy: false, slot: -1, msg: '' };
    if (PL.bet > W.chips) PL.bet = 10;
    trk('pl_open'); plDraw(); welcome(got);
  }
  function plBoard() {
    var pegs = '', r, j, slots = '', k, ms = PL_MULT[PL.risk];
    for (r = 0; r < PL_ROWS; r++) for (j = 0; j <= r; j++) pegs += '<i class="pl-peg" style="left:calc(50% + ' + ((j - r / 2) * 10) + '%);top:' + (r * PL_DY + 44) + 'px"></i>';
    for (k = 0; k < 9; k++) {
      var m = ms[k], cls = m >= 5 ? 'hi' : m >= 1.5 ? 'mid' : m >= 1 ? 'ok' : 'lo';
      slots += '<b class="pl-slot ' + cls + (PL.slot === k ? ' hit' : '') + '" data-k="' + k + '" style="left:calc(50% + ' + ((k - 4) * 10) + '%)">' + (m >= 10 ? m.toFixed(0) : m) + '</b>';
    }
    return '<div class="pl-board" style="height:' + (PL_ROWS * PL_DY + 100) + 'px">' + pegs + '<div class="pl-ball" id="pl-ball" style="display:none"></div>' + slots + '</div>';
  }
  function plDraw() {
    var hist = (S.pl.hist || []).slice(-10).map(function (x) { return '<i class="' + (x >= 1 ? 'w' : 'l') + '">×' + x + '</i>'; }).join('');
    var can = !PL.busy && W.chips >= PL.bet;
    root.innerHTML = head('🔮 Плинко') +
      '<div class="pk-status">' + (PL.busy ? '🔮 Шарик катится…' : (PL.msg || 'Брось шарик — он упадёт в одну из лунок')) + '</div>' +
      plBoard() +
      '<div class="mn-setup"><div class="mn-opts pl-risk">' + PL_RISK.map(function (r) { return '<button class="mn-o' + (r[0] === PL.risk ? ' on' : '') + '" data-r="' + r[0] + '"' + (PL.busy ? ' disabled' : '') + '>' + r[1] + '</button>'; }).join('') + '</div>' +
      '<div class="mn-lbl">Ставка</div>' + betChips(PL.bet, W.chips, PL.busy) +
      '<button class="cg-go" id="pl-go"' + (can ? '' : ' disabled') + '>' + (PL.busy ? 'Катится…' : '🔮 Бросить · ' + PL.bet) + '</button></div>' +
      '<div class="dc-hist">' + hist + '</div>' +
      '<div class="pk-note">Края платят больше, центр — меньше ставки. Чем выше риск, тем жирнее края. Виртуальные фишки.</div>';
    bindHead();
    root.querySelectorAll('.cg-chip').forEach(function (b) { b.onclick = function () { PL.bet = +b.dataset.b; S.pl.bet = PL.bet; saveS(); sfx('tick'); plDraw(); }; });
    root.querySelectorAll('.pl-risk .mn-o').forEach(function (b) { b.onclick = function () { PL.risk = b.dataset.r; S.pl.risk = PL.risk; saveS(); sfx('tick'); PL.slot = -1; plDraw(); }; });
    root.querySelector('#pl-go').onclick = plDrop;
  }
  function plDrop() {
    if (PL.busy || W.chips < PL.bet) return;
    var path = [], k = 0, i;
    for (i = 0; i < PL_ROWS; i++) { var right = rnd(2); path.push(right); k += right; }
    var m = PL_MULT[PL.risk][k], pay = Math.floor(PL.bet * m);
    W.chips += pay - PL.bet; W.hands = (W.hands || 0) + 1; saveW();
    S.pl.games++; if (pay > PL.bet) { S.pl.wins++; if (pay - PL.bet > S.pl.best) S.pl.best = pay - PL.bet; }
    if (m > (S.pl.top || 0)) S.pl.top = m;
    S.pl.hist = (S.pl.hist || []).concat([m]).slice(-20); saveS(); trk('pl_drop', PL.risk);
    PL.busy = true; PL.slot = -1; PL.msg = '';
    setChips(W.chips - pay);
    plDraw();
    var ball = root.querySelector('#pl-ball'), step = S.turbo ? 120 : 210, rr = 0;
    function place(r, kk, ms_) {
      ball.style.transition = 'left ' + ms_ + 'ms ease-in-out, top ' + ms_ + 'ms cubic-bezier(.35,0,.9,.6)';
      ball.style.left = 'calc(50% + ' + ((kk - r / 2) * 10) + '%)'; ball.style.top = (r * PL_DY + 44 - 14) + 'px';
    }
    ball.style.display = 'block'; ball.style.transition = 'none'; ball.style.left = '50%'; ball.style.top = '4px';
    void ball.offsetWidth;
    var kk = 0;
    (function hop() {
      if (!root || cur !== 'plinko') return;
      if (rr < PL_ROWS) {
        place(rr, kk, step); sfx('ball'); kk += path[rr]; rr++;
        later(hop, step);
      } else {
        ball.style.transition = 'left ' + step + 'ms ease-in, top ' + step + 'ms ease-in';
        ball.style.left = 'calc(50% + ' + ((k - 4) * 10) + '%)'; ball.style.top = (PL_ROWS * PL_DY + 44 + 10) + 'px';
        later(function () { plLand(k, m, pay); }, step + 60);
      }
    })();
  }
  function plLand(k, m, pay) {
    if (!root || cur !== 'plinko') return;
    var net = pay - PL.bet; PL.busy = false; PL.slot = k;
    PL.msg = (net > 0 ? '✅ ×' + m + ' · +' + net : net === 0 ? '↔️ ×' + m + ' · ставка вернулась' : '❌ ×' + m + ' · −' + (-net));
    setChips(W.chips);
    if (net > 0) { sfx(m >= 5 ? 'big' : 'win'); buzz('success'); if (m >= 3) confetti(16); } else { sfx('lose'); }
    if (m >= 13) { try { window.casinoShare('🔮 Шарик упал в ×' + m + ' в Плинко «Капитана Кино»! Виртуальные фишки, только для fun.'); } catch (e) {} }
    plDraw();
    banner('×' + m, net > 0 ? '+' + net + ' 🎞' : net < 0 ? '−' + (-net) + ' 🎞' : 'вернул', net > 0 ? (m >= 5 ? 'bj' : 'win') : net < 0 ? 'lose' : 'push', 1400);
  }
  api.plinko = { open: plOpen, beforeClose: function () {} };

  window.openPlinko = function () { api.plinko.open(); };
  window.openDice = function () { api.dice.open(); };
  window.openHilo = function () { api.hilo.open(); };
  window.openSlots = function () { api.slots.open(); };
  window.openRoulette = function () { api.roulette.open(); };
  window.openMines = function () { api.mines.open(); };
  window.__cg = { evalGrid: evalGrid, spinGrid: spinGrid, mnMult: mnMult, betWin: betWin, WHEEL: WHEEL };
})();
// </casino>

/* ===== HOLDEM:BEGIN (v196: Стол Капитана) ===== */
// <engine>
const HE = (function () {
  const RANK_CH = '23456789TJQKA', SUIT_CH = '♠♥♦♣', RU = { T: '10', J: 'В', Q: 'Д', K: 'К', A: 'Т' };
  const CAT = ['Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш'];
  const cardStr = c => (RU[RANK_CH[c % 13]] || RANK_CH[c % 13]) + SUIT_CH[Math.floor(c / 13)];
  const rankOf = c => c % 13, suitOf = c => Math.floor(c / 13);
  function cmp(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d < 0 ? -1 : 1; } return 0; }
  function rank5(cards) {
    const rs = cards.map(rankOf).sort((a, b) => b - a);
    const flush = new Set(cards.map(suitOf)).size === 1;
    const uniq = [...new Set(rs)];
    let sh = null;
    if (uniq.length === 5) { if (uniq[0] - uniq[4] === 4) sh = uniq[0]; else if (uniq.join() === '12,3,2,1,0') sh = 3; }
    const cnt = {}; rs.forEach(r => cnt[r] = (cnt[r] || 0) + 1);
    const groups = Object.entries(cnt).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const shape = groups.map(g => g[0]).join(''), ord = groups.map(g => g[1]);
    if (sh !== null && flush) return [8, sh];
    if (shape === '41') return [7, ...ord];
    if (shape === '32') return [6, ...ord];
    if (flush) return [5, ...rs];
    if (sh !== null) return [4, sh];
    if (shape === '311') return [3, ...ord];
    if (shape === '221') return [2, ...ord];
    if (shape === '2111') return [1, ...ord];
    return [0, ...rs];
  }
  function combos(arr, k) { const out = []; (function rec(s, cur) { if (cur.length === k) { out.push(cur.slice()); return; } for (let i = s; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); } })(0, []); return out; }
  function best(cards) { let b = null; for (const c of combos(cards, 5)) { const r = rank5(c); if (!b || cmp(r, b) > 0) b = r; } return b; }
  function handName(s) {
    if (s[0] === 8 && s[1] === 12) return 'Роял-флеш';
    if (s[0] === 1) return 'Пара ' + (RU[RANK_CH[s[1]]] || RANK_CH[s[1]]);
    return CAT[s[0]];
  }
  class Table {
    constructor(sb = 10, bb = 20, rnd = Math.random) { this.sb = sb; this.bb = bb; this.rnd = rnd; this.players = []; this.dealer = -1; this.community = []; this.deck = []; this.stage = 'wait'; this.toAct = -1; this.currentBet = 0; this.minRaise = bb; this.log = []; this.result = []; }
    seat(id, name, chips, extra) { const p = Object.assign({ id, name, chips, hole: [], bet: 0, total: 0, folded: false, allin: false, acted: false }, extra || {}); this.players.push(p); return p; }
    get(id) { return this.players.find(p => p.id === id); }
    live(p) { return p.hole.length > 0 && !p.folded; }
    canAct(p) { return this.live(p) && !p.allin; }
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
    nextIdx(i, pred) { const n = this.players.length; for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (pred(this.players[j])) return j; } return -1; }
    post(p, amt) { amt = Math.min(amt, p.chips); p.chips -= amt; p.bet += amt; p.total += amt; if (p.chips === 0) p.allin = true; }
    startHand() {
      this.players = this.players.filter(p => p.chips > 0);
      if (this.players.length < 2) { this.stage = 'wait'; return false; }
      this.log = []; this.result = []; this.community = [];
      this.players.forEach(p => { p.hole = []; p.bet = 0; p.total = 0; p.folded = p.allin = p.acted = false; });
      this.deck = Array.from({ length: 52 }, (_, i) => i); this.shuffle(this.deck);
      const n = this.players.length; this.dealer = (this.dealer + 1) % n;
      const hu = n === 2, sbI = hu ? this.dealer : (this.dealer + 1) % n, bbI = hu ? (this.dealer + 1) % n : (this.dealer + 2) % n;
      this.players.forEach(p => { p.hole = [this.deck.pop(), this.deck.pop()]; });
      this.post(this.players[sbI], this.sb); this.post(this.players[bbI], this.bb);
      this.currentBet = Math.max(this.bb, this.players[bbI].bet); this.minRaise = this.bb; this.stage = 'preflop';
      const first = hu ? sbI : (bbI + 1) % n;
      this.toAct = this.canAct(this.players[first]) ? first : this.nextIdx(first, p => this.canAct(p));
      if (this.toAct === -1 || this.roundDone()) this.advance();
      return true;
    }
    current() { return (this.toAct >= 0 && ['preflop', 'flop', 'turn', 'river'].includes(this.stage)) ? this.players[this.toAct] : null; }
    toCall(p) { return Math.max(0, Math.min(this.currentBet - p.bet, p.chips)); }
    minRaiseTo(p) { return Math.min(p.bet + p.chips, this.currentBet + this.minRaise); }
    legal(p) { if (this.current() !== p) return []; const a = ['fold', this.currentBet > p.bet ? 'call' : 'check']; if (p.chips > this.toCall(p)) a.push('raise', 'allin'); return a; }
    act(id, action, raiseTo) {
      const p = this.get(id);
      if (!p || this.current() !== p) return 'Сейчас не твой ход';
      if (!this.legal(p).includes(action)) return 'Так сейчас нельзя';
      if (action === 'fold') { p.folded = true; this.log.push([p.id, 'fold', 0]); }
      else if (action === 'check' || action === 'call') { const amt = this.toCall(p); this.post(p, amt); this.log.push([p.id, action, amt]); }
      else {
        let target = action === 'allin' ? p.bet + p.chips : Math.max(this.minRaiseTo(p), Math.min(raiseTo || 0, p.bet + p.chips));
        target = Math.min(target, p.bet + p.chips);
        const add = target - p.bet, by = target - this.currentBet;
        this.post(p, add);
        if (p.bet > this.currentBet) { if (by >= this.minRaise) this.minRaise = by; this.currentBet = p.bet; this.players.forEach(q => { if (q !== p && this.canAct(q)) q.acted = false; }); }
        this.log.push([p.id, p.allin ? 'allin' : 'raise', p.bet]);
      }
      p.acted = true; this.afterAction(); return null;
    }
    roundDone() { const live = this.players.filter(p => this.live(p)); if (live.length <= 1) return true; return live.every(p => (p.acted && p.bet === this.currentBet) || p.allin); }
    afterAction() { if (this.roundDone()) this.advance(); else this.toAct = this.nextIdx(this.toAct, p => this.canAct(p) && !(p.acted && p.bet === this.currentBet)); }
    advance() {
      const live = this.players.filter(p => this.live(p));
      if (live.length === 1) { this.showdown(); return; }
      for (;;) {
        if (this.stage === 'preflop') { this.stage = 'flop'; for (let i = 0; i < 3; i++) this.community.push(this.deck.pop()); }
        else if (this.stage === 'flop') { this.stage = 'turn'; this.community.push(this.deck.pop()); }
        else if (this.stage === 'turn') { this.stage = 'river'; this.community.push(this.deck.pop()); }
        else { this.showdown(); return; }
        this.players.forEach(p => { p.bet = 0; p.acted = false; }); this.currentBet = 0; this.minRaise = this.bb;
        if (this.players.filter(p => this.canAct(p)).length >= 2) { this.toAct = this.nextIdx(this.dealer, p => this.canAct(p)); return; }
      }
    }
    sidePots() {
      const levels = [...new Set(this.players.filter(p => p.total > 0).map(p => p.total))].sort((a, b) => a - b);
      const pots = []; let prev = 0;
      for (const lv of levels) {
        const contrib = this.players.reduce((s, p) => s + Math.min(p.total, lv) - Math.min(p.total, prev), 0);
        const elig = this.players.filter(p => this.live(p) && p.total >= lv);
        if (contrib && elig.length) pots.push([contrib, elig]); else if (contrib && pots.length) pots[pots.length - 1][0] += contrib;
        prev = lv;
      }
      return pots;
    }
    pot() { return this.players.reduce((s, p) => s + p.total, 0); }
    showdown() {
      const live = this.players.filter(p => this.live(p));
      const scores = new Map();
      if (live.length > 1 && this.community.length === 5) live.forEach(p => scores.set(p.id, best(p.hole.concat(this.community))));
      const won = new Map();
      for (const [amount, elig] of this.sidePots()) {
        let winners;
        if (elig.length === 1 || !scores.size) winners = elig.length === 1 ? [elig[0]] : elig;
        else { let top = null; elig.forEach(p => { const s = scores.get(p.id); if (!top || cmp(s, top) > 0) top = s; }); winners = elig.filter(p => cmp(scores.get(p.id), top) === 0); }
        const share = Math.floor(amount / winners.length); let rem = amount - share * winners.length;
        const n = this.players.length;
        const order = winners.slice().sort((a, b) => ((this.players.indexOf(a) - this.dealer - 1 + n) % n) - ((this.players.indexOf(b) - this.dealer - 1 + n) % n));
        order.forEach(w => { won.set(w.id, (won.get(w.id) || 0) + share + (rem-- > 0 ? 1 : 0)); });
      }
      this.players.forEach(p => { p.chips += won.get(p.id) || 0; });
      this.result = this.players.filter(p => won.get(p.id) || scores.has(p.id) || p.total).map(p => ({ id: p.id, name: p.name, won: won.get(p.id) || 0, net: (won.get(p.id) || 0) - p.total, hand: scores.has(p.id) ? handName(scores.get(p.id)) : '', shown: scores.has(p.id) }));
      this.stage = 'done'; this.toAct = -1;
    }
  }
  return { Table, best, cmp, rank5, handName, cardStr, rankOf, suitOf };
})();
// </engine>

// <ui>
(function () {
  'use strict';
  var KEY = 'kino_poker', root = null, G = null, timer = null;
  var ACT = {};
  var BOTS = [
    { id: 'b1', name: 'Капитан', emoji: '🧢', aggr: 0.5, tight: 0.5, bot: true },
    { id: 'b2', name: 'Режиссёр', emoji: '🎬', aggr: 0.8, tight: 0.2, bot: true },
    { id: 'b3', name: 'Критик', emoji: '🕶️', aggr: 0.3, tight: 0.8, bot: true }
  ];
  var POS = ['hd-s-left', 'hd-s-top', 'hd-s-right'];
  var THEMES = [
    { id: 'classic', n: 'Классика', e: '🟢', need: 0 }, { id: 'noir', n: 'Нуар', e: '🔵', need: 10 },
    { id: 'velvet', n: 'Бархат', e: '🔴', need: 30 }, { id: 'oscar', n: 'Оскар', e: '🟡', need: 60 }
  ];
  var ACH = [
    { id: 'win1', e: '🥇', n: 'Первая победа', d: 'Выиграй раздачу' },
    { id: 'hands10', e: '🎞', n: 'Завсегдатай', d: '10 раздач' },
    { id: 'hands50', e: '🎬', n: 'Режиссёр стола', d: '50 раздач' },
    { id: 'streak3', e: '🔥', n: 'Хет-трик', d: '3 победы подряд' },
    { id: 'allin', e: '💥', n: 'Ва-банк!', d: 'Выиграй, идя ва-банк' },
    { id: 'big', e: '💰', n: 'Крупный куш', d: 'Банк 500+ за раздачу' },
    { id: 'flush', e: '🌊', n: 'Сильная рука', d: 'Победа флешем или лучше' },
    { id: 'royal', e: '👑', n: 'Королевский выход', d: 'Победа каре или стрит-флешем' }
  ];
  // ---- задания дня ----
  var QPOOL = [
    { id: 'play5', t: 'Сыграй 5 раздач', n: 5, r: 60 }, { id: 'win3', t: 'Выиграй 3 раздачи', n: 3, r: 100 },
    { id: 'three', t: 'Выиграй рукой «тройка» и выше', n: 1, r: 120 }, { id: 'allin', t: 'Выиграй, идя ва-банк', n: 1, r: 150 },
    { id: 'pot300', t: 'Выиграй банк от 300', n: 1, r: 100 }, { id: 'tour', t: 'Сыграй турнир до конца', n: 1, r: 150 }
  ];
  function dayQuests(st) {
    var d = today(), q = st.q;
    if (!q || q.d !== d) {
      var seed = 0; for (var i = 0; i < d.length; i++) seed = (seed * 31 + d.charCodeAt(i)) % 9973;
      var pool = QPOOL.slice(), pick = [];
      for (var k = 0; k < 3; k++) { var j = (seed + k * 7) % pool.length; pick.push(pool.splice(j, 1)[0].id); }
      q = st.q = { d: d, ids: pick, p: {}, c: {} };
    }
    return q;
  }
  function qProgress(st, ev) {          // ev: {play, won, hand, allin, pot, tour}
    var q = dayQuests(st), add = function (id, n) { if (q.ids.indexOf(id) >= 0) q.p[id] = (q.p[id] || 0) + (n || 1); };
    if (ev.play) add('play5'); if (ev.won) { add('win3'); if (ev.allin) add('allin'); if (ev.pot >= 300) add('pot300'); if (/Тройка|Стрит|Флеш|Фулл|Каре/.test(ev.hand || '')) add('three'); }
    if (ev.tour) add('tour');
  }
  function questsHtml(st) {
    var q = dayQuests(st);
    return '<div class="hd-quests"><b>📅 Задания дня</b>' + q.ids.map(function (id) {
      var d = QPOOL.filter(function (x) { return x.id === id; })[0], p = Math.min(d.n, q.p[id] || 0), done = p >= d.n, got = q.c[id];
      return '<div class="hd-q' + (got ? ' got' : '') + '"><div class="hd-qt"><span>' + d.t + '</span><small>' + p + '/' + d.n + '</small></div><div class="hd-qb"><i style="width:' + Math.round(p / d.n * 100) + '%"></i></div>' +
        (got ? '<em>✅ +' + d.r + '</em>' : done ? '<button data-claim="' + id + '">Забрать +' + d.r + ' 🎞</button>' : '<em>🎞 ' + d.r + '</em>') + '</div>';
    }).join('') + '</div>';
  }
  function unlockAch(st, me, allin) {
    var got = [], A = st.ach = st.ach || {}, h = me && me.hand || '';
    function g(id, c) { if (c && !A[id]) { A[id] = 1; got.push(ACH.filter(function (x) { return x.id === id; })[0]); } }
    var won = me && me.won > 0;
    g('win1', won); g('hands10', st.hands >= 10); g('hands50', st.hands >= 50); g('streak3', st.streak >= 3);
    g('allin', won && allin); g('big', won && me.won >= 500);
    g('flush', won && /Флеш|Фулл|Каре|Стрит/.test(h)); g('royal', won && /Каре|Стрит-флеш|Роял/.test(h));
    return got;
  }
  function achToast(a) {
    var d = document.createElement('div'); d.className = 'hd-ach'; d.innerHTML = '<i>' + a.e + '</i><div><b>Достижение!</b><span>' + a.n + '</span></div>';
    root.appendChild(d); setTimeout(function () { d.classList.add('out'); setTimeout(function () { d.remove(); }, 400); }, 2600);
  }
  function themeId(st) { var t = THEMES.filter(function (x) { return x.id === st.theme && (st.hands || 0) >= x.need; })[0]; return t ? t.id : 'classic'; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function loadSt() {
    var st = null; try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!st || typeof st.chips !== 'number') st = { chips: 500, best: 0, hands: 0, bonus: '', refill: '' };
    if (typeof st.table !== 'number') st.table = 0;
    return st;
  }
  var cloudT = null, cloudPulled = false;
  function cloudOk() { try { return !!(tg && tg.CloudStorage && typeof tg.CloudStorage.setItem === 'function'); } catch (e) { return false; } }
  function cloudPack(st) {
    return JSON.stringify({ ts: st.ts || 0, c: (st.chips || 0) + (st.table || 0), b: st.best || 0, h: st.hands || 0, w: st.wins || 0, s: st.bestStreak || 0,
      th: st.theme || '', a: Object.keys(st.ach || {}).join(','), t: st.tours || 0, tw: st.tourWins || 0, d: st.diff === undefined ? 1 : st.diff, sn: st.snd === false ? 0 : 1, hn: st.hints === false ? 0 : 1, wh: st.wheel || '', ch: st.chal || '' });
  }
  function cloudPush(st) {
    if (!cloudOk()) return; clearTimeout(cloudT);
    cloudT = setTimeout(function () { try { tg.CloudStorage.setItem('kp1', cloudPack(st), function () {}); } catch (e) {} }, 1500);
  }
  function cloudPull(done) {
    if (cloudPulled || !cloudOk()) return; cloudPulled = true;
    try {
      tg.CloudStorage.getItem('kp1', function (err, val) {
        if (err || !val) return; var c; try { c = JSON.parse(val); } catch (e) { return; }
        var st0 = loadSt(), mergedD = false;
        if (c && c.wh && c.wh > (st0.wheel || '')) { st0.wheel = c.wh; mergedD = true; } if (c && c.ch && c.ch > (st0.chal || '')) { st0.chal = c.ch; mergedD = true; }
        if (mergedD) { try { localStorage.setItem(KEY, JSON.stringify(st0)); } catch (e) {} }
        var st = loadSt(); if (!c || !(c.h > (st.hands || 0) || (c.h === (st.hands || 0) && c.ts > (st.ts || 0)))) return;
        st.chips = c.c; st.table = 0; st.best = c.b; st.hands = c.h; st.wins = c.w; st.bestStreak = c.s; st.theme = c.th || st.theme; st.tours = c.t; st.tourWins = c.tw;
        st.diff = c.d; st.snd = !!c.sn ? undefined : false; st.hints = !!c.hn ? undefined : false; st.ach = {}; (c.a || '').split(',').forEach(function (x) { if (x) st.ach[x] = 1; });
        st.ts = c.ts; try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} if (done) done();
        return;
      });
    } catch (e) {}
  }
  function saveSt(st) { st.ts = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} cloudPush(st); }
  function msg(t) { try { if (typeof popMsg === 'function') popMsg(t); } catch (e) {} }
  function buzz(k) { try { if (typeof haptic === 'function') haptic(k, true); } catch (e) {} }
  // v202: звуки (синтез WebAudio, без файлов)
  var AC = null;
  function sndOn() { return loadSt().snd !== false; }
  function tone(f, d, type, vol, delay, slide) {
    try {
      if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return; AC = new C(); }
      if (AC.state === 'suspended') AC.resume();
      var t0 = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + d);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + d + 0.02);
    } catch (e) {}
  }
  function noise(d, vol, delay, hp) {
    try {
      if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return; AC = new C(); }
      var n = Math.floor(AC.sampleRate * d), buf = AC.createBuffer(1, n, AC.sampleRate), ch = buf.getChannelData(0);
      for (var i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 2500;
      g.gain.value = vol || 0.2; src.buffer = buf; src.connect(f); f.connect(g); g.connect(AC.destination); src.start(AC.currentTime + (delay || 0));
    } catch (e) {}
  }
  function sfx(k) {
    if (!sndOn()) return;
    if (k === 'deal') { noise(0.06, 0.25, 0, 3000); tone(300, 0.05, 'triangle', 0.05); }
    else if (k === 'chip') { tone(1800, 0.05, 'square', 0.05); tone(2400, 0.06, 'square', 0.04, 0.05); noise(0.03, 0.1, 0, 5000); }
    else if (k === 'check') { tone(160, 0.08, 'sine', 0.3, 0, 90); tone(160, 0.08, 'sine', 0.3, 0.12, 90); }
    else if (k === 'fold') { noise(0.18, 0.18, 0, 1200); }
    else if (k === 'allin') { for (var i = 0; i < 5; i++) { tone(1500 + i * 150, 0.05, 'square', 0.05, i * 0.05); } tone(220, 0.35, 'sawtooth', 0.08, 0.1, 110); }
    else if (k === 'turn') { tone(880, 0.12, 'sine', 0.12); tone(1320, 0.18, 'sine', 0.1, 0.1); }
    else if (k === 'win') { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.14, i * 0.1); }); }
    else if (k === 'lose') { tone(300, 0.3, 'sine', 0.12, 0, 150); }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mount() { if (root) root.remove(); root = document.createElement('div'); root.className = 'pk-overlay hd-overlay'; document.body.appendChild(root); return root; }
  function close() { clearTimeout(timer); if (G && G.hero) cashOut(); if (root) { root.remove(); root = null; } G = null; }

  // ---------- фишки: кошелёк <-> стол ----------
  function cashOut() {
    if (!G || G.cashed) return; G.cashed = true;
    var st = loadSt(); st.chips += Math.max(0, G.hero.chips); st.table = 0; saveSt(st);
  }
  function checkpoint() { if (G && G.tour) return; var st = loadSt(); st.table = Math.max(0, G.hero.chips); saveSt(st); }

  // ---------- меню режимов ----------
  function openMenu() {
    clearTimeout(timer); G = null;
    cloudPull(function () { if (root && !G) { openMenu(); try { if (typeof popMsg === 'function') popMsg('☁️ Прогресс покера восстановлен'); } catch (e) {} } });
    var st = loadSt(), note = '';
    if (st.table > 0) { st.chips += st.table; note = '🎞 Фишки со стола вернулись в кошелёк: +' + st.table; st.table = 0; }
    if (st.bonus !== today()) { st.bonus = today(); st.chips += 200; note = '🎁 Ежедневный бонус: +200 фишек'; }
    if (st.chips < 5 && st.refill !== today()) { st.refill = today(); st.chips = 100; note = '🎞 Капитан подкинул 100 фишек'; }
    saveSt(st);
    mount();
    root.innerHTML = '<div class="pk-top"><button class="pk-x" id="hd-x">✕</button><div class="pk-title">🃏 Кино-покер</div><div class="pk-chips">🎞 ' + st.chips + '</div></div>' +
      '<div class="hd-menu-hero"><div class="hd-logo">🎬</div><b>КАПИТАН КИНО</b><span>покерный клуб</span></div>' +
      '<button class="hd-mode" id="hd-m-table"><i>🎬</i><div><b>Стол Капитана</b><span>Холдем с командой: Капитан, Режиссёр и Критик</span></div></button>' +
      '<button class="hd-mode" id="hd-m-tour"><i>🏆</i><div><b>Турнир на вылет</b><span>Взнос ' + TOUR.entry + ' 🎞 · 1-е место ' + TOUR.prize[0] + ' · блайнды растут</span></div></button>' +
      '<button class="hd-mode" id="hd-m-short"><i>⚡</i><div><b>Шорт-стек</b><span>500 🎞 · блайнды 50/100 · быстрые решения</span></div></button>' +
      '<button class="hd-mode" id="hd-m-chal"><i>📆</i><div><b>Челлендж дня' + (st.chal === today() ? ' · пройден' : ' · +150 🎞') + '</b><span>одна раздача, у всех сегодня одни карты</span></div></button>' +
      '<button class="hd-mode" id="hd-m-video"><i>🎰</i><div><b>Видеопокер</b><span>быстрая игра против таблицы выплат</span></div></button>' +
      '<button class="hd-mode" id="hd-m-friends"><i>👥</i><div><b>С друзьями</b><span>живой стол в чате, ведёт бот</span></div></button>' +
      '<button class="hd-mode small" id="hd-m-wheel"><i>🎡</i><div><b>Колесо Капитана' + (st.wheel === today() ? '' : ' · подарок!') + '</b><span>одно вращение в день, до 500 🎞</span></div></button>' +
      '<button class="hd-mode small" id="hd-m-invite"><i>👥</i><div><b>Позвать друга играть</b><span>отправь ссылку на покер в мини-аппке</span></div></button>' +
      '<button class="hd-mode small" id="hd-m-rate"><i>📤</i><div><b>Отправить рейтинг боту</b><span>попасть в /pokertop в чате</span></div></button>' +
      '<button class="hd-mode small" id="hd-m-cheat"><i>📖</i><div><b>Шпаргалка комбинаций</b><span>что старше чего — с примерами</span></div></button>' +
      '<div class="hd-lvl"><b>🤖 Уровень ботов</b><div>' + [['Новичок', 0, '🟢'], ['Обычный', 1, '🟡'], ['Профи', 2, '🔴']].map(function (l) { return '<button class="hd-th' + ((st.diff === undefined ? 1 : st.diff) === l[1] ? ' on' : '') + '" data-df="' + l[1] + '"><i>' + l[2] + '</i>' + l[0] + '</button>'; }).join('') + '</div></div>' +
      '<button class="hd-mode small" id="hd-m-hints"><i>💡</i><div><b>Подсказки шансов: ' + (st.hints === false ? 'выкл' : 'вкл') + '</b><span>шанс выиграть и выгодность колла за столом</span></div></button>' +
      questsHtml(st) +
      '<div class="hd-achs"><b>🏅 Достижения ' + Object.keys(st.ach || {}).length + '/' + ACH.length + '</b>' + ACH.map(function (a) { var ok = st.ach && st.ach[a.id]; return '<div class="hd-a' + (ok ? ' ok' : '') + '" title="' + a.d + '"><i>' + (ok ? a.e : '🔒') + '</i><span>' + a.n + '</span><small>' + a.d + '</small></div>'; }).join('') + '</div>' +
      '<div class="hd-themes">' + THEMES.map(function (x) { var ok = (st.hands || 0) >= x.need; return '<button class="hd-th' + (themeId(st) === x.id ? ' on' : '') + (ok ? '' : ' lock') + '" data-th="' + x.id + '" data-need="' + x.need + '"><i>' + (ok ? x.e : '🔒') + '</i>' + x.n + (ok ? '' : '<small>' + x.need + ' раздач</small>') + '</button>'; }).join('') + '</div>' +
      (st.hands ? '<div class="hd-stats"><div><b>' + st.hands + '</b><span>раздач</span></div><div><b>' + Math.round((st.wins || 0) / st.hands * 100) + '%</b><span>побед</span></div><div><b>' + (st.best || 0) + '</b><span>макс. банк</span></div><div><b>' + (st.bestStreak || 0) + '</b><span>серия</span></div></div>' : '') +
      '<div class="pk-note">Виртуальные фишки для игры. Их нельзя купить или вывести, на ранг и очки они не влияют.' + (note ? '<br>' + note : '') + '</div>';
    root.querySelector('#hd-x').onclick = close;
    root.querySelector('#hd-m-table').onclick = openBuyIn;
    root.querySelector('#hd-m-short').onclick = function () { if (loadSt().chips < 500) { buzz('light'); return; } startGame(500, [50, 100]); };
    root.querySelector('#hd-m-chal').onclick = function () { if (loadSt().chal === today()) { buzz('light'); return; } startChallenge(); };
    root.querySelector('#hd-m-tour').onclick = function () { if (loadSt().chips < TOUR.entry) { buzz('light'); return; } startTour(); };
    root.querySelectorAll('[data-th]').forEach(function (b) { b.onclick = function () {
      var q = loadSt(); if ((q.hands || 0) < +b.getAttribute('data-need')) { buzz('light'); return; }
      q.theme = b.getAttribute('data-th'); saveSt(q); root.querySelectorAll('[data-th]').forEach(function (x) { x.classList.toggle('on', x === b); }); sfx('chip');
    }; });
    root.querySelector('#hd-m-video').onclick = function () { close(); if (window.openVideoPoker) window.openVideoPoker(); };
    root.querySelector('#hd-m-cheat').onclick = showCheat;
    root.querySelector('#hd-m-invite').onclick = function () {
      var u = 'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/kapitan_kino_bot') + '&text=' + encodeURIComponent('🃏 Заходи в покер Капитана Кино: Холдем против ботов, видеопокер, турниры и колесо удачи. Открой бота и нажми «Киноафиша» → Покер. Фишки бесплатные!');
      try { tg.openTelegramLink(u); } catch (e) { window.open(u, '_blank'); }
    };
    root.querySelector('#hd-m-rate').onclick = function () {
      var q = loadSt(), b = function (n) { return Math.max(0, Math.floor(n || 0)).toString(36); };
      var url = 'https://t.me/kapitan_kino_bot?start=pk_' + [b((q.chips || 0) + (q.table || 0)), b(q.hands), b(q.wins), b(q.best)].join('_');
      try { tg.openTelegramLink(url); } catch (e) { window.open(url, '_blank'); }
    };
    root.querySelector('#hd-m-wheel').onclick = showWheel;
    root.querySelectorAll('[data-df]').forEach(function (b) { b.onclick = function () { var q = loadSt(); q.diff = +b.getAttribute('data-df'); saveSt(q); root.querySelectorAll('[data-df]').forEach(function (x) { x.classList.toggle('on', x === b); }); sfx('chip'); }; });
    root.querySelector('#hd-m-hints').onclick = function () { var q = loadSt(); q.hints = q.hints === false; saveSt(q); openMenu(); };
    root.querySelectorAll('[data-claim]').forEach(function (b) { b.onclick = function () {
      var q2 = loadSt(), qq = dayQuests(q2), id = b.getAttribute('data-claim'), d = QPOOL.filter(function (x) { return x.id === id; })[0];
      if (!d || qq.c[id] || (qq.p[id] || 0) < d.n) return; qq.c[id] = 1; q2.chips += d.r; saveSt(q2); sfx('win'); buzz('ok'); openMenu();
    }; });
    root.querySelector('#hd-m-friends').onclick = function () { if (typeof openFriendsPoker === 'function') openFriendsPoker(); };
  }
  function openBuyIn() {
    var st = loadSt(); mount();
    var opts = [200, 500, 1000].filter(function (v) { return v <= st.chips; });
    if (st.chips >= 100 && opts.indexOf(st.chips) < 0 && st.chips < 1000) opts.push(st.chips);
    var btns = opts.length ? opts.map(function (v) { return '<button class="hd-buy" data-v="' + v + '">🎞 ' + v + '</button>'; }).join('') : '<p class="hd-empty">Мало фишек для стола (нужно от 100). Загляни завтра или сыграй в видеопокер.</p>';
    root.innerHTML = '<div class="pk-top"><button class="pk-x" id="hd-x">✕</button><div class="pk-title">🎬 Стол Капитана</div><div class="pk-chips">🎞 ' + st.chips + '</div></div>' +
      '<div class="hd-menu-hero"><span>Блайнды 10 / 20 · четверо за столом</span></div>' +
      '<div class="hd-seats-preview">' + BOTS.map(function (b) { return '<div><i>' + b.emoji + '</i><b>' + b.name + '</b></div>'; }).join('') + '</div>' +
      '<div class="hd-buyin-t">Сколько фишек берёшь за стол?</div><div class="hd-buys">' + btns + '</div>' +
      '<button class="hd-back" id="hd-back">◀️ Назад</button>';
    root.querySelector('#hd-x').onclick = close;
    root.querySelector('#hd-back').onclick = openMenu;
    root.querySelectorAll('.hd-buy').forEach(function (b) { b.onclick = function () { startGame(+b.dataset.v); }; });
  }

  // ---------- игра ----------
  var TOUR = { entry: 300, stack: 1000, every: 5, prize: [750, 300, 150, 0], lv: [[10, 20], [20, 40], [40, 80], [80, 160], [150, 300], [300, 600], [500, 1000]] };
  function startTour() {
    var st = loadSt(); if (st.chips < TOUR.entry) return;
    st.chips -= TOUR.entry; st.table = 0; saveSt(st);
    var t = new HE.Table(TOUR.lv[0][0], TOUR.lv[0][1]);
    var hero = t.seat('me', 'Ты', TOUR.stack, { emoji: '🙂' });
    BOTS.forEach(function (b) { t.seat(b.id, b.name, TOUR.stack, { emoji: b.emoji, bot: true, aggr: b.aggr, tight: b.tight }); });
    G = { t: t, hero: hero, buyin: TOUR.stack, notes: [], busy: false, cashed: true, shown: 0, lastMsg: 'Турнир начался!', acts: {}, street: 0, tour: { hands: 0, lvl: 0, outAt: {}, end: null } };
    nextHand();
  }
  function podium(heroPlace) {
    var T = G.tour, t = G.t, list = [{ e: '🙂', n: heroName(), alive: heroPlace === 1, chips: G.hero.chips, dead: heroPlace, me: 1 }];
    BOTS.forEach(function (b) { var pl = t.get(b.id), ch = pl ? pl.chips : 0; list.push({ e: b.emoji, n: b.name, alive: ch > 0, chips: ch, dead: T.outAt[b.id] || 9 }); });
    list.sort(function (a, b) { if (a.alive !== b.alive) return a.alive ? -1 : 1; return a.alive ? b.chips - a.chips : a.dead - b.dead; });
    list.forEach(function (x, i) { x.p = i + 1; });
    var top3 = [list[1], list[0], list[2]], hs = { 1: 74, 2: 54, 3: 40 };
    return '<div class="hd-podium">' + top3.map(function (x) { return x ? '<div class="pd p' + x.p + (x.me ? ' me' : '') + '"><i>' + (x.p === 1 ? '👑' : '') + '</i><div class="av">' + x.e + '</div><b>' + esc(x.n) + '</b><div class="st" style="height:' + hs[x.p] + 'px">' + x.p + '</div></div>' : ''; }).join('') + '</div>';
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var CHAL_PRIZE = 150;
  function startChallenge() {
    var st = loadSt(); if (st.chal === today()) return;
    st.chal = today(); st.table = 0; saveSt(st);
    var seed = 0, d = today(); for (var i = 0; i < d.length; i++) seed = (seed * 131 + d.charCodeAt(i)) % 1000003;
    var t = new HE.Table(10, 20, mulberry(seed + 7));
    var hero = t.seat('me', 'Ты', 1000, { emoji: '🙂' });
    BOTS.forEach(function (b) { t.seat(b.id, b.name, 1000, { emoji: b.emoji, bot: true, aggr: b.aggr, tight: b.tight }); });
    G = { t: t, hero: hero, buyin: 1000, notes: [], busy: false, cashed: true, shown: 0, lastMsg: 'Челлендж дня: у всех игроков сегодня те же карты', acts: {}, street: 0, chal: { paid: false } };
    nextHand();
  }
  function chalAfterHand() {
    if (!G || !G.chal || G.chal.paid) return; G.chal.paid = true;
    var won = G.t.result.some(function (r) { return r.id === 'me' && r.won > 0; });
    G.chal.won = won; if (won) { var st = loadSt(); st.chips += CHAL_PRIZE; saveSt(st); }
  }
  function tourAfterHand() {
    var T = G.tour, t = G.t; if (!T || T.end) return;
    var alive = t.players.filter(function (p) { return p.chips > 0; });
    t.players.forEach(function (p) { if (p.chips <= 0 && p.id !== 'me' && !T.outAt[p.id]) T.outAt[p.id] = alive.length + 1; });
    var heroIn = G.hero.chips > 0;
    if (!heroIn || alive.length === 1) {
      var place = heroIn ? 1 : alive.length + 1, prize = TOUR.prize[place - 1] || 0, st = loadSt();
      st.chips += prize; st.tours = (st.tours || 0) + 1; qProgress(st, { tour: 1 }); if (place === 1) { st.tourWins = (st.tourWins || 0) + 1; }
      var A = st.ach = st.ach || {}; var fresh = null; if (place === 1 && !A.champ) { A.champ = 1; fresh = { e: '🏆', n: 'Чемпион турнира' }; }
      saveSt(st); T.end = { place: place, prize: prize };
      if (fresh) setTimeout(function () { achToast(fresh); sfx('win'); }, 1200);
    }
  }
  function startGame(buyin, bl) {
    var st = loadSt(); if (buyin > st.chips) return;
    track('poker_start', buyin);
    st.chips -= buyin; st.table = buyin; saveSt(st);
    var t = new HE.Table(bl ? bl[0] : 10, bl ? bl[1] : 20);
    var hero = t.seat('me', 'Ты', buyin, { emoji: '🙂' });
    BOTS.forEach(function (b) { t.seat(b.id, b.name, buyin, { emoji: b.emoji, bot: true, aggr: b.aggr, tight: b.tight }); });
    G = { t: t, hero: hero, buyin: buyin, notes: [], busy: false, cashed: false, shown: 0, lastMsg: 'Карты розданы', acts: {}, street: 0 };
    nextHand();
  }
  function nextHand() {
    track('poker_hand', G.tour ? 'tour' : 'cash');
    var t = G.t; G.shareTxt = null; G.notes = []; G.shoves = (G.shoves || 0) * 0.8; G.hl = null; G.dec = []; G.talk = {};
    if (G.tour) {
      var T = G.tour; if (T.hands > 0 && T.hands % TOUR.every === 0 && T.lvl < TOUR.lv.length - 1 && !T.bumped) { T.lvl++; t.sb = TOUR.lv[T.lvl][0]; t.bb = TOUR.lv[T.lvl][1]; G.notes.push('⬆️ Блайнды ' + t.sb + '/' + t.bb); T.bumped = true; } else if (T.hands % TOUR.every !== 0) T.bumped = false;
      T.hands++;
    } else t.players.forEach(function (p) { if (p.bot && p.chips < t.bb * 2) { p.chips = G.buyin; G.notes.push(p.name + ' докупил фишки'); } });
    if (G.hero.chips <= 0) { render(); return; }
    t.startHand(); sfx('deal'); G.shown = 0; G.acts = {}; G.street = 0; G.lastMsg = G.notes.join(' · ') || 'Новая раздача'; buzz('light');
    render(); step();
  }
  function logText(e) {
    var p = G.t.get(e[0]), n = p ? p.name : '?', a = e[1];
    return n + ': ' + (a === 'fold' ? 'фолд' : a === 'check' ? 'чек' : a === 'call' ? 'колл ' + e[2] : a === 'raise' ? 'рейз до ' + e[2] : 'ва-банк ' + e[2]);
  }
  var SAY = {
    b1: { raise: ['Поднимаю!', 'Капитан на мостике 🧢', 'Держим курс'], allin: ['Всё на кон!', 'Идём ва-банк!'], fold: ['Пас, коллеги', 'Не мой кадр'], win: ['Отличный дубль!', 'Капитан знает толк'], call: ['Уравниваю', 'Посмотрим'] },
    b2: { raise: ['Мотор! 🎬', 'Сцена накаляется', 'Ставка на крупный план'], allin: ['Финальная сцена!', 'Снимаем без дублей!'], fold: ['Стоп, снято', 'Режу эту сцену'], win: ['Это шедевр!', 'Оскар мой 🏆'], call: ['Принято', 'Продолжаем съёмку'] },
    b3: { raise: ['Хм, дерзко…', 'Критика с ставкой'], allin: ['Рискну репутацией', 'Ва-банк. Удивите меня'], fold: ['Слабый сюжет', 'Не впечатлило'], win: ['Оценка: 10/10', 'Как и предсказывал'], call: ['Допустим', 'Проверим вас'] }
  };
  function say(id, k, force) {
    var b = SAY[id]; if (!b || !b[k] || (!force && Math.random() > (k === 'call' ? 0.18 : 0.5))) return;
    G.talk = {}; G.talk[id] = b[k][Math.floor(Math.random() * b[k].length)];
  }
  var EMO = [['🎬', 'Снято!'], ['👏', 'Браво'], ['😈', 'Ну-ну…'], ['🤔', 'Думаю'], ['😎', 'Легко'], ['💥', 'Держитесь!']];
  var REACT = { b1: ['Принято, капитан', 'Хм, смело'], b2: ['Мотор! 🎬', 'Эффектно'], b3: ['Оценим…', 'Критика не боится'] };
  function openEmoPop() {
    if (root.querySelector('.hd-emopop')) return;
    var pop = document.createElement('div'); pop.className = 'hd-emopop';
    pop.innerHTML = EMO.map(function (e, i) { return '<button data-e="' + i + '"><i>' + e[0] + '</i><span>' + e[1] + '</span></button>'; }).join('');
    root.appendChild(pop); pop.onclick = function (ev) { var b = ev.target.closest('[data-e]'); G.emoOpen = false; pop.remove(); if (b) emote(+b.getAttribute('data-e')); };
  }
  function emote(i) {
    if (!G) return; G.emoMe = EMO[i][0] + ' ' + EMO[i][1]; sfx('chip'); G.talk = {};
    var bs = BOTS.filter(function (b) { return G.t.get(b.id) && G.t.players.indexOf(G.t.get(b.id)) >= 0; });
    if (bs.length && Math.random() < 0.7) { var b = bs[Math.floor(Math.random() * bs.length)]; G.talk[b.id] = REACT[b.id] ? REACT[b.id][Math.floor(Math.random() * REACT[b.id].length)] : EMO[i][0]; }
    render(); clearTimeout(G.emoT); G.emoT = setTimeout(function () { if (G) { G.emoMe = ''; G.talk = {}; render(); } }, 2800);
  }
  function noteActs(before) {
    G.talk = {};
    G.t.log.slice(before).forEach(function (e) {
      var a = e[1]; say(e[0], a === 'raise' ? 'raise' : a === 'allin' ? 'allin' : a === 'fold' ? 'fold' : a === 'call' ? 'call' : '_');
      if (e[0] === 'me' && a === 'allin') G.shoves = (G.shoves || 0) + 1;
      sfx(a === 'fold' ? 'fold' : a === 'check' ? 'check' : a === 'allin' ? 'allin' : 'chip');
      G.acts[e[0]] = a === 'fold' ? 'Фолд' : a === 'check' ? 'Чек' : a === 'call' ? 'Колл ' + e[2] : a === 'raise' ? 'Рейз ' + e[2] : 'Ва-банк';
    });
  }
  function step() {
    var t = G.t;
    if (t.stage === 'done') { onDone(); return; }
    var cur = t.current();
    if (!cur) return;
    if (!cur.bot) sfx('turn');
    render();
    if (cur.bot) {
      G.busy = true;
      timer = setTimeout(function () {
        if (!G) return;
        var d = aiDecide(t, cur), before = t.log.length;
        t.act(cur.id, d.a, d.to);
        t.log.slice(before).forEach(function (e) { G.lastMsg = logText(e); }); noteActs(before);
        G.busy = false; step();
      }, loadSt().fast ? 220 + Math.random() * 220 : 800 + Math.random() * 700);
    }
  }
  function onDone() {
    var t = G.t, win = t.result.filter(function (r) { return r.won > 0; }).sort(function (a, b) { return b.won - a.won; });
    var top = win[0], line = '';
    if (top) line = '🏆 ' + (top.id === 'me' ? 'Ты' : top.name) + (top.hand ? ' — ' + top.hand : ' — все сфолдили') + ', +' + top.won;
    G.lastMsg = line; G.win = win.map(function (r) { return r.id; });
    var me = t.result.filter(function (r) { return r.id === 'me'; })[0];
    G.hl = null; if (top && top.hand && t.community.length === 5) { var wp = t.get(top.id); if (wp) { G.hl = {}; best5(wp.hole.concat(t.community)).forEach(function (c) { G.hl[c] = 1; }); } }
    G.talk = {}; (function () { var w = top && top.id !== 'me' ? top.id : null; if (w) say(w, 'win', true); })();
    if (me && me.won > 0) { buzz('ok'); confetti(); sfx('win'); } else { buzz('light'); sfx(me && me.net < 0 ? 'lose' : 'deal'); }
    var st = loadSt(); st.hands = (st.hands || 0) + 1; if (me && me.won > 0) st.wins = (st.wins || 0) + 1; if (me && me.won > (st.best || 0)) { st.best = me.won; st.bestHand = me.hand || st.bestHand || ''; }
    var netMe = me ? me.net : 0; st.streak = netMe > 0 ? (st.streak || 0) + 1 : 0; if (st.streak > (st.bestStreak || 0)) st.bestStreak = st.streak;
    st.hist = (st.hist || []); st.hist.unshift({ w: top ? (top.id === 'me' ? 'Ты' : top.name) : '', h: top ? (top.hand || 'все сфолдили') : '', p: top ? top.won : 0, n: netMe }); st.hist = st.hist.slice(0, 10);
    var allin = G.t.log.some(function (e) { return e[0] === 'me' && e[1] === 'allin'; });
    qProgress(st, { play: 1, won: me && me.won > 0, hand: me && me.hand, allin: allin, pot: me ? me.won : 0 });
    var gotA = unlockAch(st, me, allin); gotA.forEach(function (a, i) { setTimeout(function () { achToast(a); sfx('win'); }, 900 + i * 2800); });
    G.streak = st.streak; saveSt(st);
    checkpoint(); tourAfterHand(); chalAfterHand(); render(); if (top) flyChips(top.id);
  }
  function confetti() {
    if (!root) return; var box = document.createElement('div'), cols = ['#f5b942', '#3ddc84', '#ff5d73', '#7aa8ff', '#fff']; box.className = 'hd-conf';
    for (var i = 0; i < 34; i++) { var s = document.createElement('i'); s.style.left = Math.random() * 100 + '%'; s.style.background = cols[i % 5]; s.style.animationDelay = (Math.random() * 0.5) + 's'; s.style.animationDuration = (1.6 + Math.random() * 1.2) + 's'; box.appendChild(s); }
    root.appendChild(box); setTimeout(function () { if (box.parentNode) box.remove(); }, 3200);
  }
  // v200: шансы выиграть (Монте-Карло против живых соперников)
  function equity(t, me, sims) {
    var known = me.hole.concat(t.community), used = {}; known.forEach(function (c) { used[c] = 1; });
    var rest = []; for (var c = 0; c < 52; c++) if (!used[c]) rest.push(c);
    var opp = t.players.filter(function (p) { return p !== me && t.live(p); }).length; if (!opp) return 1;
    var need = 5 - t.community.length, win = 0;
    for (var k = 0; k < sims; k++) {
      for (var i = 0; i < 2 * opp + need; i++) { var j = i + Math.floor(Math.random() * (rest.length - i)); var x = rest[i]; rest[i] = rest[j]; rest[j] = x; }
      var comm = t.community.concat(rest.slice(2 * opp, 2 * opp + need)), mine = HE.best(me.hole.concat(comm)), res = 1;
      for (var o = 0; o < opp; o++) { var cm = HE.cmp(HE.best(rest.slice(2 * o, 2 * o + 2).concat(comm)), mine); if (cm > 0) { res = 0; break; } if (cm === 0) res = Math.min(res, 0.5); }
      win += res;
    }
    return win / sims;
  }
  function hintHtml(t, me) {
    if (loadSt().hints === false) return '';
    var key = me.hole.join() + '|' + t.community.join();
    if (!G.eq || G.eq.key !== key) G.eq = { key: key, v: equity(t, me, 220) };
    var e = Math.round(G.eq.v * 100), call = t.toCall(me), pot = t.pot(), need = call ? Math.round(call / (pot + call) * 100) : 0;
    var tip = !call ? (e >= 60 ? 'Рука сильная — можно ставить' : e >= 35 ? 'Можно проверить' : 'Слабовато — лучше чек')
      : (e >= need + 8 ? 'Колл выгоден' : e >= need - 3 ? 'На грани' : 'Колл невыгоден');
    return '<div class="hd-hint"><div class="hd-eq"><i style="width:' + e + '%"></i></div><span>Шанс выиграть ~' + e + '%' + (call ? ' · для колла нужно ' + need + '%' : '') + ' · ' + tip + '</span></div>';
  }
  function hero(action, to) {
    if (!G || G.busy) return; var t = G.t;
    if (t.current() !== G.hero) return;
    try {
      var cl = t.toCall(G.hero), pt = t.pot(), key = G.hero.hole.join() + '|' + t.community.join();
      if (cl > 0) { G.hr = G.hr || { f: 0, n: 0 }; G.hr.n++; if (action === 'fold') G.hr.f++; }   // v233: боты запоминают, как часто игрок сбрасывает
      var eqv = G.eq && G.eq.key === key ? G.eq.v : equity(t, G.hero, 150);
      (G.dec = G.dec || []).push({ s: ['Префлоп', '', '', 'Флоп', 'Тёрн', 'Ривер'][t.community.length] || 'Префлоп', a: action, to: to, call: cl, pot: pt, eq: eqv, need: cl ? cl / (pt + cl) : 0 });
    } catch (e) {}
    var before = t.log.length; var err = t.act('me', action, to);
    if (err) { msg(err); return; }
    buzz('light'); t.log.slice(before).forEach(function (e) { G.lastMsg = logText(e); }); noteActs(before);
    step();
  }

  // ---------- ИИ ----------
  function strength(t, p) {
    var hole = p.hole, comm = t.community, rk = HE.rankOf, su = HE.suitOf;
    if (!comm.length) {
      var r = hole.map(rk).sort(function (a, b) { return b - a; }), suited = su(hole[0]) === su(hole[1]), s;
      if (r[0] === r[1]) s = 0.5 + r[0] / 12 * 0.45;
      else { s = (r[0] + r[1]) / 24 * 0.55; if (suited) s += 0.06; if (r[0] - r[1] <= 2) s += 0.05; if (r[0] >= 10) s += 0.06; }
      return Math.min(s, 1);
    }
    var sc = HE.best(hole.concat(comm)), cat = sc[0], v;
    if (cat >= 6) v = 0.97; else if (cat === 5) v = 0.92; else if (cat === 4) v = 0.88; else if (cat === 3) v = 0.82; else if (cat === 2) v = 0.72;
    else if (cat === 1) v = hole.some(function (c) { return rk(c) === sc[1]; }) ? 0.45 + sc[1] / 12 * 0.2 : 0.3;
    else v = 0.12 + sc[1] / 12 * 0.1;
    if (comm.length < 5 && cat < 5) { var cnt = [0, 0, 0, 0]; hole.concat(comm).forEach(function (c) { cnt[su(c)]++; }); if (Math.max.apply(null, cnt) === 4) v += 0.18; }
    return Math.min(v, 1);
  }
  function aiDecide(t, p) {
    // v233: ИИ второго поколения — открывающие рейзы, ставки по equity, учёт рейза соперника и привычек игрока
    var s = strength(t, p), call = t.toCall(p), pot = t.pot(), lg = t.legal(p), canR = lg.indexOf('raise') >= 0;
    var r = Math.random(), odds = call / ((pot + call) || 1), pre = t.community.length === 0;
    var df = loadSt().diff, DF = df === 0 ? { m: -0.10, up: 0.86, sims: 70, bl: 0, op: 0.50 } : df === 2 ? { m: 0.03, up: 0.66, sims: 220, bl: 0.03, op: 0.40 } : { m: 0, up: 0.74, sims: 120, bl: 0, op: 0.45 };
    var hr = G.hr || { f: 0, n: 0 }, fr = hr.n >= 6 ? hr.f / hr.n : 0.4;               // как часто игрок сбрасывает на рейз
    var bm = Math.max(0.5, Math.min(1.7, 1 + (fr - 0.4) * 1.6)) * (df === 0 ? 0.6 : 1);   // много фолдит -> больше блефов
    var live = t.players.filter(function (q) { return q !== p && t.live(q); }).length;
    function raiseTo(frac) {
      var to = t.currentBet + Math.max(t.minRaise, Math.round(pot * frac / 10) * 10);
      return to >= p.bet + p.chips ? { a: 'allin' } : { a: 'raise', to: to };
    }
    function pass() { return call ? { a: 'call' } : { a: 'check' }; }
    function fold() { return call ? { a: 'fold' } : { a: 'check' }; }
    var unopened = pre && t.currentBet <= t.bb;                            // никто ещё не поднимал
    if (unopened && canR && call <= t.bb) {                                  // открывающий рейз
      var e0 = equity(t, p, Math.max(50, DF.sims * 0.6));
      var thr = DF.op + 0.05 * p.tight - 0.04 * p.aggr;
      if (e0 > thr + 0.17 || (e0 > thr && r < 0.55 + 0.35 * p.aggr)) {
        var to = t.currentBet + Math.round(t.bb * (1.6 + Math.random() * 1.2) / 10) * 10 + t.bb * Math.max(0, t.players.filter(function (q) { return q.bet === t.bb && q !== p; }).length - 1);
        to = Math.max(to, t.currentBet + t.minRaise);
        return to >= p.bet + p.chips ? { a: 'allin' } : { a: 'raise', to: to };
      }
    }
    if (call > 0) {
      var eq = equity(t, p, DF.sims);
      var need = DF.m + odds + 0.05 + 0.08 * p.tight - 0.05 * p.aggr + (call >= p.chips ? 0.05 : 0) - Math.min(0.22, 0.07 * (G.shoves || 0) * (call > 0.4 * p.chips ? 1 : 0));
      if (pre && call > t.bb * 1.5) need += 0.05;                              // рейз: у соперника рука сильнее случайной
      if (!pre) need += 0.06 * Math.min(1, call / (pot - call || 1));          // ставка на столе говорит о силе
      if (eq > DF.up && canR && r < 0.55) return raiseTo(0.6 + Math.random() * 0.5);
      if (eq > need) {
        var draw = !pre && t.community.length < 5 && s < 0.6;                  // полублеф с рисованием
        if (draw && canR && eq > need + 0.1 && r < 0.12 * p.aggr * bm && call <= 0.2 * p.chips) return raiseTo(0.7);
        return { a: 'call' };
      }
      if (canR && r < (0.03 + DF.bl + 0.04 * p.aggr) * bm && call <= 0.15 * p.chips && live <= 2) return raiseTo(0.6);   // редкий блеф
      return fold();
    }
    if (!pre && live >= 1) {                                                 // ставка по equity, когда до нас чек
      var e = equity(t, p, Math.max(50, DF.sims * 0.6));
      if (e >= 0.78) return (canR && r < 0.8) ? raiseTo(0.65 + Math.random() * 0.3) : { a: 'check' };   // иногда прячем силу
      if (e >= 0.58) return (canR && r < 0.5 + 0.3 * p.aggr) ? raiseTo(0.4 + Math.random() * 0.2) : { a: 'check' };
      if (e >= 0.4) return (canR && r < 0.1 * p.aggr * bm) ? raiseTo(0.4) : { a: 'check' };
      return (canR && live <= 2 && r < (0.05 + 0.1 * p.aggr) * bm) ? raiseTo(0.55) : { a: 'check' };
    }
    if (s >= 0.85) return (canR && r < 0.75) ? raiseTo(0.6 + Math.random() * 0.5) : pass();
    return { a: 'check' };
  }

  // ---------- отрисовка ----------
  var RANKS_DEMO = [
    ['Роял-флеш', 'Т-К-Д-В-10 одной масти', [8, 9, 10, 11, 12]], ['Стрит-флеш', 'Пять подряд одной масти', [5, 6, 7, 8, 9]],
    ['Каре', 'Четыре одинаковые', [12, 25, 38, 51, 0]], ['Фулл-хаус', 'Тройка + пара', [11, 24, 37, 7, 20]],
    ['Флеш', 'Пять одной масти', [14, 17, 19, 22, 24]], ['Стрит', 'Пять подряд', [4, 18, 32, 46, 8]],
    ['Тройка', 'Три одинаковые', [9, 22, 35, 41, 5]], ['Две пары', 'Две пары карт', [10, 23, 5, 18, 12]],
    ['Пара', 'Две одинаковые', [8, 21, 0, 16, 29]], ['Старшая карта', 'Ничего из перечисленного', [12, 37, 20, 6, 3]]
  ];
  // ---- колесо Капитана (раз в день) ----
  var WHEEL = [50, 100, 75, 150, 50, 300, 100, 500], WCOL = ['#5b8cff', '#3ddc84', '#ff5d73', '#f5b942', '#5b8cff', '#a66bff', '#3ddc84', '#ffd24a'];
  function wheelPick() {
    var w = [22, 20, 16, 10, 22, 4, 20, 1.5], sum = w.reduce(function (a, b) { return a + b; }, 0), r = Math.random() * sum, i = 0;
    for (; i < w.length; i++) { r -= w[i]; if (r <= 0) break; } return Math.min(i, w.length - 1);
  }
  function showWheel() {
    var st = loadSt(), used = st.wheel === today(), seg = 360 / WHEEL.length;
    var grad = WHEEL.map(function (v, i) { return WCOL[i] + ' ' + i * seg + 'deg ' + (i + 1) * seg + 'deg'; }).join(',');
    var labels = WHEEL.map(function (v, i) { return '<b style="transform:rotate(' + (i * seg + seg / 2) + 'deg) translateY(-92px)">' + v + '</b>'; }).join('');
    var box = document.createElement('div'); box.className = 'hd-histbox';
    box.innerHTML = '<div class="hd-histcard hd-wheelcard"><b>🎡 Колесо Капитана</b><p>' + (used ? 'Сегодня вы уже крутили. Возвращайтесь завтра!' : 'Одно вращение в день — фишки в подарок') + '</p>' +
      '<div class="hd-wheelwrap"><i class="hd-ptr">▼</i><div class="hd-wheel" id="hd-wheel" style="background:conic-gradient(' + grad + ')">' + labels + '<span>🎬</span></div></div>' +
      '<div class="hd-wres" id="hd-wres"></div><button class="hd-btn go" id="hd-wspin"' + (used ? ' disabled' : '') + '>' + (used ? 'Уже крутили' : '🎡 Крутить') + '</button><button class="hd-btn" id="hd-hclose">Закрыть</button></div>';
    root.appendChild(box);
    box.onclick = function (e) { if (e.target === box || e.target.id === 'hd-hclose') { box.remove(); openMenu(); } };
    var spin = box.querySelector('#hd-wspin');
    spin.onclick = function () {
      var q = loadSt(); if (q.wheel === today()) return; q.wheel = today();
      var idx = wheelPick(), prize = WHEEL[idx], target = 360 * 5 + (360 - (idx * seg + seg / 2));
      q.chips += prize; saveSt(q); spin.disabled = true; spin.textContent = 'Крутится…';
      var wl = box.querySelector('#hd-wheel'); wl.style.transition = 'transform 4s cubic-bezier(.12,.7,.15,1)'; wl.style.transform = 'rotate(' + target + 'deg)';
      var tick = setInterval(function () { sfx('chip'); }, 260); setTimeout(function () { clearInterval(tick); }, 3600);
      setTimeout(function () { box.querySelector('#hd-wres').innerHTML = '🎉 +' + prize + ' 🎞'; spin.textContent = 'Готово'; sfx('win'); buzz('ok'); if (prize >= 300) confetti(); }, 4100);
    };
  }
  function verdict(d) {
    var e = d.eq, pc = Math.round(e * 100), nd = Math.round(d.need * 100);
    if (d.a === 'fold') return d.call && e > d.need + 0.12 ? ['bad', 'Фолд был лишним: шанс ~' + pc + '% при нужных ' + nd + '%'] : d.call ? ['ok', 'Верный фолд: шанс ~' + pc + '% ниже нужных ' + nd + '%'] : ['mid', 'Фолд без ставки: можно было проверить бесплатно'];
    if (d.a === 'call') return e < d.need - 0.08 ? ['bad', 'Колл невыгоден: шанс ~' + pc + '% при нужных ' + nd + '%'] : ['ok', 'Колл по шансам: ~' + pc + '% (нужно ' + nd + '%)'];
    if (d.a === 'check') return e > 0.65 ? ['mid', 'Рука сильная (~' + pc + '%), можно было ставить'] : ['ok', 'Чек: рука ~' + pc + '%'];
    return e < 0.33 ? ['mid', 'Блеф: шанс всего ~' + pc + '%. Работает, если соперники пасуют'] : e > 0.6 ? ['ok', 'Ставка за ценность: ~' + pc + '%'] : ['ok', 'Агрессия при шансе ~' + pc + '%'];
  }
  function showReview() {
    var dec = (G && G.dec) || [], t = G.t, me = G.hero;
    var AN = { fold: 'Фолд', call: 'Колл', check: 'Чек', raise: 'Рейз', allin: 'Ва-банк' };
    var box = document.createElement('div'); box.className = 'hd-histbox';
    var cards = '<div class="hd-rvc">' + me.hole.map(function (c) { return cardHtml(c, 'mini'); }).join('') + '<span>·</span>' + t.community.map(function (c) { return cardHtml(c, 'mini'); }).join('') + '</div>';
    box.innerHTML = '<div class="hd-histcard"><b>🔍 Разбор раздачи</b>' + cards + (dec.length ? dec.map(function (d) {
      var v = verdict(d); return '<div class="hd-rv ' + v[0] + '"><div><b>' + d.s + ' · ' + AN[d.a] + (d.a === 'raise' && d.to ? ' до ' + d.to : '') + '</b><span>' + v[1] + '</span></div><i>' + (v[0] === 'ok' ? '✅' : v[0] === 'bad' ? '❌' : '⚠️') + '</i></div>';
    }).join('') : '<p>В этой раздаче ты не принимал решений.</p>') + '<button class="hd-btn go" id="hd-hclose">Закрыть</button></div>';
    root.appendChild(box); box.onclick = function (e) { if (e.target === box || e.target.id === 'hd-hclose') box.remove(); };
  }
  function showCheat() {
    var box = document.createElement('div'); box.className = 'hd-histbox';
    box.innerHTML = '<div class="hd-histcard"><b>📖 Комбинации от старшей к младшей</b>' + RANKS_DEMO.map(function (r, i) {
      return '<div class="hd-chrow"><div class="hd-chn"><i>' + (i + 1) + '</i><div><b>' + r[0] + '</b><span>' + r[1] + '</span></div></div><div class="hd-chc">' + r[2].map(function (c) { return cardHtml(c, 'mini'); }).join('') + '</div></div>';
    }).join('') + '<button class="hd-btn go" id="hd-hclose">Понятно</button></div>';
    root.appendChild(box); box.onclick = function (e) { if (e.target === box || e.target.id === 'hd-hclose') box.remove(); };
  }
  function tgUser() { try { return (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user) || null; } catch (e) { return null; } }
  function heroName() { var u = tgUser(); return u && u.first_name ? String(u.first_name).slice(0, 12) : 'Ты'; }
  function heroAv() { var u = tgUser(); return u && u.photo_url ? '<img class="hd-photo" src="' + esc(u.photo_url) + '" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode(\'🙂\'))">' : '🙂'; }
  function msgFast(on) { try { if (typeof popMsg === 'function') popMsg(on ? '⚡ Быстрая игра: боты ходят шустрее' : 'Обычный темп'); } catch (e) {} }
  function frameCls(st) { var n = Object.keys(st.ach || {}).length; return n >= 8 ? 'fr4' : n >= 6 ? 'fr3' : n >= 4 ? 'fr2' : n >= 2 ? 'fr1' : ''; }
  function labCls(l) {
    if (!l) return ''; if (/Роял|Стрит-флеш|Каре/.test(l)) return 'l5'; if (/Фулл|Флеш|Стрит/.test(l)) return 'l4';
    if (/Тройка/.test(l)) return 'l3'; if (/Две пары/.test(l)) return 'l2'; if (/Пара/.test(l)) return 'l1'; return 'l0';
  }
  function flyChips(pid) {
    try {
      var from = root.querySelector('.hd-pot'), to = pid === 'me' ? root.querySelector('.hd-me .hd-av') : root.querySelector('[data-pid="' + pid + '"] .hd-av');
      if (!from || !to || !from.animate) return;
      var a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), n = 9;
      for (var i = 0; i < n; i++) {
        (function (i) {
          var c = document.createElement('div'); c.className = 'hd-fly'; c.style.left = (a.left + a.width / 2 - 8) + 'px'; c.style.top = (a.top + 4) + 'px'; document.body.appendChild(c);
          var dx = b.left + b.width / 2 - a.left - a.width / 2, dy = b.top + b.height / 2 - a.top - 4, sx = (Math.random() - .5) * 40;
          var an = c.animate([{ transform: 'translate(' + sx + 'px,0) scale(.8)', opacity: 1 }, { transform: 'translate(' + (dx * .5 + sx) + 'px,' + (dy * .5 - 40) + 'px) scale(1.1)', opacity: 1, offset: .5 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.6)', opacity: .2 }], { duration: 750 + i * 40, delay: 500 + i * 70, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
          an.onfinish = function () { c.remove(); if (i === n - 1) sfx('chip'); };
        })(i);
      }
    } catch (e) {}
  }
  function potChips(pot) {
    if (pot <= 0) return '';
    var den = [[200, 'c500'], [50, 'c100'], [20, 'c25'], [5, 'c5']], out = '', left = pot, cnt = 0;
    den.forEach(function (d) { var n = Math.min(6, Math.floor(left / d[0])); if (n > 0) { left -= n * d[0]; cnt += n; out += '<div class="hd-stk ' + d[1] + '">' + new Array(n + 1).join('<i></i>') + '</div>'; } });
    if (!out) out = '<div class="hd-stk c5"><i></i></div>';
    return '<div class="hd-pile">' + out + '</div>';
  }
  function best5(cards) {
    var bestS = null, bestC = null, n = cards.length;
    for (var a = 0; a < n - 4; a++) for (var b = a + 1; b < n - 3; b++) for (var c = b + 1; c < n - 2; c++) for (var d = c + 1; d < n - 1; d++) for (var e = d + 1; e < n; e++) {
      var sub = [cards[a], cards[b], cards[c], cards[d], cards[e]], sc = HE.best(sub);
      if (!bestS || HE.cmp(sc, bestS) > 0) { bestS = sc; bestC = sub; }
    }
    return bestC || [];
  }
  function cardHtml(c, cls) {
    if (G && G.hl && G.t.stage === 'done') cls = (cls || '') + (G.hl[c] ? ' hl' : ' dim');
    var red = HE.suitOf(c) === 1 || HE.suitOf(c) === 2, s = HE.cardStr(c), r = s.slice(0, s.length - 1), su = s.slice(-1);
    return '<div class="hd-c' + (red ? ' red' : '') + (cls ? ' ' + cls : '') + '"><b>' + r + '</b><span>' + su + '</span></div>';
  }
  function backHtml() { return '<div class="hd-c back mini"></div>'; }
  function statePill(p, done) {
    if (p.folded) return '<em class="fold">фолд</em>';
    if (p.allin) return '<em class="allin">ва-банк</em>';
    var a = !done && G.acts[p.id], b = p.bet ? '<em class="bet"><s></s>' + p.bet + '</em>' : '';
    return (a ? '<em class="act">' + esc(a) + '</em>' : '') + b;
  }
  function seatHtml(p, i) {
    var t = G.t, done = t.stage === 'done', cur = t.current() === p, show = done && t.result.some(function (r) { return r.id === p.id && r.shown; });
    var state = statePill(p, done);
    var cards = !p.hole.length ? '' : (show ? p.hole.map(function (c) { return cardHtml(c, 'mini flip'); }).join('') : (p.folded ? '' : backHtml() + backHtml()));
    var win = G.win && G.win.indexOf(p.id) >= 0 && done;
    var dealer = t.players.indexOf(p) === t.dealer ? '<u class="hd-dealer">D</u>' : '';
    var res = done ? t.result.filter(function (r) { return r.id === p.id; })[0] : null;
    var gain = res && res.won > 0 ? '<strong class="hd-gain">+' + res.won + '</strong>' : '';
    return '<div data-pid="' + p.id + '" class="hd-seat ' + POS[i] + (cur ? ' turn' : '') + (win ? ' win' : '') + (p.folded ? ' out' : '') + '">' +
      (G.talk && G.talk[p.id] ? '<div class="hd-say">' + esc(G.talk[p.id]) + '</div>' : '') +
      '<div class="hd-av">' + p.emoji + dealer + '</div><div class="hd-nm">' + esc(p.name) + '</div><div class="hd-st">🎞 ' + p.chips + '</div>' +
      '<div class="hd-mc">' + cards + '</div>' + (cur ? '<em class="think">думает…</em>' : state) + gain + '</div>';
  }
  function render() {
    if (!root || !G) return;
    var t = G.t, me = G.hero, done = t.stage === 'done', st = loadSt();
    if (t.community.length !== G.street) { G.street = t.community.length; G.acts = {}; }
    var board = '';
    for (var i = 0; i < 5; i++) board += t.community[i] !== undefined ? cardHtml(t.community[i], i >= G.shown ? 'new' : '') : '<div class="hd-c slot"></div>';
    if (t.community.length > G.shown) sfx('deal');
    G.shown = t.community.length;
    var seats = BOTS.map(function (b, i) { var p = t.get(b.id); return p && t.players.indexOf(p) >= 0 ? seatHtml(p, i) : '<div class="hd-seat ' + POS[i] + ' out gone"><div class="hd-av">' + b.emoji + '</div><div class="hd-nm">' + esc(b.name) + '</div><div class="hd-st">' + (G.tour && G.tour.outAt[b.id] ? 'вылетел · ' + G.tour.outAt[b.id] + ' место' : '') + '</div></div>'; }).join('');
    var hkey = me.hole.join(); var freshDeal = hkey !== G.heroKey; G.heroKey = hkey;
    var myCards = me.hole.length ? me.hole.map(function (c) { return cardHtml(c, 'big' + (freshDeal ? ' dealt' : '')); }).join('') : '';
    var label = '';
    if (me.hole.length && !me.folded) label = t.community.length >= 3 ? HE.handName(HE.best(me.hole.concat(t.community))) : (HE.rankOf(me.hole[0]) === HE.rankOf(me.hole[1]) ? 'Карманная пара' : '');
    var turnMe = t.current() === me;
    var meState = statePill(me, done);
    var mine = '<div class="hd-me' + (turnMe ? ' turn' : '') + (G.win && G.win.indexOf('me') >= 0 && done ? ' win' : '') + '">' +
      '<div class="hd-me-info">' + (G.emoMe ? '<div class="hd-say hd-say-me">' + esc(G.emoMe) + '</div>' : '') + '<div class="hd-av ' + frameCls(st) + '">' + heroAv() + (t.players.indexOf(me) === t.dealer ? '<u class="hd-dealer">D</u>' : '') + '</div><div class="hd-nm">' + esc(heroName()) + '</div><div class="hd-st">🎞 ' + me.chips + '</div>' + meState + '</div>' +
      '<div class="hd-mycards">' + myCards + '</div><div class="hd-label ' + labCls(label) + '">' + esc(label) + '</div><button class="hd-emo" id="hd-emo">💬</button></div>';
    var banner = '';
    if (done && G.win && G.win.length) {
      var wr = t.result.filter(function (r) { return r.won > 0; }).sort(function (a, b) { return b.won - a.won; })[0];
      if (wr && wr.id === 'me' && wr.won >= 300) G.shareTxt = '🃏 Выиграл банк +' + wr.won + ' в покере Капитана Кино' + (wr.hand ? ' (' + wr.hand + ')' : '') + '! Сыграй со мной в мини-аппке 🎬';
      if (wr) banner = '<div class="hd-banner"><b>🏆 ' + (wr.id === 'me' ? 'Ты' : esc(wr.name)) + ' +' + wr.won + '</b><span>' + esc(wr.hand || 'все сфолдили') + (wr.id === 'me' && G.streak > 1 ? ' · 🔥 серия ' + G.streak : '') + '</span></div>';
    }
    var actions = '';
    if (G.tour && G.tour.end) {
      var E = G.tour.end;
      actions = podium(E.place) + '<div class="hd-over">' + (E.place === 1 ? '🏆 Ты выиграл турнир! +' + E.prize + ' 🎞' : 'Ты занял ' + E.place + ' место' + (E.prize ? ' · приз +' + E.prize + ' 🎞' : '')) + '</div><div class="hd-row">' + (st.chips >= TOUR.entry ? '<button class="hd-btn go" id="hd-again">🔁 Ещё турнир</button>' : '') + '<button class="hd-btn" id="hd-leave">🚪 В меню</button></div>';
    } else if (G.chal && done) {
      actions = '<div class="hd-over">' + (G.chal.won ? '🏆 Челлендж выигран! +' + CHAL_PRIZE + ' 🎞' : 'Челлендж не засчитан. Завтра будет новая раздача!') + '</div><div class="hd-row"><button class="hd-btn" id="hd-rev">🔍 Разбор</button><button class="hd-btn go" id="hd-leave">В меню</button></div>';
    } else if (me.chips <= 0 && (done || !me.hole.length)) {
      actions = '<div class="hd-over">Ты проиграл все фишки за столом</div><div class="hd-row"><button class="hd-btn" id="hd-rev">🔍 Разбор</button></div><div class="hd-row">' + (st.chips >= 100 ? '<button class="hd-btn go" id="hd-rebuy">Сесть заново</button>' : '') + '<button class="hd-btn" id="hd-leave">🚪 Выйти</button></div>';
    } else if (done) {
      actions = '<div class="hd-row"><button class="hd-btn go" id="hd-next">▶️ Следующая раздача</button><button class="hd-btn" id="hd-leave">🚪 Выйти со столом</button></div><div class="hd-row"><button class="hd-hist-btn" id="hd-rev">🔍 Разбор</button><button class="hd-hist-btn" id="hd-hist">📜 История</button>' + (G.shareTxt ? '<button class="hd-hist-btn" id="hd-share">📣 Похвастаться</button>' : '') + '</div>';
    } else if (turnMe) {
      var call = t.toCall(me), lg = t.legal(me), pot = t.pot();
      var r1 = '<button class="hd-btn fold" data-a="fold">Фолд</button><button class="hd-btn go" data-a="' + (call ? 'call' : 'check') + '">' + (call ? 'Колл ' + call : 'Чек') + '</button>';
      var r2 = '';
      if (lg.indexOf('raise') >= 0) {
        var mn = t.minRaiseTo(me), max = me.bet + me.chips, seen = {};
        [['Мин', mn], ['½ банка', t.currentBet + Math.round(pot / 2 / 10) * 10], ['Банк', t.currentBet + pot]].forEach(function (o) {
          var v = Math.max(mn, Math.min(o[1], max)); if (v >= max || seen[v]) return; seen[v] = 1;
          r2 += '<button class="hd-btn sm" data-a="raise" data-to="' + v + '">' + o[0] + ' · ' + v + '</button>';
        });
        r2 += '<button class="hd-btn sm allin" data-a="allin">🔥 Ва-банк ' + max + '</button>';
      }
      var sl = '';
      if (lg.indexOf('raise') >= 0 && me.bet + me.chips > t.minRaiseTo(me)) {
        var lo = t.minRaiseTo(me), hi = me.bet + me.chips;
        sl = '<div class="hd-slider"><input type="range" id="hd-rng" min="' + lo + '" max="' + hi + '" step="1" value="' + lo + '"><button class="hd-btn sm go" id="hd-rz">Рейз до <b id="hd-rv">' + lo + '</b></button></div>';
      }
      actions = hintHtml(t, me) + '<div class="hd-row">' + r1 + '</div>' + sl + (r2 ? '<div class="hd-row wrap">' + r2 + '</div>' : '');
    } else {
      actions = '<div class="hd-wait">' + (t.current() ? 'Ходит ' + esc(t.current().name) + '…' : '') + '</div>';
    }
    root.innerHTML = '<div class="pk-top"><button class="pk-x" id="hd-x">✕</button><div class="pk-title">🎬 Стол Капитана</div><div class="pk-chips">🎞 ' + st.chips + '</div><button class="hd-snd" id="hd-help">❓</button><button class="hd-snd' + (st.fast ? ' on' : '') + '" id="hd-fast" title="Быстрая игра">⚡</button><button class="hd-snd" id="hd-snd">' + (st.snd === false ? '🔇' : '🔊') + '</button></div>' +
      '<div class="hd-table th-' + themeId(st) + '"><div class="hd-felt"><div class="hd-brand">КАПИТАН КИНО</div>' +
      '<div class="hd-wm">🎬</div><div class="hd-board">' + board + '</div><div class="hd-pot">' + potChips(t.pot()) + '<span>Банк <b>' + t.pot() + '</b></span></div>' + banner + '</div>' + seats + '</div>' +
      '<div class="hd-msg">' + esc(G.lastMsg || '') + '</div>' + mine + actions +
      '<div class="pk-note">' + (G.tour ? '🏆 Турнир · уровень ' + (G.tour.lvl + 1) + ' · ' : '') + 'Блайнды ' + t.sb + '/' + t.bb + ' · виртуальные фишки · на ранг и очки не влияют</div>';
    root.querySelector('#hd-x').onclick = function () { close(); };
    root.querySelector('#hd-help').onclick = showCheat;
    var eb = root.querySelector('#hd-emo'); if (eb) eb.onclick = function () { G.emoOpen = true; openEmoPop(); };
    if (G.emoOpen) openEmoPop();
    root.querySelector('#hd-fast').onclick = function () { var q = loadSt(); q.fast = !q.fast; saveSt(q); this.classList.toggle('on', !!q.fast); sfx('chip'); msgFast(q.fast); };
    root.querySelector('#hd-snd').onclick = function () { var q = loadSt(); q.snd = q.snd === false; saveSt(q); this.textContent = q.snd === false ? '🔇' : '🔊'; if (q.snd !== false) sfx('chip'); };
    root.querySelectorAll('[data-a]').forEach(function (b) { b.onclick = function () { hero(b.dataset.a, +b.dataset.to || 0); }; });
    var rg = root.querySelector('#hd-rng');
    if (rg) {
      rg.oninput = function () { root.querySelector('#hd-rv').textContent = rg.value; };
      root.querySelector('#hd-rz').onclick = function () { hero('raise', +rg.value); };
    }
    var rb = root.querySelector('#hd-rev'); if (rb) rb.onclick = showReview;
    var hb = root.querySelector('#hd-hist'); if (hb) hb.onclick = function () {
      var h = loadSt().hist || [], box = document.createElement('div'); box.className = 'hd-histbox';
      box.innerHTML = '<div class="hd-histcard"><b>📜 Последние раздачи</b>' + (h.length ? h.map(function (x) { return '<div class="hd-hrow"><span>' + esc(x.w) + ' · ' + esc(x.h) + '</span><em class="' + (x.n > 0 ? 'up' : x.n < 0 ? 'dn' : '') + '">' + (x.n > 0 ? '+' : '') + x.n + '</em></div>'; }).join('') : '<p>Пока пусто</p>') + '<button class="hd-btn go" id="hd-hclose">Закрыть</button></div>';
      root.appendChild(box); box.onclick = function (e) { if (e.target === box || e.target.id === 'hd-hclose') box.remove(); };
    };
    var ag = root.querySelector('#hd-again'); if (ag) ag.onclick = startTour;
    var nx = root.querySelector('#hd-next'); if (nx) nx.onclick = nextHand;
    var shb = root.querySelector('#hd-share'); if (shb) shb.onclick = function () { var u = 'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/kapitan_kino_bot') + '&text=' + encodeURIComponent(G.shareTxt || ''); try { tg.openTelegramLink(u); } catch (e) { window.open(u, '_blank'); } };
    var lv = root.querySelector('#hd-leave'); if (lv) lv.onclick = function () { close(); openMenu(); };
    var rb = root.querySelector('#hd-rebuy'); if (rb) rb.onclick = function () { cashOut(); openBuyIn(); };
  }

  window.openVideoPoker = window.openVideoPoker || window.openPoker;
  window.openPoker = openMenu;
  window.__holdemAI = { strength: strength, aiDecide: aiDecide };
})();
// </ui>

/* ===== HOLDEM:END ===== */
