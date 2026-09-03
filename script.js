// Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ---------- тема из Telegram ----------
function applyTheme() {
  const scheme = tg.colorScheme || 'dark';
  document.body.classList.toggle('light', scheme === 'light');
}
applyTheme();
tg.onEvent('themeChanged', applyTheme);

// ---------- состояние ----------
let ALL = [];                       // все фильмы
let view = 'grid';                  // grid | fav | detail | game
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
  if (!r) return '⭐ —';
  return r >= 9 ? '<span class="badge-top">🔥 ⭐ ' + r + ' КП</span>' : '⭐ ' + m.rating + ' КП';
};

function posterHtml(m) {
  return `<div class="poster-wrap">
    ${m.poster
      ? `<img src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy"
           onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>`
      : `<div class="poster-placeholder"><span>🎬</span><em>${esc(m.title)}</em></div>`}
    <span class="code-badge">🔑 ${esc(m.code)}</span>
    ${getFavs().includes(m.code) ? '<span class="fav-badge">❤️</span>' : ''}
  </div>`;
}

// ---------- загрузка ----------
async function loadMovies() {
  try {
    const r = await fetch('./data/movies.json');
    ALL = await r.json();
    renderGrid();
  } catch (e) {
    document.getElementById('movies-container').innerHTML =
      '<p class="error">Не удалось загрузить афишу 😔</p>';
  }
}

// ---------- сетка (афиша + моё) ----------
function renderGrid() {
  const q = (document.getElementById('search').value || '').trim().toLowerCase();
  const sort = document.getElementById('sort').value;
  let list = view === 'fav' ? ALL.filter(m => getFavs().includes(m.code)) : [...ALL];
  if (q) list = list.filter(m => (m.title || '').toLowerCase().includes(q));
  list.sort((a, b) =>
    sort === 'rating' ? (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0) :
    sort === 'code' ? (+a.code || 0) - (+b.code || 0) :
    (a.title || '').localeCompare(b.title || '', 'ru')
  );
  const c = document.getElementById('movies-container');
  if (!list.length) {
    c.innerHTML = `<p class="error">${view === 'fav' ? 'Список пуст — добавляйте фильмы сердечком ❤️' : 'Ничего не нашлось 🤷'}</p>`;
    return;
  }
  c.innerHTML = list.map(m => `
    <div class="movie-card" data-code="${esc(m.code)}">
      ${posterHtml(m)}
      <div class="movie-info">
        <h3>${esc(m.title)}</h3>
        <span class="rating">${ratingBadge(m)}</span>
      </div>
    </div>`).join('');
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
          <button class="btn-secondary" id="btn-share">📤 Поделиться с другом</button>
        </div>
      </div>
    </div>`;
  document.getElementById('btn-back').onclick = () => { view = 'grid'; showView('catalog'); renderGrid(); };
  document.getElementById('btn-open').onclick =
    () => tg.sendData(JSON.stringify({ action: 'open_movie', code }));
  document.getElementById('btn-fav').onclick = () => { toggleFav(code); openDetail(code); };
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
  document.getElementById('view-detail').classList.toggle('hidden', name !== 'detail');
  document.getElementById('view-game').classList.toggle('hidden', name !== 'game');
  document.getElementById('toolbar').classList.toggle('hidden', name !== 'catalog');
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.view === name || (name === 'catalog' && t.dataset.view === view)));
}

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  view = t.dataset.view;
  if (view === 'game') { showView('game'); startGame(); }
  else { showView('catalog'); renderGrid(); }
}));

document.getElementById('search').addEventListener('input', renderGrid);
document.getElementById('sort').addEventListener('change', renderGrid);

// ---------- старт ----------
loadMovies();