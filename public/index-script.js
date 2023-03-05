let options;
const bottedChannelHtml = document.getElementById('bottedChannel');
const playersPerTeamHtml = document.getElementById('playersPerTeam');
const pickOrderHtml = document.getElementById('pickOrder');
const voteTimeoutHtml = document.getElementById('voteTimeout');
const pickTimeoutHtml = document.getElementById('pickTimeout');
const gameSelect = document.getElementById('gameId');
const settingsForm = document.getElementById('settings-form');
const requireVoteHtml = document.getElementById('requireVote');
const stackMatchesHtml = document.getElementById('stackMatches');

async function setSettings() {
  options = await fetch('/api/config')
    .then((res) => res.json())
    .then((options) => {
      bottedChannelHtml.value = options.bottedChannel;
      playersPerTeamHtml.value = options.playersPerTeam;
      pickOrderHtml.value = options.pickOrder;
      voteTimeoutHtml.value = options.cancelVoteTimeout;
      pickTimeoutHtml.value = options.cancelPickTimeout;
      requireVoteHtml.checked = options.requireVotePhase;
      stackMatchesHtml.checked = options.stackMatches;
      return options;
    });

  games = await fetch('/api/games/')
    .then((res) => res.json())
    .then((games) => {
      let gameSelectHtml = [
        '<option disabled value="0">Select a game</option>',
      ];
      for (const game of games) {
        gameSelectHtml.push(
          `<option ${game.id == options.gameId ? 'selected' : ''} value=${
            game.id
          }>${game.name}</option>`,
        );
      }
      gameSelect.innerHTML = gameSelectHtml.join();
    });

  settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const doContinue = await confirm(
      'This will cancel all the matches in progress and reset the queue, continue?',
    );

    if (!doContinue) return;

    console.log(parseInt(gameSelect.value));
    const newOptions = {
      bottedChannel: bottedChannelHtml.value,
      pickOrder: pickOrderHtml.value,
      playersPerTeam: parseInt(playersPerTeamHtml.value),
      gameId: parseInt(gameSelect.value),
      cancelVoteTimeout: parseInt(voteTimeoutHtml.value),
      cancelPickTimeout: parseInt(pickTimeoutHtml.value),
      requireVotePhase: requireVoteHtml.checked,
      stackMatches: stackMatchesHtml.checked,
    };

    const response = await fetch('/api/config/update', {
      method: 'PUT',
      headers: {
        'Content-type': 'application/json',
      },
      body: JSON.stringify(newOptions),
    }).then((res) => res.json());

    if (response === true) alert('Changes have been applied');
    else alert(response.message);
  });
}

setSettings();
