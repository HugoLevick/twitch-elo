import { Injectable, Logger } from '@nestjs/common';
import { UpdateMatchDto } from './dto/update-match.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Match, MatchStatuses } from './entities/match.entity';
import { Equal, Repository } from 'typeorm';
import { PlayersService } from '../players/players.service';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common/exceptions';
import { CommonService } from '../common/common.service';
import { ConflictException } from '@nestjs/common/exceptions/conflict.exception';
import { TmiService } from '../tmi/tmi.service';
import { MapsService } from '../maps/maps.service';
import { GameMap } from '../maps/entities/map.entity';
import { MatchesTeamsEnum, MatchTeams } from './entities/matches-teams.entity';
import { Player } from '../players/entities/player.entity';
import { OnModuleInit } from '@nestjs/common/interfaces';
import { AddDevDto } from './dto/add-dev.dto';
const EloRank = require('elo-rank');

interface Votes {
  [mapId: number]: number;
}

interface Voting {
  [matchdId: number]: {
    match: Match;
    maps: { voteId: number; map: GameMap }[];
    haveVoted: Player[];
    votes: Votes;
    timer: NodeJS.Timeout;
  };
}

interface Picks {
  [matchId: number]: {
    available: Player[];
    pickTurn: number;
    timer: NodeJS.Timeout;
  };
}

interface Subs {
  [username: string]: {
    matchId: number;
    player: Player;
  };
}

@Injectable()
export class MatchesService implements OnModuleInit {
  //! Add to cancelMatch, cancelAllActive when adding a property
  private logger = new Logger('MatchesService');
  //Object that stores voting phase info
  private mapVoting: Voting = {};
  //Object that stores pick phase info
  private matchPicks: Picks = {};
  //Object that stores subme info
  private lookingForSub: Subs = {};
  //Object that stores capme info
  private lookingForCap: Subs = {};
  //Elo algo
  private eloRank = new EloRank(30);
  //Saves staggered matches if enabled
  private pendingMatches: Match[] = [];
  //Helper for staggered matches
  private usingChat: boolean = false;

  constructor(
    private readonly tmiService: TmiService,

    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,

    @InjectRepository(MatchTeams)
    private readonly matchTeamsRepository: Repository<MatchTeams>,

    private readonly playersService: PlayersService,

    private readonly mapsService: MapsService,

    private readonly commonService: CommonService,
  ) {}

  async onModuleInit() {
    const previousMatches = await this.matchesRepository
      .createQueryBuilder('matches')
      .where(
        'matches.status IN("IN_PROGRESS","QUEUEING") AND matches.deletedAt IS NULL',
      )
      .getMany();

    for (const match of previousMatches) {
      try {
        await this.remove(match.id);
      } catch (error) {
        this.logger.error(error.message);
      }
    }
  }

  async cancelAllActive() {
    await this.matchesRepository
      .createQueryBuilder('match')
      .softDelete()
      .where('match.status="IN_PROGRESS" OR match.status="QUEUEING"')
      .execute();
    const voteKeys = Object.keys(this.mapVoting).map((e) => parseInt(e));
    const pickKeys = Object.keys(this.matchPicks).map((e) => parseInt(e));

    //Clear timeout so they dont trigger later
    for (const key of voteKeys) {
      clearTimeout(this.mapVoting[key].timer);
    }
    for (const key of pickKeys) {
      clearTimeout(this.matchPicks[key].timer);
    }
    this.matchPicks = {};
    this.mapVoting = {};
    this.lookingForCap = {};
    this.lookingForSub = {};
    this.pendingMatches = [];
    this.usingChat = false;
    return true;
  }

  async create() {
    const match = this.matchesRepository.create({ players: [] });
    await this.matchesRepository.save(match);
    return match;
  }

