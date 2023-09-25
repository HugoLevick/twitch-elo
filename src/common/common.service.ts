import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { promises as fs } from 'fs';
import { UpdateOptionsDto } from './dto/update-channel.dto';
import { Options } from './interfaces/options.interface';
import { TmiService } from '../tmi/tmi.service';
import { OnModuleInit } from '@nestjs/common/interfaces';
import { BadRequestException } from '@nestjs/common/exceptions';
import { MatchesService } from '../matches/matches.service';

@Injectable()
export class CommonService implements OnModuleInit {
  options: Options;
  private logger = new Logger();

  constructor(
    @Inject(forwardRef(() => TmiService))
    private readonly tmiService: TmiService,

    @Inject(forwardRef(() => MatchesService))
    private readonly matchesService: MatchesService,
  ) {}

  onModuleInit() {
    this.setOptions();
  }

  private async setOptions() {
    try {
      const file = await fs.readFile(
        'C:\\Program Files\\twitch-elo\\options.json',
      );
      this.options = await JSON.parse(file.toString());
      this.tmiService.startBot(this.options.bottedChannel);
    } catch (error) {
      this.logger.error(
        `Got an error trying to read the file: ${error.message}`,
      );
    }
  }

  async updateOptions(updateOptionsDto: UpdateOptionsDto) {
    const updatedOptions = { ...this.options, ...updateOptionsDto };

    //Pick order lenght must be the number of players per team * 2 to get the total number of players, it then needs to be substracted 2 because 2 people are captains and they cannot be picked
    if (
      updatedOptions.pickOrder.length !==
        updatedOptions.playersPerTeam * 2 - 2 ||
      !updatedOptions.pickOrder.match(/^[AB]+$/)
    ) {
      if (updatedOptions.playersPerTeam !== 1)
        throw new BadRequestException(
          'Please provide a correct pick order. It must include only uppercase A and B and it should let both captains pick all the players',
        );
      else updatedOptions.pickOrder = 'AB';
    }

    if (
      updatedOptions.pickOrder.match(/A/g)?.length !==
        updatedOptions.playersPerTeam - 1 &&
      updatedOptions.playersPerTeam > 1
    )
      throw new BadRequestException(
        'One team cannot pick more players than the other, please review the pick order',
      );

    try {
      await this.matchesService.cancelAllActive();
      this.options = updatedOptions;
      await fs.writeFile(
        'C:\\Program Files\\twitch-elo\\options.json',
        JSON.stringify(this.options),
      );
      await this.tmiService.stopBot();
      await this.tmiService.startBot(this.options.bottedChannel);
      return true;
    } catch (error) {
      this.logger.error(
        `Got an error trying to read the file: ${error.message}`,
      );
      throw error;
    }
  }

  random(min: number, max: number) {
    return Math.floor(Math.random() * max + min);
  }
}
