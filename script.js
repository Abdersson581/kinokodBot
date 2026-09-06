// Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ---------- доступ: мягкие ворота подписки ----------
const ACCESS_KEY = 'kinoafisha_access';
const CHANNEL_URL = 'https://t.me/capitanKino1';

function showGate() {
  document.getElementById('gate').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('btn-gate-channel').onclick = () => tg.openTelegramLink(CHANNEL_URL);
  document.getElementById('btn-gate-check').onclick = () =>
    sendOrDeepLink({ action: 'access_check' });
  document.getElementById('btn-gate-skip').onclick = enterApp;
}
function enterApp() {
  localStorage.setItem(ACCESS_KEY, '1');
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  parseProfileHash();  // до parseUnlockedHash: тот очищает location.hash
  parseUnlockedHash();
  bumpDaily();         // v64: ежедневная серия заходит
  initHideToggle();
  applyGridCols();
  initSearchHist();
  loadMovies();
}
// ВНИМАНИЕ: запуск (enterApp/showGate) перенесён в САМЫЙ КОНЕЦ файла —
// раньше он выполнялся здесь, до объявления ALL/COLLS/обработчиков, и любое
// падение верхнеуровневого кода оставляло приложение пустым (TDZ-гонка с fetch).

// ---------- тема: авто из Telegram + ручной переключатель ----------
const THEME_KEY = 'kinoafisha_theme';
function applyTheme() {
  // Ручной переключатель имеет приоритет над авто-темой из Telegram
  const saved = localStorage.getItem(THEME_KEY);
  const scheme = saved || (tg.colorScheme || 'dark');
  document.body.classList.toggle('light', scheme === 'light');
}
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
  haptic('light');
}
function manualTheme() {
  // При ручном переключении сохраняем выбор и отключаем авто-подхват
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    localStorage.removeItem(THEME_KEY);  // возвращаем авто-тему из Telegram
  }
  applyTheme();
  haptic('light');
}
applyTheme();
tg.onEvent('themeChanged', () => {
  // Авто-тема меняет только если пользователь не выбрал вручную
  if (!localStorage.getItem(THEME_KEY)) applyTheme();
});

// ---------- акцент-пресеты (классика / неон / золото) ----------
// Три набора цвета оформления; подробрен в style.css через body.accent-*.
const ACCENT_KEY = 'kinoafisha_accent';
const ACCENTS = ['classic', 'neon', 'gold'];
function applyAccent() {
  const cur = localStorage.getItem(ACCENT_KEY) || 'classic';
  document.body.classList.remove('accent-neon', 'accent-gold');
  if (cur !== 'classic') document.body.classList.add('accent-' + cur);
  const btn = document.getElementById('btn-accent');
  if (btn) btn.textContent = cur === 'neon' ? '💠' : cur === 'gold' ? '✨' : '🎨';
}
function cycleAccent() {
  const cur = localStorage.getItem(ACCENT_KEY) || 'classic';
  const next = ACCENTS[(ACCENTS.indexOf(cur) + 1) % ACCENTS.length];
  localStorage.setItem(ACCENT_KEY, next);
  applyAccent();
  haptic('light');
}
applyAccent();
document.getElementById('btn-accent').addEventListener('click', cycleAccent);

// ---------- состояние ----------
let ALL = [];                       // все фильмы
let COLLS = [];                     // подборки
let NEWS = [];                      // последние новости кино
let LEADERBOARD = [];               // топ игроков сезона
let LEADERBOARD_KIND = 'week';      // week | total — по чему ранжируем
let view = 'grid';                  // grid | cols | cols-detail | fav | detail | game | news | top | profile | trailers | achievements
let activeGenre = '';               // выбранный жанр-фильтр ('' = все)
let trailerGenre = '';              // жанр-фильтр для трейлеров
const FAV_KEY = 'kinoafisha_favs';
const FAV_MODE_KEY = 'kinoafisha_fav_mode';  // «Моё»: fav = хочу посмотреть | done = разгаданные
const getFavs = () => JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
const setFavs = (a) => localStorage.setItem(FAV_KEY, JSON.stringify([...a]));
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
const setWatched = (a) => localStorage.setItem(WATCHED_KEY, JSON.stringify([...a]));
const toggleWatched = (code) => {
  const w = new Set(getWatched());
  w.has(code) ? w.delete(code) : w.add(code);
  setWatched(w);
  haptic(w.has(code) ? 'ok' : 'light');
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
};

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
    out.push({ date: d, open: v.open || 0, trailers: v.trailers || 0, favs: v.favs || 0 });
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
}
function removeRating(code) {
  const all = getRatings();
  delete all[String(code)];
  localStorage.setItem(RATINGS_KEY, JSON.stringify(all));
  haptic('light');
}
// «вес» фильма во вкусе пользователя: чем выше оценка — тем сильнее сигнал
const ratingWeight = (r) => 1 + (parseInt(r, 10) || 0) * 1.2;

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
  el.classList.remove('hidden');
  el.innerHTML = `<span class="streak-flame">🔥</span>` +
    `<span class="streak-num">${s.series}</span>` +
    `<span class="streak-label">${_daysWord(s.series)} подряд</span>` +
    (next ? `<span class="streak-next">до ${next} 🔥 — ещё ${next - s.series}</span>` : `<span class="streak-next">легенда афиши 🏆</span>`) +
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
      // очищаем хэш, чтобы повторные открытия не переписывали старым списком
      history.replaceState(null, '', location.pathname);
    }
  } catch (e) { /* пусто */ }
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

// ---------- история поиска: чипы под поиском ----------
function initSearchHist() {
  const chips = document.getElementById('search-hist');
  if (!chips) return;
  const hist = getSearchHist();
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
      initSearchHist();
      renderGrid();
      haptic('light');
    });
  });
}