  async devAddPlayers(addDevDto: AddDevDto) {
    const { players, skipVote } = addDevDto;
    let match: Match;
    for (const username of players) {
      match = await this.tmiService.addToQueue(username);
    }

    if (addDevDto.skipVote) {
      setTimeout(async () => {
        try {
          if (this.mapVoting[match.id])
            clearTimeout(this.mapVoting[match.id].timer);
          if (skipVote) await this.decideMap(match.id);
          await this.startPickPhase(match.id);
        } catch (error) {
          this.logger.error(`Dev failed: ${error}`);
        }
      }, 10000);
    }
  }

  findAll() {
    return `This action returns all matches`;
  }

  async findOne(id: number) {
    const match = await this.matchesRepository.findOneBy({ id });
    if (!match) throw new Error(`Match ${id} not found`);
    return match;
  }

  async findLatest() {
    const [match] = await this.matchesRepository.find({
      where: { status: Equal(MatchStatuses.queueing) },
      order: { id: 'DESC' },
      take: 1,
    });
    return match;
  }

  async findPlaying(playerId: number) {
    const match = await this.matchesRepository
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.players', 'players')
      .where('players.id=:id AND match.status="IN_PROGRESS"', {
        id: playerId,
      })
      .getOne();
    if (!match)
      throw new Error(`Player ${playerId} was not in a match in progress`);
    return match.id;
  }

  update(id: number, updateMatchDto: UpdateMatchDto) {
    return `This action updates a #${id} match`;
  }

  async remove(id: number) {
    const match = await this.matchesRepository.findOne({
      where: {
        id: Equal(id),
        deletedAt: null,
      },
    });
    if (!match) throw new Error(`Match #${id} not found or already canceled`);
    await this.matchesRepository.softDelete({ id });
    return true;
  }

  async addPlayerToQueue(username: string) {
    const playersPerTeam = this.commonService.options.playersPerTeam;
    const player = await this.playersService.findOrCreate(username);
    const inMatch = await this.matchesRepository
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.players', 'players')
      .where('players.id=:id AND match.status IN("IN_PROGRESS", "QUEUEING")', {
        id: player.id,
      })
      .getOne();

    let match = await this.findLatest();
    if (!match) match = await this.create();

    if (inMatch)
      throw new BadRequestException(`${username} is already in a match`);

    if (match.players.length >= playersPerTeam * 2)
      throw new ConflictException(`Queue ${match.id} is full`);

    match.players.push(player);
    await this.matchesRepository.save(match);

    if (match.players.length === playersPerTeam * 2)
      await this.startMatch(match);

    return match;
  }

  async removePlayerFromQueue(username: string) {
    const playersPerTeam = this.commonService.options.playersPerTeam;
    const player = await this.playersService.findOne(username);
    let match = await this.findLatest();
    if (!match) throw new NotFoundException('There is no latest match');

    const indexToDelete = match.players.findIndex((p) => p.id === player.id);
    if (indexToDelete === -1)
      throw new Error(username + ' was not in the queue');

    match.players.splice(indexToDelete, 1);

    await this.matchesRepository.save(match);

    return match;
  }

