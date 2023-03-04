const gameSelectHtml = document.getElementById('game-select');
const mapListHtml = document.getElementById('map-list');

async function setMaps(gameId) {
  const { maps } = await fetch('/api/games/' + gameId).then((res) =>
    res.json(),
  );
  const mapHtml = [];
  for (const map of maps) {
    mapHtml.push(`
    <li class="list-group-item container">
        ${map.name}
        <button class="btn" onclick="removeMap(${map.id})">X</button>
    </li>`);
  }

  mapListHtml.innerHTML = mapHtml.join('');
}

async function setGames() {
  const games = await fetch('/api/games').then((res) => res.json());
  let gameHtml = [
    '<option disabled selected value="">Select a game to see its maps</option>',
  ];
  for (const game of games) {
    gameHtml.push(`<option value="${game.id}">${game.name}</option>`);
  }

  gameSelectHtml.innerHTML = gameHtml.join('');
}

async function removeMap(id) {
  const doContinue = confirm('Delete map?');
  if (!doContinue) return;
  const response = await fetch('/api/maps/' + id, {
    method: 'DELETE',
  });

  setMaps(gameSelectHtml.value);
  if (response.ok) alert('Map deleted');
  else alert('Error deleting the map');
}

async function createMap(gameId) {
  if (gameId === '') {
    alert('Select a game');
    return;
  }

  const mapName = await prompt('Enter the map name');
  if (!mapName || mapName.trim() === '') return;

  const response = await fetch('/api/maps/', {
    method: 'POST',
    headers: {
      'Content-type': 'application/json',
    },
    body: JSON.stringify({ name: mapName, gameId: parseInt(gameId) }),
  });

  setMaps(gameSelectHtml.value);
  if (response.ok) alert('Map created');
  else alert('Error creating the map: ' + (await response.json()).message);
}

setGames();