// ---------- утилиты ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// Haptic-отклик: вибрация на действиях (нет поддержки — тихо пропускаем)
function haptic(kind = 'light') {
  try {
    if (kind === 'ok' || kind === 'error') tg.HapticFeedback?.notificationOccurred(kind);
    else tg.HapticFeedback?.impactOccurred(kind);
  } catch (e) { /* пусто */ }
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
  else if (data.action === 'subscribe_code_day') start = 'code_day_on';
  else if (data.action === 'save_favs') start = 'save_favs';
  else if (data.action === 'access_check') start = 'check_sub';
  else if (data.action === 'quiz_result') start = 'quiz_' + data.correct + '_' + data.total;
  else if (data.action === 'rate_movie') start = 'rate_' + data.code;
  else if (data.action === 'review_movie') start = 'review_' + data.code;
  else if (data.action === 'trailer_movie' || data.action === 'trailer') start = 'trailer_' + data.code;
  else if (data.action === 'sync_unlocked') start = 'sync_unlocked';
  else if (data.action === 'kinogod') start = 'kinogod';
  else if (data.action === 'toggle_optin') start = data.on ? 'optin_on' : 'optin_off';
  else if (data.action === 'set_theme') start = 'theme_' + data.theme;
  haptic('light');
  try {
    tg.openTelegramLink('https://t.me/kapitan_kino_bot?start=' + start);
  } catch (e) {
    // даже openTelegramLink недоступен (открыто вне Telegram) — обычная ссылка
    window.open('https://t.me/kapitan_kino_bot?start=' + start, '_blank');
  }
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


function posterHtml(m) {
  const fav = getFavs().includes(m.code);
  return `<div class="poster-wrap">
    ${m.poster
      ? `<img src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy" decoding="async" ${FADE}${dimStyle(m)}
           onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>`
      : `<div class="poster-placeholder"><span>🎬</span><em>${esc(m.title)}</em></div>`}
    <span class="code-badge">🔑 ${esc(String(m.code))}</span>
    ${isNew(m) ? '<span class="new-badge">🔥 Новинка</span>' : ''}
    ${getNotes()[m.code] ? '<span class="note-badge" title="Заметка">📝</span>' : ''}
    ${fav ? '<span class="fav-badge">❤️</span>' : ''}
  </div>`;
}

// Быстрая кнопка «❤️/🤍» на карточке фильма (в сетке и полках) — без открытия
function posterHtmlQuick(m) {
  const fav = getFavs().includes(m.code);
  const watched = getWatched().includes(String(m.code));
  const hasNote = !!getNotes()[m.code];
  return `<div class="poster-wrap">
    ${m.poster
      ? `<img src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy" decoding="async" ${FADE}${dimStyle(m)}
           onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>`
      : `<div class="poster-placeholder"><span>🎬</span><em>${esc(m.title)}</em></div>`}
    <span class="code-badge">🔑 ${esc(String(m.code))}</span>
    ${isNew(m) ? '<span class="new-badge">🔥 Новинка</span>' : ''}
    ${watched ? '<span class="watched-badge" title="Просмотрено">👁</span>' : ''}
    ${hasNote ? '<span class="note-badge" title="Заметка">📝</span>' : ''}
    <button class="fav-quick ${fav ? 'active' : ''}" data-code="${esc(m.code)}" aria-label="Моё" title="В «Моё»">${fav ? '❤️' : '🤍'}</button>
  </div>`;
}
function wireFavQuick(container) {
  if (!container) return;
  container.querySelectorAll('.fav-quick').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(btn.dataset.code);
      const fav = getFavs().includes(btn.dataset.code);
      btn.textContent = fav ? '❤️' : '🤍';
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
}

// ---------- загрузка ----------
const DATA_CACHE_KEY = 'kinoafisha_data_cache';

// Применяем порцию данных (из кэша или сети) ко всему интерфейсу
function applyData(data) {
  ALL = data.all || [];
  COLLS = data.cols || [];
  const meta = data.meta || {};
  EMOJI_RIDDLES = Array.isArray(meta.emoji_riddles) ? meta.emoji_riddles : [];
  NEWS = Array.isArray(meta.recent_news) ? meta.recent_news : [];
  LEADERBOARD = Array.isArray(meta.leaderboard) ? meta.leaderboard : [];
  LEADERBOARD_KIND = meta.leaderboard_kind === 'total' ? 'total' : 'week';
  updateSubtitle();
  renderGenreChips();
  showCodeDay(meta);
  renderFilmDay();
  renderHero();
  renderTodayShelf(meta);
  renderRecentShelf();
  renderRecoShelf();
  renderPremieres(meta);
  renderGrid();
  updateChallPane();
  updateHeaderProgress();
  renderStreakStrip();
  parseRiddleHash();
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
    try { localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
    applyData(data);
    // Бейдж новых достижений на кнопке «Ещё» + восстановление последнего
    // открытого раздела (пусто/«grid» — обычная афиша).
    updateMoreBadge();
    let saved = null;
    try { saved = localStorage.getItem(LAST_VIEW_KEY); } catch (e) {}
    if (saved && saved !== 'grid') openView(saved);
  } catch (e) {
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
  el.innerHTML = `<span class="hp-streak">🔥 ${strk}</span>` +
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
function updateChallPane() {
  const pane = document.getElementById('chall-pane');
  if (!pane) return;
  const c = getChallenges();
  const listEl = document.getElementById('chall-list');
  const countEl = document.getElementById('chall-count');
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
  const doneCount = CHALLENGE_LIST.filter(ch => c.done.includes(ch.id) || ch.check()).length;
  if (countEl) countEl.textContent = `${doneCount}/${CHALLENGE_LIST.length}`;
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
    <div class="coll-grid">${all.map(m => {
      const ok = unlockedSet.has(String(m.code));
      return `<span class="coll-cell ${ok ? 'on' : ''}" title="${esc(m.title)}"
          data-code="${esc(m.code)}">${ok ? '🎬' : '❔'}</span>`;
    }).join('')}</div>`;
  wrap.querySelectorAll('.coll-cell.on').forEach(cell =>
    cell.addEventListener('click', () => openDetail(cell.dataset.code)));
}

// ---------- hero-полка «Сейчас в тренде» ----------
// Живая строка статистики в шапке
function updateSubtitle() {
  const el = document.getElementById('subtitle');
  if (!el) return;
  const parts = [`Капитан Кино · ${ALL.length} фильм(ов)`];
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
function renderHero() {
  const top = [...ALL]
    .filter(m => m.poster && parseFloat(m.rating))
    .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0))
    .slice(0, 5);
  const shelf = document.getElementById('hero-shelf');
  if (top.length < 3 || !shelf) return;
  document.getElementById('hero-row').innerHTML = top.map((m, i) => `
    <div class="hero-card" data-code="${esc(m.code)}">
      ${posterHtmlQuick(m)}
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

// Полка «🍿 Скоро в кино» — премьеры текущего месяца от бота/КП
// «⭐ Сегодня и завтра в кино» — премьеры с датой сегодня/завтра
function renderTodayShelf(meta) {
  const shelf = document.getElementById('today-shelf');
  if (!shelf) return;
  const items = (meta && Array.isArray(meta.premieres)) ? meta.premieres : [];
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
        <span class="rating">📅 ${String(p.ru_date || '').slice(0, 10)}</span>
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
function filmDayPick() {
  const cands = ALL.filter(m => (parseFloat(m.rating) || 0) >= 7.3 && m.poster);
  if (cands.length < 5) return null;
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
    <div class="fd-grad"></div>
    <div class="fd-content">
      <div class="fd-info">
        <span class="fd-badge">⭐ Фильм дня</span>
        <div class="fd-title">${esc(m.title)}</div>
        <div class="fd-meta">${esc(String(m.year || ''))}${m.year && m.rating ? ' · ' : ''}⭐ ${esc(String(m.rating || ''))}${genres ? ' · ' + esc(genres) : ''}</div>
      </div>
      <button class="fav-quick ${fav ? 'active' : ''}" data-code="${esc(m.code)}" aria-label="Моё" title="В «Моё»">${fav ? '❤️' : '🤍'}</button>
    </div>`;
  const bgImg = m.trailer_thumb || m.poster;
  el.style.backgroundImage = `url('${esc(bgImg)}')`;
  el.onclick = () => openDetail(m.code);
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

function renderPremieres(meta) {
  const shelf = document.getElementById('premieres-shelf');
  if (!shelf) return;
  const items = (meta && Array.isArray(meta.premieres)) ? meta.premieres : [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pending = items.filter(p => {
    const d = p.ru_date ? new Date(String(p.ru_date).slice(0, 10) + 'T00:00:00') : null;
    return !d || d >= today;
  }).slice(0, 10);
  if (pending.length < 2) { shelf.classList.add('hidden'); return; }
  document.getElementById('premieres-row').innerHTML = pending.map(p => {
    const title = p.title || '';
    const dateText = p.ru_date ? String(p.ru_date).slice(0, 10) : (p.date || '');
    return `
    <div class="hero-card" data-title="${esc(title)}">
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
      <button class="btn-lucky" id="btn-cod-open" style="margin-left:auto">Открыть</button>
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

// ---------- подборки ----------
function renderCols() {
  const c = document.getElementById('cols-container');
  if (!COLLS.length) {
    c.innerHTML = `<p class="error">Подборки появятся скоро 📚</p>`;
    return;
  }
  c.innerHTML = COLLS.map(col => {
    const posters = col.codes
      .map(cd => ALL.find(m => m.code === cd))
      .filter(m => m && m.poster)
      .slice(0, 3);
    const fan = posters.length
      ? `<div class="col-fan">${posters.map((p, i) =>
          `<img src="${esc(p.poster)}" alt="" style="z-index:${3 - i};transform:rotate(${(i - 1) * 6}deg) translateX(${(i - 1) * 8}px)" loading="lazy"/>`
        ).join('')}</div>`
      : `<span class="col-emoji">${esc(col.emoji || '📚')}</span>`;
    return `
    <div class="col-card" data-col="${esc(col.code)}">
      ${fan}
      <div class="col-body">
        <h3>${esc(col.emoji || '📚')} ${esc(col.title)}</h3>
        <p>${col.codes.length} фильм(ов)</p>
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
      c.innerHTML = `
        <button class="btn-back" id="btn-cols-back">◀️ Все подборки</button>
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
      c.querySelectorAll('.movie-card').forEach(elc =>
        elc.addEventListener('click', () => openDetail(elc.dataset.code)));
    }));
  c.querySelectorAll('.btn-share-sm').forEach(b =>
    b.addEventListener('click', () => {
      const col = COLLS.find(x => x.code === b.dataset.share);
      if (!col) return;
      const text = `У меня в «Киноафише» подборка ${col.emoji || '📚'} «${col.title}» — ${col.codes.length} фильмов! Угадай их по кодам в боте «Капитан Кино» 🎬`;
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent('https://t.me/kapitan_kino_bot')}&text=${encodeURIComponent(text)}`);
    }));
}

// ---------- лента «📰 Новости кино» ----------
function renderNews() {
  const c = document.getElementById('news-container');
  if (!c) return;
  if (!NEWS.length) {
    c.innerHTML = '<p class="error">Пока нет новостей — загляните позже 📰</p>';
    return;
  }
  // Новости приходят от новых к старшим — показываем сначала свежие
  const items = [...NEWS].reverse();
  c.innerHTML = items.map(n => {
    const img = n.image
      ? `<img src="${esc(n.image)}" alt="" loading="lazy" onerror="this.style.display='none'"/>`
      : `<div class="news-thumb news-thumb-ph"><span>📰</span></div>`;
    const when = _newsWhen(n.ts);
    const source = n.source ? `<span class="news-source">${esc(n.source)}</span>` : '';
    const url = n.link || '';
    return `
      <div class="news-card" data-link="${esc(url)}">
        <div class="news-thumb-wrap">${img}</div>
        <div class="news-body">
          <h3>${esc(n.title || 'Новость')}</h3>
          <div class="news-meta">${source}${source ? ' · ' : ''}${when}</div>
        </div>
      </div>`;
  }).join('');
  c.querySelectorAll('.news-card').forEach(el => {
    el.addEventListener('click', () => {
      const url = el.dataset.link;
      if (!url) return;
      haptic('light');
      try { tg.openLink(url, { try_instant_view: false }); } catch (_) { window.open(url, '_blank'); }
    });
  });
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
        ${weekBlock}
        <button class="btn-primary" id="pf-sync">🔁 Синхронизировать с ботом</button>
        <button class="btn-secondary pf-invite" id="pf-invite">📣 Пригласить друга</button>
      </div>`;
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
        <div class="pf-stat"><b>👁 ${esc(String(getWatched().length))}</b><span>просмотрено</span></div>
        <div class="pf-stat"><b>${rank ? '🏆 №' + rank : '🏆 —'}</b><span>${rank ? 'в общем топе' : 'ещё не в топе'}</span></div>
      </div>
      ${achBlock}
      ${weekBlock}
      ${favouriteGenre() ? `<div class="pf-favgenre">🌟 Любимый жанр: <b>${esc(favouriteGenre())}</b></div>` : ''}
      ${wgBlock}
      ${optBlock}
      <div class="pf-actions">
        <button class="btn-secondary" id="pf-sync2">🔁 Обновить</button>
        <button class="btn-secondary" id="pf-bot">🏅 Профиль в боте</button>
      </div>
      <button class="btn-secondary pf-invite" id="pf-invite">📣 Пригласить друга</button>
    </div>`;
  document.getElementById('pf-sync2').onclick = () => sendOrDeepLink({ action: 'sync_unlocked' });
  const inv = document.getElementById('pf-invite');
  if (inv) inv.onclick = _inviteFriend;
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

// ---------- трейлеры «🎥» ----------
// Все трейлеры в одном месте — с поиском, сортировкой и фильтром по жанру.
let _trailerSearchTimer = null;
let _trailerPage = 1;                 // текущая страница сетки трейлеров
const TRAILERS_PER_PAGE = 20;         // фильмов на одной странице

function renderTrailerGenreChips() {
  const wrap = document.getElementById('trailer-genre-chips');
  if (!wrap) return;
  const withTrailers = ALL.filter(m => m.trailer_yt || m.trailer_file_id);
  const counter = new Map();
  withTrailers.forEach(m => (m.genres || []).forEach(g => counter.set(g, (counter.get(g) || 0) + 1)));
  const top = [...counter.entries()].filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!top.length) { wrap.classList.add('hidden'); return; }
  wrap.innerHTML = `<button class="chip${trailerGenre === '' ? ' active' : ''}" data-g="">Все</button>` +
    top.map(([g, n]) =>
      `<button class="chip${trailerGenre === g ? ' active' : ''}" data-g="${esc(g)}">${esc(g)} <em>${n}</em></button>`
    ).join('');
  wrap.classList.remove('hidden');
  wrap.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
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
  if (qRaw) {
    const digits = qRaw.replace(/\D/g, '');
    list = list.filter(m =>
      (m.title || '').toLowerCase().includes(qRaw) ||
      (digits && String(m.code || '').includes(digits))
    );
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
  if (!list.length) {
    c.innerHTML = '<p class="error">Нет трейлеров по запросу 🎬</p>';
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
  c.innerHTML = `<div class="trailers-grid">${pageItems.map(m => `
    <div class="trailer-card" data-code="${esc(m.code)}">
      <div class="trailer-thumb">
        ${(() => {
          const src = m.trailer_thumb || m.poster || (m.trailer_yt ? `https://i.ytimg.com/vi/${encodeURIComponent(m.trailer_yt)}/0.jpg` : '');
          const fb = m.poster || (m.trailer_yt ? `https://i.ytimg.com/vi/${encodeURIComponent(m.trailer_yt)}/hqdefault.jpg` : '');
          return src
            ? `<div class="thumb-blur" style="background-image:url('${esc(src)}')"></div><img src="${esc(src)}" alt="" loading="lazy" ${FADE}${dimStyle(m)} onerror="const b=this.previousElementSibling;if(!this.dataset.f){this.dataset.f=1;this.src='${esc(fb || '')}';if(b)b.style.backgroundImage='url(${esc(fb || '')})'}else{this.style.display='none';if(b)b.style.display='none'}"/>`
            : `<div class="trailer-thumb-ph">🎬</div>`;
        })()}
        <span class="trailer-play">▶️</span>
        ${(!m.trailer_yt && m.trailer_file_id) ? '<span class="trailer-local">📥</span>' : ''}
      </div>
      <div class="trailer-info">
        <h3>${esc(m.title)}</h3>
        <div class="trailer-meta">
          ${m.year ? `<span>📅 ${esc(String(m.year))}</span>` : ''}
          ${m.rating ? `<span>⭐ ${esc(String(m.rating))}</span>` : ''}
        </div>
      </div>
    </div>`).join('')}</div>${pager}`;
  c.querySelectorAll('.trailer-card').forEach(el => {
    el.addEventListener('click', () => {
      const m = ALL.find(x => x.code === el.dataset.code);
      if (m) openTrailer(m);
    });
  });
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

// ---------- бэкап «Моё» через бота ----------
function backupFavsNotice() {
  const favs = getFavs();
  const favTitles = favs.map(code => {
    const m = ALL.find(x => String(x.code) === String(code));
    return m ? `${m.code} — ${m.title}` : `${code}`;
  });
  if (favs.length < 2) return ''; // маленький список ни к чему не гонять
  // Переменная используется кнопкой «📋 Скопировать список» (см. copyFavsList)
  window._favTitlesCache = favTitles;
  return `
    <div class="cols-list">
      <div class="col-card backup-card">
        <div class="col-body">
          <h3>${favs.length > 0 ? `💾 «Моё» хранится локально (${favs.length})` : ''}</h3>
          <p>Сохрани список в боте — не потеряется при переустановке.</p>
        </div>
        <button class="btn-secondary" id="btn-copy-list">📋 Скопировать список</button>
        <button class="btn-secondary" id="btn-backup">💾 Сохранить в боте</button>
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

  return parts.length ? out : null;
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
  openImdbLink(m);                          // иначе — страница о фильме на IMDB
}
function openImdbLink(m) {
  const q = cleanKpTitle(m.title);
  openUrlLink('https://www.imdb.com/find/?q=' + encodeURIComponent(q || ''));
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
function showRiddleModal(code) {
  const m = ALL.find(x => String(x.code) === String(code));
  if (!m) return;
  const modal = document.getElementById('riddle-modal');
  if (!modal) return;
  const hints = document.getElementById('riddle-hints');
  if (hints) hints.textContent = riddleHints(m);
  const body = document.getElementById('riddle-body');
  if (body) { body.classList.add('hidden'); body.innerHTML = `
    <div class="riddle-reveal">
      ${m.poster ? `<img src="${esc(m.poster)}" alt="" ${FADE}/>` : ''}
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
}
function parseRiddleHash() {
  // Друг пришёл по ссылке «загадай другу»: #riddle=КОД. Показываем загадку
  // один раз и чистим хэш, чтобы при следующем открытии она не всплывала.
  try {
    const params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const code = params.get('riddle');
    if (code) {
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => showRiddleModal(code), 500);
    }
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

function renderGrid() {
  const qRaw = (document.getElementById('search').value || '').trim();
  // v64: нормализуем запрос (ё→е) — раньше «зелёная» с ё не находила «Зеленая миля»
  const q = qRaw.toLowerCase().replace(/ё/g, 'е');
  const smart = parseSmartQuery(qRaw);
  const sort = document.getElementById('sort').value;
  const favMode = localStorage.getItem(FAV_MODE_KEY);  // fav | done | watched
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
  // 🙈 «Скрыть разгаданные»: прячем карточки, код которых есть в localStorage
  if (localStorage.getItem(HIDE_KEY) === '1' && view !== 'fav') {
    const unlockedSet = new Set(getUnlocked());
    if (unlockedSet.size) list = list.filter(m => !unlockedSet.has(String(m.code)));
  }
    if (q && !smart) {
    const digits = q.replace(/\D/g, '');
    // Сначала точные совпадения (подстрока/код), затем — нечёткие по
    // расстоянию Левенштейна: «интерстелар» найдёт «Интерстеллар».
    const norm = (t) => (t || '').toLowerCase().replace(/ё/g, 'е');
    let matches = [];
    list.forEach(m => {
      const t = norm(m.title);
      if (t.includes(q) || (digits && String(m.code || '').includes(digits))) {
        matches.push({ m, score: 0 });
      }
    });
    if (!matches.length) {
      // 2-й эшелон: поиск «по содержимому» — описание, жанры, страны, год,
      // режиссёр и актёры (последние появятся по мере обогащения данных).
      list.forEach(m => {
        const hay = norm([
          m.description,
          (m.genres || []).join(' '),
          (m.countries || []).join(' '),
          m.year || '',
          m.director || '',
          (m.actors || []).join(' ')
        ].filter(Boolean).join(' · '));
        if (hay && hay.includes(q)) matches.push({ m, score: 1 });
      });
    }
    if (!matches.length) {
      // 3-й эшелон: неправильная раскладка клавиатуры. «ptktyfz» → «зеленая»,
      // «vbh» → «мир» и т.п. Конвертируем латиницу в русскую раскладку и ищем заново.
      const RU_LAYOUT = { q:'й', w:'ц', e:'у', r:'к', t:'е', y:'н', u:'г', i:'ш', o:'щ', p:'з',
        a:'ф', s:'ы', d:'в', f:'а', g:'п', h:'р', j:'о', k:'л', l:'д', z:'я', x:'ч', c:'с',
        v:'м', b:'и', n:'т', m:'ь', '[':'х', ']':'ъ', ';':'ж', "'":'э', ',':'б', '.':'ю' };
      if (/[a-z]/.test(q)) {
        const qRu = q.replace(/[a-z\[\];',.]/g, ch => RU_LAYOUT[ch] || ch);
        if (qRu && qRu !== q) {
          list.forEach(m => {
            const t = norm(m.title);
            if (t.includes(qRu) || (digits && String(m.code || '').includes(digits))) {
              matches.push({ m, score: 0 });
            }
          });
          if (!matches.length) {
            list.forEach(m => {
              const hay = norm([m.description, (m.genres || []).join(' ')].filter(Boolean).join(' '));
              if (hay && hay.includes(qRu)) matches.push({ m, score: 1 });
            });
          }
        }
      }
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
    return (a.title || '').localeCompare(b.title || '', 'ru');
  });
  const c = document.getElementById('movies-container');
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
    ? `<div class="fav-progress">Оценено ${Object.keys(getRatings()).length} фильм(ов) — рекомендации стали точнее 💫</div>`
    : '';
  const smartHint = smart
    ? `<div class="smart-hint">🧠 ${esc(smart.parts.join(' · '))} · найдено: ${list.length}<button class="smart-clear" title="Сбросить" onclick="document.getElementById('search').value='';renderGrid()">✕</button></div>`
    : '';
  const head = modeSwitch + progressLine + smartHint;
  const wireFavMode = () => {
    c.querySelectorAll('.fav-mode-btn').forEach(b => b.addEventListener('click', () => {
      try { localStorage.setItem(FAV_MODE_KEY, b.dataset.mode); } catch (e) {}
      haptic('light');
      renderGrid();
    }));
  };
  if (!list.length) {
    const emptyEmoji = view === 'fav' ? (favMode === 'done' ? '🔒' : favMode === 'watched' ? '👁' : favMode === 'rated' ? '⭐' : '🤍') : '🔍';
    const emptyText = view === 'fav'
      ? (favMode === 'done'
          ? 'Пока ничего не разгадано — лови коды в канале! 🔑'
          : (favMode === 'watched'
              ? 'Пока ничего не отмечено — жми «👁» на карточке фильма'
              : (favMode === 'rated'
                  ? 'Оценок пока нет — открой любой фильм и поставь звёзды ⭐'
                  : 'В «Моём» пока пусто — жми сердечко ❤️ на любом фильме')))
      : 'Ничего не нашлось 🤷 Попробуй другой запрос';
    c.innerHTML = head + `<div class="empty-state">
      <div class="empty-emoji">${emptyEmoji}</div>
      <p>${emptyText}</p>
      <button class="btn-secondary" id="btn-empty-lucky">🎲 Мне повезёт</button>
    </div>`;
    wireFavMode();
    const el = document.getElementById('btn-empty-lucky');
    if (el) el.onclick = () => {
      if (!ALL.length) return;
      haptic('light');
      const m = ALL[Math.floor(Math.random() * ALL.length)];
      openDetail(m.code);
    };
    return;
  }
  const backup = (view === 'fav' && favMode === 'fav') ? backupFavsNotice() : '';
  c.innerHTML = head + backup + list.map(m => {
    const myR = (view === 'fav' && favMode === 'rated') ? (getRatings()[String(m.code)] || 0) : 0;
    return `
    <div class="movie-card" data-code="${esc(m.code)}">
      ${posterHtmlQuick(m)}
      <div class="movie-info">
        <h3>${hlTitle(m.title, q)}</h3>
        <span class="rating">${ratingBadge(m)}${myR ? `<span class="my-stars">${'★'.repeat(myR)}</span>` : ''}</span>
      </div>
    </div>`;
  }).join('');
  const b = document.getElementById('btn-backup');
  if (b) b.onclick = () => sendOrDeepLink({ action: 'save_favs', codes: getFavs() });
  const bc = document.getElementById('btn-copy-list');
  if (bc) bc.onclick = copyFavsList;
  wireFavMode();
  // каскадное появление карточек
  Array.from(c.children).forEach((el, i) => {
    el.style.animationDelay = (Math.min(i, 24) * 0.03) + 's';
  });
  c.querySelectorAll('.movie-card').forEach(el =>
    el.addEventListener('click', () => openDetail(el.dataset.code)));
  wireFavQuick(c);
}
// ---------- карточка фильма ----------
let detailOrigin = 'grid';  // откуда открыт фильм — для кнопки «◀️ Назад»
function openDetail(code) {
  const m = ALL.find(x => x.code === code);
  if (!m) return;
  bumpWeekStat('open');
  addRecent(m.code);
  challDone('open_movie');
  if (view && view !== 'detail') detailOrigin = view;
  view = 'detail';
  showView('detail');
  const fav = getFavs().includes(code);
  const similar = findSimilar(m);
  // Чипы метаданных (год/длительность/страны) + кликабельные жанры:
  // тап по жанру-чипу фильтрует афишу этим жанром.
  const chips = [
    m.year ? `<span class="chip chip-dim">📅 ${esc(m.year)}</span>` : '',
    m.duration ? `<span class="chip chip-dim">⏱ ${esc(fmtDuration(m.duration))}</span>` : '',
    ...(m.countries || []).slice(0, 2).map(ct => `<span class="chip chip-dim">🌍 ${esc(ct)}</span>`),
    ...(m.genres || []).map(g =>
      `<button class="chip chip-genre${activeGenre === g ? ' active' : ''}" data-g="${esc(g)}" title="Фильмы этого жанра">${esc(g)}</button>`),
  ].filter(Boolean).join('');
  document.getElementById('view-detail').innerHTML = `
    <button class="btn-back" id="btn-back">◀️ Назад</button>
    <div class="detail">
      ${posterHtml(m)}
      <div class="detail-info">
        <h2>${esc(m.title)}</h2>
        <span class="rating">${ratingBadge(m)}</span>
        ${(() => {
          const myR = myRating(code);
          const stars = [1, 2, 3, 4, 5].map(i =>
            `<button class="star-btn${i <= myR ? ' on' : ''}" data-v="${i}" data-code="${esc(code)}" title="${i} из 5">★</button>`).join('');
          return `<div class="rate-strip">
            <span class="rate-label">${myR ? 'Твоя оценка:' : 'Оцени фильм:'}</span>
            <span class="rate-stars">${stars}</span>
            ${myR ? `<button class="rate-clear" data-code="${esc(code)}" title="Убрать оценку">✕</button>` : ''}
          </div>`;
        })()}
        ${chips ? `<div class="detail-chips">${chips}</div>` : ''}
        ${m.director ? `<p class="people-line">🎬 Режиссёр: <b class="person-chip" data-q="${esc(m.director)}" title="Найти фильмы">${esc(m.director)}</b></p>` : ''}
        ${(m.actors || []).length ? `<p class="people-line">⭐ В ролях: ${m.actors.slice(0, 4).map(a => `<b class="person-chip" data-q="${esc(a)}" title="Найти фильмы">${esc(a)}</b>`).join(', ')}</p>` : ''}
        <p class="desc">${esc(m.description || 'Описание скоро появится.')}</p>
        ${getNotes()[code] ? `<div class="note-box">📝 ${esc(getNotes()[code])}</div>` : ''}
        <div class="detail-actions">
          ${(m.link || cleanKpTitle(m.title)) ? '<button class="btn-watch" id="btn-watch">' + (m.link ? '▶️ Смотреть фильм' : '🍿 Где посмотреть') + '</button>' : ''}
          <button class="btn-primary" id="btn-open">🔓 Открыть код</button>
          ${m.trailer_mp4 || m.trailer_yt || m.trailer_file_id ? '<button class="btn-secondary" id="btn-trailer">▶️ Трейлер</button>' : ''}
          <button class="btn-fav ${fav ? 'active' : ''}" id="btn-fav">${fav ? '❤️ В «Моём»' : '🤍 Хочу посмотреть'}</button>
          <button class="btn-secondary ${getWatched().includes(String(code)) ? 'active watched-btn' : 'watched-btn'}" id="btn-watched">${getWatched().includes(String(code)) ? '👁 Просмотрено' : '👁 Отметить просмотренным'}</button>
          <button class="btn-secondary" id="btn-note">📝 ${getNotes()[code] ? 'Заметка есть' : 'Заметка'}</button>
          <button class="btn-secondary" id="btn-copy">📎 Скопировать код</button>
          <button class="btn-secondary" id="btn-riddle">🎭 Загадать другу</button>
          <button class="btn-secondary" id="btn-review">✍️ Отзыв</button>
          <button class="btn-secondary" id="btn-remind">🔔 Напомнить через час</button>
          ${cleanKpTitle(m.title) ? '<button class="btn-secondary" id="btn-kp">⭐ IMDB</button>' : ''}
          <button class="btn-secondary" id="btn-share">📤 Поделиться с другом</button>
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
          </div>`).join('')}
      </div>
    </div>` : ''}`;
  document.getElementById('btn-back').onclick = () => openView(detailOrigin || 'grid');
  document.getElementById('btn-open').onclick =
    () => sendOrDeepLink({ action: 'open_movie', code });
  const watchBtn = document.getElementById('btn-watch');
  if (watchBtn) watchBtn.onclick = () => openWatchLink(m);
  const kpBtn = document.getElementById('btn-kp');
  if (kpBtn) kpBtn.onclick = () => openImdbLink(m);
  // v64: оценка звёздами прямо в карточке (локально) + «Загадать другу»
  document.querySelectorAll('#view-detail .star-btn').forEach(b =>
    b.addEventListener('click', () => { setRating(b.dataset.code, parseInt(b.dataset.v, 10)); openDetail(code); }));
  const rateClear = document.querySelector('#view-detail .rate-clear');
  if (rateClear) rateClear.addEventListener('click', () => { removeRating(rateClear.dataset.code); openDetail(code); });
  const riddleBtn = document.getElementById('btn-riddle');
  if (riddleBtn) riddleBtn.onclick = () => shareRiddle(m);
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
  document.getElementById('btn-share').onclick = () => {
    const text = `🎬 «${m.title}» — рейтинг ${m.rating || '—'} на КП! Угадай фильм по коду в боте «Капитан Кино» 🎲`;
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent('https://t.me/kapitan_kino_bot')}&text=${encodeURIComponent(text)}`);
  };
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

function findSimilar(m) {
  // Похожие фильмы: совпадение жанров > года > рейтинга. Максимум 6 карточек.
  const mGenres = new Set(m.genres || []);
  const scored = ALL.filter(x => x.code !== m.code).map(x => {
    const xGenres = new Set(x.genres || []);
    let score = 0;
    mGenres.forEach(g => { if (xGenres.has(g)) score += 3; });
    if (x.year && m.year && Math.abs(x.year - m.year) <= 3) score += 2;
    if (x.year && m.year && x.year === m.year) score += 1;
    score += Math.min(parseFloat(x.rating) || 0, 10) / 5;
    return { movie: x, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map(x => x.movie);
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
      const film = ALL.find(x => String(x.code) === films[Math.floor(Math.random() * films.length)]);
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
  toggle('toolbar', name === 'catalog' || name === 'trailers');
  if (name === 'catalog') renderFilmDay();  // баннер скрываем/возвращаем при смене вьюхи
  const cur = name === 'catalog' ? view : name;
  document.querySelectorAll('.tab[data-view]').forEach(t =>
    t.classList.toggle('active', t.dataset.view === cur));
  const moreTab = document.getElementById('tab-more');
  if (moreTab) moreTab.classList.toggle('active',
    ['cols', 'top', 'achievements', 'profile', 'fav', 'game', 'chain'].includes(cur));
  document.querySelectorAll('.more-item').forEach(b =>
    b.classList.toggle('active', b.dataset.view === cur));
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
        ${r.options.map(t => `<button class="btn-option" data-t="${esc(t)}" data-a="${esc(r.answer)}">${esc(t)}</button>`).join('')}
      </div>
      <button class="btn-back" id="emoji-next">🎲 Другая загадка</button>
    </div>`;
  box.querySelectorAll('.btn-option').forEach(b => b.addEventListener('click', () => {
    if (box.dataset.locked === '1') return;
    box.dataset.locked = '1';
    const right = b.dataset.t === b.dataset.a;
    haptic(right ? 'ok' : 'error');
    b.classList.add(right ? 'correct' : 'wrong');
    box.querySelectorAll('.btn-option').forEach(x => {
      if (x.dataset.t === x.dataset.a) x.classList.add('correct');
      x.disabled = true;
    });
    const code = (ALL.find(m => m.title === r.answer) || {}).code;
    if (code) {
      const open = document.createElement('button');
      open.className = 'btn-primary';
      open.style.marginTop = '10px';
      open.textContent = `🔓 Открыть код «${r.answer}»`;
      open.onclick = () => sendOrDeepLink({ action: 'open_movie', code });
      box.querySelector('.emoji-game').appendChild(open);
    }
  }));
  document.getElementById('emoji-next').onclick = () => { haptic('light'); box.dataset.locked = '0'; renderEmojiGame(); };
}

const LAST_VIEW_KEY = 'kinoafisha_last_view';
// Единая точка открытия разделов: вкладки, подменю «Ещё» и восстановление
// последнего раздела при запуске — всё через openView.
function openView(v) {
  view = v;
  try { localStorage.setItem(LAST_VIEW_KEY, v); } catch (e) {}
  if (v === 'game') { showView('game'); renderEmojiGame(); startGame(); }
  else if (v === 'cols') { showView('cols'); renderCols(); }
  else if (v === 'news') { showView('news'); renderNews(); }
  else if (v === 'top') { showView('top'); renderLeaderboard(); }
  else if (v === 'profile') { showView('profile'); renderProfile(); }
  else if (v === 'trailers') { showView('trailers'); renderTrailerGenreChips(); renderTrailers(); }
  else if (v === 'achievements') { showView('achievements'); renderAchievements(); }
  else if (v === 'chain') { showView('chain'); renderChain(); }
  else { showView('catalog'); renderGrid(); }  // grid | fav
}
document.querySelectorAll('.tab[data-view]').forEach(t => t.addEventListener('click', () => openView(t.dataset.view)));

// ---------- v60: свайп влево/вправо листает главные вкладки ----------
// Афиша → Трейлеры → Новости и обратно. В доп. разделах («Ещё») и в карточке
// фильма свайп не работает, чтобы не уводить со специфичного экрана.
(() => {
  const ORDER = ['grid', 'trailers', 'news'];
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
    const cur = view === 'fav' ? 'grid' : view;
    const i = ORDER.indexOf(cur);
    if (i === -1) return;
    const next = dx < 0 ? ORDER[i + 1] : ORDER[i - 1];
    if (!next) return;
    haptic('light');
    openView(next);
  }, { passive: true });
})();

// ---------- раскрывающееся подменю «Ещё» ----------
const moreTab = document.getElementById('tab-more');
const moreMenu = document.getElementById('more-menu');
function closeMoreMenu() {
  if (moreMenu) moreMenu.classList.add('hidden');
  if (moreTab) moreTab.setAttribute('aria-expanded', 'false');
}
if (moreTab && moreMenu) {
  moreTab.addEventListener('click', (e) => {
    e.stopPropagation();
    const nowHidden = moreMenu.classList.toggle('hidden');
    moreTab.setAttribute('aria-expanded', String(!nowHidden));
    haptic('light');
  });
  // клик вне меню — закрываем
  document.addEventListener('click', (e) => {
    if (moreMenu.classList.contains('hidden')) return;
    if (!moreMenu.contains(e.target) && !moreTab.contains(e.target)) closeMoreMenu();
  });
  document.querySelectorAll('.more-item').forEach(b => b.addEventListener('click', () => {
    closeMoreMenu();
    openView(b.dataset.view);
  }));
}

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
  _searchTimer = setTimeout(renderGrid, 180);
});
document.getElementById('sort').addEventListener('change', renderGrid);
document.getElementById('search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const q = document.getElementById('search').value.trim();
    if (q) { addSearchHist(q); initSearchHist(); }
  }
});

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

// ---------- «О боте» ----------
document.getElementById('btn-info').addEventListener('click', () => {
  haptic('light');
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
// ---------- Трейлер: YouTube embed на весь экран ----------
function _requestFs(el) {
  try {
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
  } catch (e) { /* пусто */ }
}

function _exitFs() {
  try {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  } catch (e) { /* пусто */ }
}

function openTrailer(m) {
  if (!m) return;
  window._challTrailerWatched = (window._challTrailerWatched || 0) + 1;
  challDone('watch_trailer');
  bumpWeekStat('trailers');
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
    _requestFs(modal);
    return;
  }
  if (m.trailer_file_id) {
    // Действие называется 'trailer_movie' — ровно как в маппинге sendOrDeepLink
    // (раньше тут было 'trailer', маппинг не совпадал, и вместо видео уходил
    // фолбэк ?start=afisha — трейлер «не открывался»).
    sendOrDeepLink({ action: 'trailer_movie', code: m.code });
  }
}

function closeTrailer() {
  _exitFs();
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
window.addEventListener('error', (e) => {
  try {
    const el = document.getElementById('err-banner');
    if (el) {
      el.textContent = '⚠️ Ошибка приложения: ' + (e.message || 'неизвестная');
      el.classList.remove('hidden');
    }
  } catch (_) {}
});

// ---------- ЗАПУСК (в самом конце файла: все объявления и обработчики готовы) ----------
// Раньше enterApp() вызывался в начале файла, до объявления ALL/COLLS — из-за TDZ
// гонки с fetch приложение открывалось пустым. Теперь запускаем, когда всё готово.
// ---------- онбординг (показывается один раз) ----------
const OB_KEY = 'kinoafisha_onboarded';
function showOnboarding() {
  if (localStorage.getItem(OB_KEY)) return;
  const modal = document.getElementById('onboarding');
  if (!modal) return;
  let slide = 0;
  const total = 4;
  const slides = modal.querySelectorAll('.ob-slide');
  const dots = modal.querySelectorAll('.ob-dot');
  const nextBtn = document.getElementById('ob-next');
  const skipBtn = document.getElementById('ob-skip');
  const render = () => {
    slides.forEach((s, i) => s.classList.toggle('active', i === slide));
    dots.forEach((d, i) => d.classList.toggle('active', i === slide));
    nextBtn.textContent = slide === total - 1 ? 'Начать!' : 'Далее';
  };
  const close = () => {
    localStorage.setItem(OB_KEY, '1');
    modal.classList.add('hidden');
    haptic('light');
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

if (localStorage.getItem(ACCESS_KEY) === '1') {
  enterApp();
  showOnboarding();
} else {
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
  });
}