  //Sets the match status to In Progress, chooses captains, creates empty teams (only captains), and starts voting timer if options is set to it
  async startMatch(match: Match) {
    const { bottedChannel, requireVotePhase, stackMatches } =
      this.commonService.options;

    let teamA: MatchTeams, teamB: MatchTeams;
    match.status = MatchStatuses.inProgress;

    const playerUsernames = match.players.map((p) => p.username);

    if (!match.teams?.length) {
      //If match doesnt already have teams, create them. A match can already have teams if its a pending match from the queue
      const sortedPlayers = match.players.sort((a, b) => {
        if (a.points < b.points) return 1;
        else if (a.points > b.points) return -1;
        else return 0;
      });

      const CaptainB = sortedPlayers[0];
      const CaptainA = sortedPlayers[1];

      if (!CaptainA || !CaptainB) {
        this.logger.error(
          'There was an error selecting captains, ' + sortedPlayers,
          match,
        );
        await this.cancelMatch(
          match.id,
          'There was an error selecting captains',
        );
        return;
      }

      teamA = this.matchTeamsRepository.create({
        match,
        captain: CaptainA,
        players: [CaptainA],
        letter: MatchesTeamsEnum.a,
      });

      teamB = this.matchTeamsRepository.create({
        match,
        captain: CaptainB,
        players: [CaptainB],
        letter: MatchesTeamsEnum.b,
      });
      await this.matchTeamsRepository.save([teamA, teamB]);
      match.teams = [teamA, teamB];

      try {
        await this.matchesRepository.save(match);
      } catch (error) {
        console.log(error);
        throw error;
      }
    } else {
      [teamA] = match.teams.filter((t) => t.letter === 'A');
      [teamB] = match.teams.filter((t) => t.letter === 'B');
    }

    if ((!this.usingChat && stackMatches) || !stackMatches) {
      //If stackmatches is active, this can only happen when the chat is free, otherwise it will always happen

      this.usingChat = true;
      //prettier-ignore
      let message = `${playerUsernames.map((p) => `@${p}`).join(', ')} match #${match.id} is ready!`;
      await this.tmiService.say(bottedChannel, message);

      this.tmiService.say(
        bottedChannel,
        `#${match.id} captains: ${teamA.captain.username}(A) | ${teamB.captain.username}(B) use !capme to look for a captain`,
      );

      //If requires a vote phase, start it. otherwise select a random map
      if (requireVotePhase) await this.startVotingPhase(match);
      else await this.selectRandomMap(match);
    } else if (this.usingChat && stackMatches) {
      //If chat is busy then add the match to the pending queue
      //prettier-ignore
      let message = `${playerUsernames.map((p) => `@${p}`).join(', ')} match #${match.id} is pending! It will start when the current match ends the pick phase`;
      this.tmiService.say(
        bottedChannel,
        `#${match.id} captains: ${teamA.captain.username}(A) | ${teamB.captain.username}(B)`,
      );
      await this.tmiService.say(bottedChannel, message);
      this.pendingMatches.push(match);
    }
  }

  async startNextMatch() {
    this.usingChat = false;
    const nextMatch = this.pendingMatches.shift();
    if (nextMatch) await this.startMatch(nextMatch);
  }

  async startVotingPhase(match: Match) {
    const { gameId, bottedChannel, cancelVoteTimeout } =
      this.commonService.options;
    //Voting

    let message = 'Vote for a map with !vote (number)';
    //prettier-ignore
    await this.tmiService.say(bottedChannel, message);

    const maps = await this.mapsService.findGameMaps(gameId);
    if (maps.length === 0) {
      this.cancelMatch(
        match.id,
        `There are no maps to play, please add a map by typing http://localhost:${process.env.PORT} in your browser @${bottedChannel}`,
      );
      throw new Error('Please add at least a map before starting to play');
    }

    let randomMaps: GameMap[] = [];
    const mapQuant = maps.length;

    this.mapVoting[match.id] = {
      match,
      maps: [],
      haveVoted: [],
      votes: {},
      timer: setTimeout(() => {
        this.cancelMatch(match.id, 'Someone took too long to vote');
      }, cancelVoteTimeout * 1000),
    };

    for (let i = 0; i < Math.min(mapQuant, 3); i++) {
      const randomIndex = this.commonService.random(0, maps.length);
      const [randomMap] = maps.splice(randomIndex, 1);
      randomMaps.push(randomMap);

      message = `${i + 1}: ${randomMap.name}`;
      //prettier-ignore
      this.mapVoting[match.id].maps.push({voteId: i+1, map: randomMap})
      await this.tmiService.say(bottedChannel, message);
    }

    await this.tmiService.say(bottedChannel, '4: Omit vote');

    return true;
  }

