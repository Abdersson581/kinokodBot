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
  initHideToggle();
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
const getFavs = () => JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
const setFavs = (a) => localStorage.setItem(FAV_KEY, JSON.stringify([...a]));
const toggleFav = (code) => {
  const f = new Set(getFavs());
  f.has(code) ? f.delete(code) : f.add(code);
  setFavs(f);
  haptic(f.has(code) ? 'ok' : 'light');
};

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

function posterHtml(m) {
  return `<div class="poster-wrap">
    ${m.poster
      ? `<img src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy"
           onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>`
      : `<div class="poster-placeholder"><span>🎬</span><em>${esc(m.title)}</em></div>`}
    <span class="code-badge">🔑 ${esc(m.code)}</span>
    ${isNew(m) ? '<span class="new-badge">🔥 Новинка</span>' : ''}
    ${getFavs().includes(m.code) ? '<span class="fav-badge">❤️</span>' : ''}
  </div>`;
}

// ---------- загрузка ----------
async function loadMovies() {
  try {
    const [r, rc, rm] = await Promise.all([
      fetch('./data/movies.json'),
      fetch('./data/collections.json').catch(() => null),
      fetch('./data/meta.json').catch(() => null)
    ]);
    ALL = await r.json();
    COLLS = rc ? await rc.json() : [];
    const meta = rm ? await rm.json() : {};
    EMOJI_RIDDLES = Array.isArray(meta.emoji_riddles) ? meta.emoji_riddles : [];
    NEWS = Array.isArray(meta.recent_news) ? meta.recent_news : [];
    LEADERBOARD = Array.isArray(meta.leaderboard) ? meta.leaderboard : [];
    LEADERBOARD_KIND = meta.leaderboard_kind === 'total' ? 'total' : 'week';
    updateSubtitle();
    renderGenreChips();
    showCodeDay(meta);
    renderHero();
    renderGrid();
    // Бейдж новых достижений на кнопке «Ещё» + восстановление последнего
    // открытого раздела (пусто/«grid» — обычная афиша).
    updateMoreBadge();
    let saved = null;
    try { saved = localStorage.getItem(LAST_VIEW_KEY); } catch (e) {}
    if (saved && saved !== 'grid') openView(saved);
  } catch (e) {
    document.getElementById('movies-container').innerHTML =
      '<p class="error">Не удалось загрузить афишу 😔</p>';
  }
}

// ---------- скелетоны (заглушки до загрузки данных) ----------
function renderSkeletons() {
  const c = document.getElementById('movies-container');
  c.innerHTML = Array.from({ length: 8 }, () =>
    '<div class="movie-card skeleton-card"><div class="skel poster"></div><div class="skel line"></div><div class="skel line short"></div></div>'
  ).join('');
}
renderSkeletons();

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
      <img src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy"/>
      <span class="hero-rank">#${i + 1}</span>
      <div class="hero-overlay">
        <h3>${esc(m.title)}</h3>
        ${ratingBadge(m)}
      </div>
    </div>`).join('');
  shelf.classList.remove('hidden');
  shelf.querySelectorAll('.hero-card').forEach(el =>
    el.addEventListener('click', () => openDetail(el.dataset.code)));
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
  if (!PROFILE) {
    c.innerHTML = `
      <div class="profile-card">
        <div class="pf-ava">👤</div>
        <h2>Мой профиль</h2>
        <p class="pf-hint">Уровень, кинобаллы и стрик хранятся в боте.<br/>
        Синхронизируй — и они появятся здесь.</p>
        <button class="btn-primary" id="pf-sync">🔁 Синхронизировать с ботом</button>
      </div>`;
    document.getElementById('pf-sync').onclick = () => sendOrDeepLink({ action: 'sync_unlocked' });
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
        <div class="pf-stat"><b>${rank ? '🏆 №' + rank : '🏆 —'}</b><span>${rank ? 'в общем топе' : 'ещё не в топе'}</span></div>
      </div>
      ${achBlock}
      ${favouriteGenre() ? `<div class="pf-favgenre">🌟 Любимый жанр: <b>${esc(favouriteGenre())}</b></div>` : ''}
      ${wgBlock}
      ${optBlock}
      <div class="pf-actions">
        <button class="btn-secondary" id="pf-sync2">🔁 Обновить</button>
        <button class="btn-secondary" id="pf-bot">🏅 Профиль в боте</button>
      </div>
    </div>`;
  document.getElementById('pf-sync2').onclick = () => sendOrDeepLink({ action: 'sync_unlocked' });
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
    renderTrailerGenreChips();
    renderTrailers();
  }));
}

