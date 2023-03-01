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

@Injectable()
export class MatchesService implements OnModuleInit {
  private logger = new Logger('MatchesService');
  private mapVoting: Voting = {};

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
      this.remove(match.id);
    }
  }

  async create() {
    const match = this.matchesRepository.create({ players: [] });
    await this.matchesRepository.save(match);
    return match;
  }

  findAll() {
    return `This action returns all matches`;
  }

  findOne(id: number) {
    return `This action returns a #${id} match`;
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
    if (!match) throw new Error(`Player ${playerId} isnt in a match`);
    return match;
  }

  update(id: number, updateMatchDto: UpdateMatchDto) {
    return `This action updates a #${id} match`;
  }

  async remove(id: number) {
    try {
      await this.matchesRepository.softDelete({ id });
      return true;
    } catch (error) {
      this.logger.error(error.message);
      return false;
    }
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
      await this.startMatch(match, this.commonService.options.bottedChannel);

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

  async startMatch(match: Match, channelName: string) {
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
    await this.remove(matchId);
    delete this.mapVoting[matchId];
    await this.tmiService.say(
      this.commonService.options.bottedChannel,
      `Match #${matchId} canceled: ${reason}`,
    );
  }

  async vote(username: string, mapId: number) {
    const player = await this.playersService.findOne(username);
    let match: Match;
    try {
      match = await this.findPlaying(player.id);
    } catch (error) {
      this.logger.error(error.message);
      return false;
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
      this.startPickPhase(match);
    }

    return true;
  }

  async startPickPhase(match: Match) {
    const { bottedChannel } = this.commonService.options;
    this.tmiService.say(
      bottedChannel,
      'Vote phase ended! Pick phase starts now',
    );

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
      `Map ${mapWinner.name} won the votation`,
    );

    await this.cancelMatch(
      match.id,
      'Test goes this far, stay tuned for more :)',
    );
    delete this.mapVoting[match.id];
  }

  getCurrentMatches() {
    return this.matchesRepository.find({
      where: { status: Equal(MatchStatuses.inProgress) },
    });
  }
}