  async selectRandomMap(match: Match) {}

  async cancelMatch(matchId: number, reason: string) {
    try {
      //Soft delete match
      await this.remove(matchId);
      //Cancel all submes and capmes for the map
      this.cancelSubs(matchId, { subs: true, caps: true });
      //Delete vote and pick info
      const voteTimer = this.mapVoting[matchId]?.timer;
      const pickTimer = this.matchPicks[matchId]?.timer;
      if (voteTimer) clearTimeout(voteTimer);
      delete this.mapVoting[matchId];
      if (pickTimer) clearTimeout(pickTimer);
      delete this.matchPicks[matchId];
      //If the match was pending, remove from queue. Else, start the next match
      const isPending = this.pendingMatches.findIndex((m) => m.id === matchId);

      if (isPending !== -1) {
        this.pendingMatches.splice(isPending, 1);
      } else {
        await this.startNextMatch();
      }

      await this.tmiService.say(
        this.commonService.options.bottedChannel,
        `Match #${matchId} canceled: ${reason}`,
      );
      return true;
    } catch (error) {
      console.log(error);
      this.logger.error(`Error canceling match ${matchId}: ${error.message}`);
      return false;
    }
  }

  //Registers the vote from someone if the match exists in the mapVoting object
  async vote(username: string, mapId: number) {
    const player = await this.playersService.findOne(username);
    let match: Match;
    try {
      const matchId = await this.findPlaying(player.id);
      match = await this.findOne(matchId);
    } catch (error) {
      this.logger.error(error.message);
      return false;
    }

    if (!this.mapVoting[match.id]) {
      throw new Error(`Match #${match.id} isn't in voting phase`);
    }

    if (this.mapVoting[match.id].haveVoted.find((p) => p.id === player.id))
      throw new Error(`${username} already voted`);

    const currentVotes = this.mapVoting[match.id].votes[mapId] ?? 0;

    this.mapVoting[match.id].votes[mapId] = currentVotes + 1;

    this.mapVoting[match.id].haveVoted.push(player);

    if (
      this.mapVoting[match.id].match.players.length ===
      this.mapVoting[match.id].haveVoted.length
    ) {
      clearTimeout(this.mapVoting[match.id].timer);
      try {
        await this.decideMap(match.id);
        await this.startPickPhase(match.id);
        this.cancelSubs(match.id, { caps: true });
      } catch (error) {
        this.logger.error(error.message);
      }
      return false;
    }

    return true;
  }

  //Decides maps provided with this.mapVoting based on votes
  async decideMap(matchId: number) {
    //Decide map
    const match = await this.findOne(matchId);
    const { bottedChannel } = this.commonService.options;

    let mostVoted: { votes: number; voteId: number }[] = [];
    const voteKeys = Object.keys(this.mapVoting[match.id].votes);
    for (const voteKey of voteKeys) {
      const voteId = parseInt(voteKey);
      const votes = this.mapVoting[match.id].votes[voteId];
      if (mostVoted.length === 0) mostVoted.push({ voteId, votes });
      else if (mostVoted[0].votes < votes) mostVoted = [{ voteId, votes }];
      else if (mostVoted[0].votes === votes) mostVoted.push({ voteId, votes });
    }

    let mapWinner: GameMap;
    mostVoted = mostVoted.filter((m) => m.voteId <= 3);
    if (mostVoted.length === 0) {
      const mapsLength = this.mapVoting[match.id].maps.length;
      mapWinner =
        this.mapVoting[match.id].maps[this.commonService.random(0, mapsLength)]
          .map;
    } else {
      //prettier-ignore
      const mapVoteIdWinner = mostVoted[this.commonService.random(0, mostVoted.length)].voteId
      //prettier-ignore
      mapWinner = this.mapVoting[match.id].maps.find((m) => m.voteId == mapVoteIdWinner).map
    }

    await this.tmiService.say(
      bottedChannel,
      `Map ${mapWinner.name} won the vote`,
    );

    match.map = mapWinner;
    await this.matchesRepository.save(match);
    return true;
  }

