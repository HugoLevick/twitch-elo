import { Body, Controller, Post, Get, Put } from '@nestjs/common';
import { CommonService } from './common.service';
import { UpdateOptionsDto } from './dto/update-channel.dto';

@Controller('config')
export class CommonController {
  constructor(private readonly commonService: CommonService) {}

  @Put('update')
  updateChannel(@Body() updateOptionsDto: UpdateOptionsDto) {
    return this.commonService.updateOptions(updateOptionsDto);
  }

  @Get()
  getOptions() {
    return this.commonService.options;
  }
}
