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
    timer;
  };
}

interface Picks {
  [matchId: number]: {
    available: Player[];
    pickTurn: number;
    timer;
  };
}

@Injectable()
export class MatchesService implements OnModuleInit {
  private logger = new Logger('MatchesService');
  private mapVoting: Voting = {};
  private matchPicks: Picks = {};
  private eloRank = new EloRank(30);

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
      .where('matches.status IN("IN_PROGRESS","QUEUEING")')
      .getMany();

    for (const match of previousMatches) {
      try {
        await this.remove(match.id);
      } catch (error) {
        this.logger.error(error.message);
      }
    }
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

    if (this.mapVoting[match.id]) clearTimeout(this.mapVoting[match.id].timer);
    if (skipVote) await this.decideMap(match);
    await this.startPickPhase(match);
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
    //TODO: Check if player is in a match in progress
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

  //Sets the match status to In Progress, chooses captains, creates empty teams (only captains), and starts voting timer
  async startMatch(match: Match) {
    const { gameId, bottedChannel, cancelVoteTimeout } =
      this.commonService.options;
    match.status = MatchStatuses.inProgress;
    const playerUsernames = match.players.map((p) => p.username);
    //prettier-ignore
    let message = `${playerUsernames.map((p) => `@${p}`).join(', ')} match #${match.id} is ready!`;
    this.tmiService.say(bottedChannel, message);

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
      await this.cancelMatch(match.id, 'There was an error selecting captains');
      return;
    }

    const teamA = this.matchTeamsRepository.create({
      match,
      captain: CaptainA,
      players: [CaptainA],
      letter: MatchesTeamsEnum.a,
    });

    const teamB = this.matchTeamsRepository.create({
      match,
      captain: CaptainB,
      players: [CaptainB],
      letter: MatchesTeamsEnum.b,
    });

    await this.matchTeamsRepository.save([teamA, teamB]);
    match.teams = [teamA, teamB];
    message = 'Vote for a map with !vote (number) *This is a test*';
    //prettier-ignore
    await this.tmiService.say(bottedChannel, message);

    const maps = await this.mapsService.findGameMaps(gameId);

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

    await this.matchesRepository.save(match);
  }

  async cancelMatch(matchId: number, reason: string) {
    try {
      await this.remove(matchId);
      delete this.mapVoting[matchId];
      await this.tmiService.say(
        this.commonService.options.bottedChannel,
        `Match #${matchId} canceled: ${reason}`,
      );
      return true;
    } catch (error) {
      this.logger.error(error);
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
        await this.decideMap(match);
        await this.startPickPhase(match);
      } catch (error) {
        this.logger.error(error.message);
      }
      return false;
    }

    return true;
  }

  //Decides maps provided with this.mapVoting based on votes
  async decideMap(match: Match) {
    //Decide map
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

  //Deletes the match from the mapVoting object
  async startPickPhase(match: Match) {
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

      await this.tmiService.say(
        bottedChannel,
        `Match #${match.id} has ended, Team A players got ${pointDifferenceA} points and Team B players got ${pointDifferenceB} points`,
      );
    } catch (error) {
      this.logger.error(error.message);
      this.cancelMatch(match.id, 'There was a problem updating the points');
    }
  }

  private teamPlayersToString(team: MatchTeams) {
    return team.players.map((p) => p.username).join(' / ');
  }

  getCurrentMatches() {
    return this.matchesRepository.find({
      where: { status: Equal(MatchStatuses.inProgress) },
    });
  }
}