  //Deletes the match from the mapVoting object and adds the information required to the matchPicks
  async startPickPhase(matchId: number) {
    const match = await this.findOne(matchId);
    delete this.mapVoting[match.id];
    const { cancelPickTimeout, bottedChannel, pickOrder } =
      this.commonService.options;

    const { teamA, teamB } = await this.getMatchTeams(match.id);

    const availablePlayers = match.players.filter(
      (p) => p.id !== teamA.captain.id && p.id !== teamB.captain.id,
    );

    if (availablePlayers.length === 0) {
      this.startPlaying(match, teamA, teamB);
      return;
    }

    //If picks are needed
    this.matchPicks[match.id] = {
      available: availablePlayers,
      pickTurn: 0,
      timer: setTimeout(() => {
        this.cancelMatch(match.id, 'Someone took too long to pick');
      }, cancelPickTimeout * 1000),
    };

    await this.tmiService.say(
      bottedChannel,
      `Team A captain: ${teamA.captain.username}`,
    );

    await this.tmiService.say(
      bottedChannel,
      `Team B captain: ${teamB.captain.username}`,
    );

    await this.tmiService.say(bottedChannel, `Pick order: ${pickOrder}`);

    await this.sayPickTurn(match.id, teamA, teamB, availablePlayers);
  }

  async getMatchTeams(matchId: number) {
    const teamA = await this.matchTeamsRepository.findOne({
      where: {
        match: Equal(matchId),
        letter: MatchesTeamsEnum.a,
      },
    });

    const teamB = await this.matchTeamsRepository.findOne({
      where: {
        match: Equal(matchId),
        letter: MatchesTeamsEnum.b,
      },
    });

    return { teamA, teamB };
  }

  async pick(username: string, pickedUsername: string) {
    const { bottedChannel } = this.commonService.options;
    const player = await this.playersService.findOne(username);
    let match: Match;
    try {
      const matchId = await this.findPlaying(player.id);
      match = await this.findOne(matchId);
    } catch (error) {
      this.logger.error(error.message);
      return false;
    }

    const { teamA, teamB } = await this.getMatchTeams(match.id);

    const teamTurn = this.verifyCaptainTurn(match.id, teamA, teamB);
    if (teamTurn.captain.id !== player.id) return;

    const matchPicks = this.matchPicks[match.id];
    if (!matchPicks) throw new Error(`Match #${match.id} isn't in pick phase`);

    const playerPickedIndex = matchPicks.available.findIndex(
      (p) => p.username === pickedUsername,
    );

    if (playerPickedIndex === -1) {
      this.resetPickTimer(match.id);
      await this.tmiService.say(
        bottedChannel,
        `'${pickedUsername}' was not in the list`,
      );

      await this.sayPickTurn(match.id, teamA, teamB, matchPicks.available);

      throw new Error(
        `${username} tried to pick someone who wasnt on the list`,
      );
    }

    const [playerPicked] = matchPicks.available.splice(playerPickedIndex, 1);

    teamTurn.players.push(playerPicked);
    await this.matchTeamsRepository.save(teamTurn);

    await this.tmiService.say(
      bottedChannel,
      `${username} picked ${pickedUsername}`,
    );
    this.resetPickTimer(match.id);

    matchPicks.pickTurn++;

    if (matchPicks.available.length !== 1) {
      //There is more than one player available
      await this.sayPickTurn(match.id, teamA, teamB, matchPicks.available);
    } else {
      const lastPickTeam = this.verifyCaptainTurn(match.id, teamA, teamB);
      lastPickTeam.players.push(matchPicks.available[0]);
      await this.matchTeamsRepository.save(lastPickTeam);
      this.startPlaying(match, teamA, teamB);
    }
  }

