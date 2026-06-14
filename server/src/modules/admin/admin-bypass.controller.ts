import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { BypassService } from '../bypass/bypass.service';
import { CreateBypassDto, UpdateBypassDto } from './dto/bypass.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/bypass')
export class AdminBypassController {
  constructor(private readonly bypass: BypassService) {}

  @Get()
  list() {
    return this.bypass.findAll();
  }

  @Post()
  create(@Body() dto: CreateBypassDto) {
    return this.bypass.create(dto);
  }

  @Post('bulk')
  bulk(@Body() dto: CreateBypassDto[]) {
    return this.bypass.bulkUpsert(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBypassDto) {
    return this.bypass.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.bypass.remove(id);
  }
}
