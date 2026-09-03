// Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Загрузка фильмов
async function loadMovies() {
  try {
    const response = await fetch('./data/movies.json');
    const movies = await response.json();
    renderMovies(movies);
  } catch (e) {
    console.error('Ошибка загрузки:', e);
    document.getElementById('movies-container').innerHTML =
      '<p class="error">Не удалось загрузить афишу 😔</p>';
  }
}

// Рендер карточек
function renderMovies(movies) {
  const container = document.getElementById('movies-container');
  container.innerHTML = movies.map(movie => `
    <div class="movie-card" onclick="openMovie('${movie.code}')">
      <div class="poster-wrap">
        <img src="${movie.poster || ''}" alt="${movie.title}" loading="lazy"
             onerror="this.style.display='none';this.parentElement.classList.add('no-poster')"/>
        <span class="code-badge">🔑 ${movie.code}</span>
      </div>
      <div class="movie-info">
        <h3>${movie.title}</h3>
        <span class="rating">⭐ ${movie.rating || '—'} КП</span>
      </div>
    </div>
  `).join('');
}

// Открытие фильма: код автоматически уходит боту,
// бот сам пришлёт карточку фильма (с проверкой подписки, как обычно)
function openMovie(code) {
  tg.sendData(JSON.stringify({ action: "open_movie", code: code }));
}

// Инициализация
loadMovies();