  resetPickTimer(matchId: number) {
    const { cancelPickTimeout } = this.commonService.options;

    const matchPick = this.matchPicks[matchId];
    if (!matchPick)
      throw new Error(
        `Couldn't reset pick timer of match #${matchId}: Not Found`,
      );

    clearTimeout(matchPick.timer);

    matchPick.timer = setTimeout(() => {
      this.cancelMatch(matchId, 'Someone took too long to pick');
    }, cancelPickTimeout * 1000);
  }

  verifyCaptainTurn(matchId: number, teamA: MatchTeams, teamB: MatchTeams) {
    const { pickOrder } = this.commonService.options;
    const teams: { [letter: string]: MatchTeams } = {
      A: teamA,
      B: teamB,
    };

    const pickTurn = this.matchPicks[matchId].pickTurn;
    const teamTurn = teams[pickOrder[pickTurn]];
    return teamTurn;
  }

  async sayPickTurn(
    matchId: number,
    teamA: MatchTeams,
    teamB: MatchTeams,
    availablePlayers: Player[],
  ) {
    const { pickOrder, bottedChannel } = this.commonService.options;
    const teams: { [letter: string]: MatchTeams } = {
      A: teamA,
      B: teamB,
    };

    const pickTurn = this.matchPicks[matchId].pickTurn;
    const teamToPick = teams[pickOrder[pickTurn]];

    await this.tmiService.say(
      bottedChannel,
      `@${teamToPick.captain.username}, it's your turn to pick!`,
    );

    await this.tmiService.say(
      bottedChannel,
      `(${availablePlayers
        .map((p) => p.username)
        .join(' / ')}) pick with !p (username)`,
    );
  }

  //Runs when everyone has voted and picked their team
  async startPlaying(match: Match, teamA: MatchTeams, teamB: MatchTeams) {
    const { bottedChannel } = this.commonService.options;
    const matchPick = this.matchPicks[match.id];
    if (matchPick) clearTimeout(matchPick.timer);
    delete this.matchPicks[match.id];
    await this.tmiService.say(
      bottedChannel,
      `Pick phase for match #${match.id} ended! These are the final teams:`,
    );

    await this.tmiService.say(
      bottedChannel,
      `Team A: (${this.teamPlayersToString(teamA)})`,
    );

    await this.tmiService.say(
      bottedChannel,
      `Team B: (${this.teamPlayersToString(teamB)})`,
    );

    await this.tmiService.say(bottedChannel, `Map: ${match.map.name}`);

    setTimeout(async () => {
      await this.startNextMatch();
    }, 8000);
  }

  async reportLose(username: string) {
    const { bottedChannel } = this.commonService.options;
    let matchId: number;
    let match: Match;
    let player: Player;
    let playerCaptain: 'A' | 'B';
    try {
      player = await this.playersService.findOne(username);
      matchId = await this.findPlaying(player.id);
      match = await this.findOne(matchId);
    } catch (error) {
      this.logger.error(error.message);
      return;
    }

    const { teamA, teamB } = await this.getMatchTeams(matchId);

    if (player.id === teamA.captain.id) {
      playerCaptain = 'A';
    } else if (player.id === teamB.captain.id) {
      playerCaptain = 'B';
    } else return;

    let teamAPoints = 0;
    for (const member of teamA.players) {
      teamAPoints += member.points;
    }

    let teamBPoints = 0;
    for (const member of teamB.players) {
      teamBPoints += member.points;
    }

    const expectedScoreA = this.eloRank.getExpected(teamAPoints, teamBPoints);
    const expectedScoreB = this.eloRank.getExpected(teamBPoints, teamAPoints);

    const updatedPointsA = this.eloRank.updateRating(
      expectedScoreA,
      playerCaptain === 'A' ? 0 : 1,
      teamAPoints,
    );

    const updatedPointsB = this.eloRank.updateRating(
      expectedScoreB,
      playerCaptain === 'B' ? 0 : 1,
      teamBPoints,
    );

    const pointDifferenceA = updatedPointsA - teamAPoints;
    const pointDifferenceB = updatedPointsB - teamBPoints;

    const updatePointsPromises = [];

    try {
      for (const member of teamA.players) {
        updatePointsPromises.push(
          this.playersService.update(member.id, {
            points: Math.max(member.points + pointDifferenceA, 0),
          }),
        );
      }

      for (const member of teamB.players) {
        updatePointsPromises.push(
          this.playersService.update(member.id, {
            points: Math.max(member.points + pointDifferenceB, 0),
          }),
        );
      }

      await Promise.all(updatePointsPromises);

      await this.matchesRepository.update(match.id, {
        status: MatchStatuses.ended,
      });

      for (const player of match.players) {
        delete this.lookingForSub[player.id];
      }

      await this.tmiService.say(
        bottedChannel,
        `Match #${match.id} has ended, Team A players got ${pointDifferenceA} points and Team B players got ${pointDifferenceB} points`,
      );
    } catch (error) {
      this.logger.error(error.message);
      this.cancelMatch(match.id, 'There was a problem updating the points');
    }
  }

