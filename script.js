// Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.MainButton.show();

// Загрузка фильмов
async function loadMovies() {
  try {
    const response = await fetch('./data/movies.json');
    const movies = await response.json();
    renderMovies(movies);
  } catch (e) {
    console.error('Ошибка загрузки:', e);
    document.getElementById('movies-container').innerHTML = '<p>Загрузка...</p>';
  }
}

// Рендер карточек
function renderMovies(movies) {
  const container = document.getElementById('movies-container');
  container.innerHTML = movies.map(movie => `
    <div class="movie-card" onclick="openMovie('${movie.code}')">
      <img src="${movie.poster_url || 'placeholder.jpg'}" alt="${movie.title}" />
      <div class="movie-info">
        <h3>${movie.title}</h3>
        <span class="year">${movie.year || ''}</span>
        <span class="rating">⭐ ${movie.rating || '-'}</span>
        <div class="genres">${(movie.genres || []).slice(0, 2).join(', ')}</div>
        <div class="code">Код: ${movie.code}</div>
      </div>
    </div>
  `).join('');
}

// Открытие фильма через deep link
function openMovie(code) {
  tg.openLink(`https://t.me/kapitan_kino_bot/kinokodapp?startapp=movie_${code}`);
}

// Инициализация
loadMovies();