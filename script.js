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
    tg.sendData(JSON.stringify({ action: 'access_check' }));
  document.getElementById('btn-gate-skip').onclick = enterApp;
}
function enterApp() {
  localStorage.setItem(ACCESS_KEY, '1');
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadMovies();
}
if (localStorage.getItem(ACCESS_KEY)) enterApp(); else showGate();

// ---------- тема из Telegram ----------
function applyTheme() {
  const scheme = tg.colorScheme || 'dark';
  document.body.classList.toggle('light', scheme === 'light');
}
applyTheme();
tg.onEvent('themeChanged', applyTheme);

// ---------- состояние ----------
let ALL = [];                       // все фильмы
let COLLS = [];                     // подборки
let view = 'grid';                  // grid | cols | cols-detail | fav | detail | game
const FAV_KEY = 'kinoafisha_favs';
const getFavs = () => JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
const setFavs = (a) => localStorage.setItem(FAV_KEY, JSON.stringify([...a]));
const toggleFav = (code) => {
  const f = new Set(getFavs());
  f.has(code) ? f.delete(code) : f.add(code);
  setFavs(f);
};

// ---------- утилиты ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

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
    showCodeDay(meta);
    renderHero();
    renderGrid();
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
    </div>`;
  banner.classList.remove('hidden');
  document.getElementById('btn-cod-open').onclick = () => openDetail(code);
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
function renderGrid() {
  const q = (document.getElementById('search').value || '').trim().toLowerCase();
  const sort = document.getElementById('sort').value;
  let list = view === 'fav' ? ALL.filter(m => getFavs().includes(m.code)) : [...ALL];
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
        <h3>${esc(m.title)}</h3>
        <span class="rating">${ratingBadge(m)}</span>
      </div>
    </div>`).join('');
  const b = document.getElementById('btn-backup');
  if (b) b.onclick = () => tg.sendData(JSON.stringify({ action: 'save_favs', codes: getFavs() }));
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
  document.getElementById('view-detail').innerHTML = `
    <button class="btn-back" id="btn-back">◀️ Назад</button>
    <div class="detail">
      ${posterHtml(m)}
      <div class="detail-info">
        <h2>${esc(m.title)}</h2>
        <span class="rating">${ratingBadge(m)}</span>
        <p class="desc">${esc(m.description || 'Описание скоро появится.')}</p>
        <div class="detail-actions">
          <button class="btn-primary" id="btn-open">🔓 Открыть код</button>
          <button class="btn-fav ${fav ? 'active' : ''}" id="btn-fav">${fav ? '❤️ В «Моём»' : '🤍 Хочу посмотреть'}</button>
          <button class="btn-secondary" id="btn-copy">📎 Скопировать код</button>
          <button class="btn-secondary" id="btn-remind">🔔 Напомнить через час</button>
          <button class="btn-secondary" id="btn-share">📤 Поделиться с другом</button>
        </div>
      </div>
    </div>`;
  document.getElementById('btn-back').onclick = () => { view = 'grid'; showView('catalog'); renderGrid(); };
  document.getElementById('btn-open').onclick =
    () => tg.sendData(JSON.stringify({ action: 'open_movie', code }));
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
    tg.sendData(JSON.stringify({ action: 'remind_movie', code }));
  document.getElementById('btn-share').onclick = () => {
    const text = `🎬 «${m.title}» — рейтинг ${m.rating || '—'} на КП! Угадай фильм по коду в боте «Капитан Кино» 🎲`;
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent('https://t.me/kapitan_kino_bot')}&text=${encodeURIComponent(text)}`);
  };
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
    tg.sendData(JSON.stringify({ action: 'quiz_result', correct, total: rounds.length }));
  document.getElementById('btn-again').onclick = startGame;
  document.getElementById('btn-game-back2').onclick = () => { view = 'grid'; showView('catalog'); renderGrid(); };
}

// ---------- вкладки и показ ----------
function showView(name) {
  document.getElementById('view-catalog').classList.toggle('hidden', name !== 'catalog');
  document.getElementById('view-cols').classList.toggle('hidden', name !== 'cols');
  document.getElementById('view-detail').classList.toggle('hidden', name !== 'detail');
  document.getElementById('view-game').classList.toggle('hidden', name !== 'game');
  document.getElementById('toolbar').classList.toggle('hidden', name !== 'catalog');
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.view === name || (name === 'catalog' && t.dataset.view === view)));
}

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  view = t.dataset.view;
  if (view === 'game') { showView('game'); startGame(); }
  else if (view === 'cols') { showView('cols'); renderCols(); }
  else { showView('catalog'); renderGrid(); }
}));

document.getElementById('search').addEventListener('input', renderGrid);
document.getElementById('sort').addEventListener('change', renderGrid);

// 🎲 «Мне повезёт» — случайный фильм
document.getElementById('btn-lucky').addEventListener('click', () => {
  if (!ALL.length) return;
  const m = ALL[Math.floor(Math.random() * ALL.length)];
  openDetail(m.code);
});