  async subMe(username: string) {
    const { bottedChannel } = this.commonService.options;
    let matchId: number;
    let player: Player;
    try {
      player = await this.playersService.findOne(username);
      matchId = await this.findPlaying(player.id);
    } catch (error) {
      this.logger.error(error.message);
      return;
    }

    this.lookingForSub[player.username] = { matchId, player };

    await this.tmiService.say(
      bottedChannel,
      `${username} is looking for a sub! Type !subfor ${username} to join their game.`,
    );
  }

  async subFor(username: string, toSubUsername: string) {
    if (!toSubUsername || username === toSubUsername) return false;
    const { bottedChannel } = this.commonService.options;

    if (!this.lookingForSub[toSubUsername])
      throw new Error(`Player ${toSubUsername} isn't looking for a sub`);

    const toSubOut = this.lookingForSub[toSubUsername].player;
    const toSubIn = await this.playersService.findOne(username);

    if (await this.findPlaying(toSubIn.id).catch(() => false)) {
      throw new Error(
        `Player ${username} can't sub beacuse they're already in a game`,
      );
    }

    const subTeamQuery = await this.matchTeamsRepository
      .createQueryBuilder('team')
      .select('team.id')
      .leftJoinAndSelect('team.players', 'player')
      .leftJoinAndSelect('team.match', 'match')
      .where('player.id=:subId AND match.status="IN_PROGRESS"', {
        subId: toSubOut.id,
      })
      .getOne();

    if (!subTeamQuery)
      throw new Error(`Tried to sub ${toSubUsername}, they are not in a match`);

    const subTeam = await this.matchTeamsRepository.findOne({
      where: { id: subTeamQuery.id },
      relations: { match: { players: true } },
    });

    const subMatch = { ...subTeam.match };

    subMatch.players = subMatch.players.filter((p) => {
      if (toSubIn.id === p.id)
        throw new Error(`Sub-error: ${username} is already in the match`);
      return p.id !== toSubOut.id;
    });
    subMatch.players.push(toSubIn);
    delete subMatch.teams;

    subTeam.players = subTeam.players.filter((p) => p.id !== toSubOut.id);
    if (subTeam.captain.id === toSubOut.id) subTeam.captain = toSubIn;
    subTeam.players.push(toSubIn);
    delete subTeam.match;

    await this.matchesRepository.save(subMatch);

    await this.matchTeamsRepository.save(subTeam);

    const queue = await this.findLatest();

    if (queue) {
      queue.players = queue.players.filter((p) => p.id !== toSubIn.id);
      await this.matchesRepository.save(queue);
    }

    delete this.lookingForSub[username];

    await this.tmiService.say(
      bottedChannel,
      `${username} subbed in for ${toSubUsername}!`,
    );
  }

