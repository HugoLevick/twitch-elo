const gameListHtml = document.getElementById('game-list');

async function setGames() {
  const games = await fetch('/api/games').then((res) => res.json());
  let gameHtml = [];
  for (const game of games) {
    gameHtml.push(
      `<li class="list-group-item">
        ${game.name}
        <button class="btn" onClick="deleteGame(${game.id})">X</button>
    </li> `,
    );
  }

  gameListHtml.innerHTML = gameHtml.join('');
}

async function deleteGame(id) {
  const doContinue = confirm('Delete game?');
  if (!doContinue) return;
  const response = await fetch('/api/games/' + id, {
    method: 'DELETE',
  });

  setGames();
  if (response.ok) alert('Game deleted');
  else alert('Error deleting the game');
}

async function createGame() {
  const gameName = await prompt('Enter the game name');
  if (!gameName || gameName.trim() === '') return;

  const response = await fetch('/api/games/', {
    method: 'POST',
    headers: {
      'Content-type': 'application/json',
    },
    body: JSON.stringify({ name: gameName }),
  });

  setGames();
  if (response.ok) alert('Game created');
  else alert('Error creating the game');
}

setGames();
