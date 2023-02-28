import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { promises as fs } from 'fs';
import { UpdateOptionsDto } from './dto/update-channel.dto';
import { Options } from './interfaces/options.interface';
import { TmiService } from '../tmi/tmi.service';
import { OnModuleInit } from '@nestjs/common/interfaces';

@Injectable()
export class CommonService implements OnModuleInit {
  options: Options;
  private logger = new Logger();

  constructor(
    @Inject(forwardRef(() => TmiService))
    private readonly tmiService: TmiService,
  ) {}

  onModuleInit() {
    this.setOptions();
  }

  private async setOptions() {
    try {
      const file = await fs.readFile('./src/options.json');
      this.options = await JSON.parse(file.toString());
      this.tmiService.startBot(this.options.bottedChannel);
    } catch (error) {
      this.logger.error(
        `Got an error trying to read the file: ${error.message}`,
      );
    }
  }

  async updateOptions(updateOptionsDto: UpdateOptionsDto) {
    this.options = { ...this.options, ...updateOptionsDto };
    try {
      await fs.writeFile('./src/options.json', JSON.stringify(this.options));
      await this.tmiService.stopBot();
      await this.tmiService.startBot(this.options.bottedChannel);
      return true;
    } catch (error) {
      this.logger.error(
        `Got an error trying to read the file: ${error.message}`,
      );
    }
  }
}
