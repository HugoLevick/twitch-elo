import { Body, Controller, Post } from '@nestjs/common';
import { CommonService } from './common.service';
import { UpdateOptionsDto } from './dto/update-channel.dto';

@Controller('config')
export class CommonController {
  constructor(private readonly commonService: CommonService) {}

  @Post('update')
  updateChannel(@Body() updateOptionsDto: UpdateOptionsDto) {
    return this.commonService.updateOptions(updateOptionsDto);
  }
}