function renderTrailers() {
  const c = document.getElementById('trailers-container');
  if (!c) return;
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
  c.innerHTML = `<div class="trailers-grid">${list.map(m => `
    <div class="trailer-card" data-code="${esc(m.code)}">
      <div class="trailer-thumb">
        ${m.poster ? `<img src="${esc(m.poster)}" alt="" loading="lazy" onerror="this.style.display='none'"/>`
          : `<div class="trailer-thumb-ph">🎬</div>`}
        <span class="trailer-play">▶️</span>
        ${m.trailer_file_id ? '<span class="trailer-local">📥</span>' : ''}
      </div>
      <div class="trailer-info">
        <h3>${esc(m.title)}</h3>
        <div class="trailer-meta">
          ${m.year ? `<span>📅 ${esc(String(m.year))}</span>` : ''}
          ${m.rating ? `<span>⭐ ${esc(String(m.rating))}</span>` : ''}
        </div>
      </div>
    </div>`).join('')}</div>`;
  c.querySelectorAll('.trailer-card').forEach(el => {
    el.addEventListener('click', () => {
      const m = ALL.find(x => x.code === el.dataset.code);
      if (m) openTrailer(m);
    });
  });
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
function updateMoreBadge() {
  const moreTab = document.getElementById('tab-more');
  if (!moreTab) return;
  let done = 0;
  try { done = computeAchCards().filter(a => a.done).length; } catch (e) { return; }
  const seen = parseInt(localStorage.getItem(ACH_SEEN_KEY), 10) || 0;
  moreTab.classList.toggle('has-badge', done > seen);
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
}

// ---------- бэкап «Моё» через бота ----------
function backupFavsNotice() {
  const favs = getFavs();
  if (favs.length < 2) return ''; // маленький список ни к чему не гонять
  return `
    <div class="cols-list">
      <div class="col-card backup-card">
        <div class="col-body">
          <h3>${favs.length > 0 ? `💾 «Моё» хранится локально (${favs.length})` : ''}</h3>
          <p>Сохрани список в боте — не потеряется при переустановке.</p>
        </div>
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

function renderGrid() {
  const qRaw = (document.getElementById('search').value || '').trim();
  const q = qRaw.toLowerCase();
  const sort = document.getElementById('sort').value;
  let list = view === 'fav' ? ALL.filter(m => getFavs().includes(m.code)) : [...ALL];
  if (activeGenre) list = list.filter(m => (m.genres || []).includes(activeGenre));
  // 🙈 «Скрыть разгаданные»: прячем карточки, код которых есть в localStorage
  if (localStorage.getItem(HIDE_KEY) === '1' && view !== 'fav') {
    const unlockedSet = new Set(getUnlocked());
    if (unlockedSet.size) list = list.filter(m => !unlockedSet.has(String(m.code)));
  }
  if (q) {
    const digits = q.replace(/\D/g, '');
    list = list.filter(m =>
      (m.title || '').toLowerCase().includes(q) ||
      (digits && String(m.code || '').includes(digits))
    );
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
  if (!list.length) {
    c.innerHTML = `<p class="error">${view === 'fav' ? 'Список пуст — добавляйте фильмы сердечком ❤️' : 'Ничего не нашлось 🤷'}</p>`;
    return;
  }
  const backup = view === 'fav' ? backupFavsNotice() : '';
  c.innerHTML = backup + list.map(m => `
    <div class="movie-card" data-code="${esc(m.code)}">
      ${posterHtml(m)}
      <div class="movie-info">
        <h3>${hlTitle(m.title, q)}</h3>
        <span class="rating">${ratingBadge(m)}</span>
      </div>
    </div>`).join('');
  const b = document.getElementById('btn-backup');
  if (b) b.onclick = () => sendOrDeepLink({ action: 'save_favs', codes: getFavs() });
  // каскадное появление карточек
  Array.from(c.children).forEach((el, i) => {
    el.style.animationDelay = (Math.min(i, 24) * 0.03) + 's';
  });
  c.querySelectorAll('.movie-card').forEach(el =>
    el.addEventListener('click', () => openDetail(el.dataset.code)));
}
// ---------- карточка фильма ----------
function openDetail(code) {
  const m = ALL.find(x => x.code === code);
  if (!m) return;
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
        ${chips ? `<div class="detail-chips">${chips}</div>` : ''}
        <p class="desc">${esc(m.description || 'Описание скоро появится.')}</p>
        <div class="detail-actions">
          <button class="btn-primary" id="btn-open">🔓 Открыть код</button>
          ${m.trailer_mp4 || m.trailer_yt || m.trailer_file_id ? '<button class="btn-secondary" id="btn-trailer">▶️ Трейлер</button>' : ''}
          <button class="btn-fav ${fav ? 'active' : ''}" id="btn-fav">${fav ? '❤️ В «Моём»' : '🤍 Хочу посмотреть'}</button>
          <button class="btn-secondary" id="btn-copy">📎 Скопировать код</button>
          <button class="btn-secondary" id="btn-rate">🌟 Оценить</button>
          <button class="btn-secondary" id="btn-review">✍️ Отзыв</button>
          <button class="btn-secondary" id="btn-remind">🔔 Напомнить через час</button>
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
                ? `<img src="${esc(s.poster)}" alt="${esc(s.title)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>`
                : `<div class="poster-placeholder similar-ph"><span>🎬</span></div>`}
            </div>
            <div class="similar-name">${esc(s.title)}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}`;
  document.getElementById('btn-back').onclick = () => { view = 'grid'; showView('catalog'); renderGrid(); };
  document.getElementById('btn-open').onclick =
    () => sendOrDeepLink({ action: 'open_movie', code });
  document.getElementById('btn-fav').onclick = () => { toggleFav(code); openDetail(code); };
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
  document.getElementById('btn-rate').onclick = () =>
    sendOrDeepLink({ action: 'rate_movie', code });
  document.getElementById('btn-review').onclick = () =>
    sendOrDeepLink({ action: 'review_movie', code });
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
  toggle('toolbar', name === 'catalog' || name === 'trailers');
  const cur = name === 'catalog' ? view : name;
  document.querySelectorAll('.tab[data-view]').forEach(t =>
    t.classList.toggle('active', t.dataset.view === cur));
  const moreTab = document.getElementById('tab-more');
  if (moreTab) moreTab.classList.toggle('active',
    ['cols', 'top', 'achievements', 'profile', 'fav', 'game'].includes(cur));
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
  else { showView('catalog'); renderGrid(); }  // grid | fav
}
document.querySelectorAll('.tab[data-view]').forEach(t => t.addEventListener('click', () => openView(t.dataset.view)));

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

// ---------- поиск/сортировка трейлеров ----------
document.getElementById('trailer-search').addEventListener('input', () => {
  clearTimeout(_trailerSearchTimer);
  if (trailerGenre) { trailerGenre = ''; renderTrailerGenreChips(); }
  _trailerSearchTimer = setTimeout(renderTrailers, 180);
});
document.getElementById('trailer-sort').addEventListener('change', renderTrailers);

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

// 🎬 «Мой Киногод» — диплинк в бота через sendOrDeepLink: приложение
// сворачивается (tg.close), и в чате с ботом сразу видна карточка «Киногод».
document.getElementById('btn-kinogod').addEventListener('click', () => {
  sendOrDeepLink({ action: 'kinogod' });
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
  if (!m.trailer_yt && !m.trailer_file_id) {
    return;
  }
  haptic('light');
  if (m.trailer_file_id) {
    // Трейлер хранится в Telegram — открываем в боте (приложение само свернётся).
    // Действие называется 'trailer_movie' — ровно как в маппинге sendOrDeepLink
    // (раньше тут было 'trailer', маппинг не совпадал, и вместо видео уходил
    // фолбэк ?start=afisha — трейлер «не открывался»).
    sendOrDeepLink({ action: 'trailer_movie', code: m.code });
    return;
  }
  // Fallback: YouTube embed на весь экран
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
