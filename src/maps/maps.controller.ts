import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { MapsService } from './maps.service';
import { CreateMapDto } from './dto/create-map.dto';
import { UpdateMapDto } from './dto/update-map.dto';
import { ParseIntPipe } from '@nestjs/common/pipes';

@Controller('maps')
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  @Post()
  create(@Body() createMapDto: CreateMapDto) {
    return this.mapsService.create(createMapDto);
  }

  @Get()
  findAll() {
    return this.mapsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: string) {
    return this.mapsService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: string,
    @Body() updateMapDto: UpdateMapDto,
  ) {
    return this.mapsService.update(+id, updateMapDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: string) {
    return this.mapsService.remove(+id);
  }
}