  async capMe(username: string) {
    const { bottedChannel } = this.commonService.options;
    let matchId: number;
    let player: Player;
    try {
      player = await this.playersService.findOne(username);
      matchId = await this.findPlaying(player.id);
    } catch (error) {
      this.logger.error(error.message);
      return;
    }

    if (!this.mapVoting[matchId]) {
      this.tmiService.say(
        bottedChannel,
        `@${username} !capme is only available during the voting phase`,
      );
      throw new Error('Capme is only available during the voting phase');
    }

    const { teamA, teamB } = await this.getMatchTeams(matchId);
    if (teamA.captain.id !== player.id && teamB.captain.id !== player.id)
      throw new Error(`Cap-error: ${username} is not a captain`);

    this.lookingForCap[player.username] = { matchId, player };
    await this.tmiService.say(
      bottedChannel,
      `${username} is looking for a captain! Type !capfor ${username} to become their team's captain (Only people in their game can become captains).`,
    );
  }

  async capFor(username: string, toCapUsername: string) {
    if (!toCapUsername || username === toCapUsername) return false;
    const { bottedChannel } = this.commonService.options;

    if (!this.lookingForCap[toCapUsername])
      throw new Error(`Player ${toCapUsername} isn't looking for a cap`);

    const toCapOut = this.lookingForCap[toCapUsername].player;
    const toCapIn = await this.playersService.findOne(username);

    const capTeamQuery = await this.matchTeamsRepository
      .createQueryBuilder('team')
      .select('team.id')
      .leftJoinAndSelect('team.players', 'player')
      .leftJoinAndSelect('team.captain', 'captain')
      .leftJoinAndSelect('team.match', 'match')
      .where('captain.id=:capId AND match.status="IN_PROGRESS"', {
        capId: toCapOut.id,
      })
      .getOne();

    if (!capTeamQuery)
      throw new Error(
        `Tried to cap out ${toCapUsername}, they are not in a match`,
      );

    const capTeam = await this.matchTeamsRepository.findOne({
      where: { id: capTeamQuery.id },
      relations: { match: { players: true } },
    });

    const capMatch = { ...capTeam.match };

    let inMatch = false;
    for (const player of capMatch.players) {
      if (player.id === toCapIn.id) inMatch = true;
    }

    if (!inMatch) throw new Error(`Cap-error: ${username} is not in the match`);

    capTeam.captain = toCapIn;
    capTeam.players = [toCapIn];

    await this.matchTeamsRepository.save(capTeam);

    delete this.lookingForCap[username];

    await this.tmiService.say(
      bottedChannel,
      `${username} is now the captain of team ${capTeam.letter}!`,
    );
  }

  private teamPlayersToString(team: MatchTeams) {
    return team.players.map((p) => p.username).join(' / ');
  }

  cancelSubs(
    matchId: number,
    whatToCancel: { subs?: boolean; caps?: boolean },
  ) {
    const subKeys = Object.keys(this.lookingForSub);
    const capKeys = Object.keys(this.lookingForCap);

    if (whatToCancel.subs) {
      for (const key of subKeys) {
        if (this.lookingForSub[key].matchId === matchId)
          delete this.lookingForSub[key];
      }
    }

    if (whatToCancel.caps) {
      for (const key of capKeys) {
        if (this.lookingForCap[key].matchId === matchId)
          delete this.lookingForCap[key];
      }
    }
  }

  getCurrentMatches() {
    return this.matchesRepository.find({
      where: { status: Equal(MatchStatuses.inProgress) },
    });
  }

  async getLeaderboard() {
    const players = await this.playersService.getMostElo();
    let lbStr = 'Top Elo: ';
    for (const pl of players) {
      lbStr += `${pl.username} - ${pl.points}p / `;
    }
    return lbStr;
  }
}
