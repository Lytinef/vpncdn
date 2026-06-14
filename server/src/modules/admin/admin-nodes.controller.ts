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
import { NodesService } from '../nodes/nodes.service';
import { CreateNodeDto, UpdateNodeDto } from './dto/node.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/nodes')
export class AdminNodesController {
  constructor(private readonly nodes: NodesService) {}

  /** Узлы с количеством устройств (нагрузка). */
  @Get()
  async list() {
    const stats = await this.nodes.stats();
    return stats.map(({ node, devices }) => ({
      id: node.id,
      name: node.name,
      region: node.region,
      cdnDomain: node.cdnDomain,
      originHost: node.originHost,
      sni: node.sni,
      port: node.port,
      wsPath: node.wsPath,
      capacity: node.capacity,
      isActive: node.isActive,
      hasApi: !!node.apiUrl,
      devices,
      cpuPercent: node.cpuPercent,
      memPercent: node.memPercent,
      metricsAt: node.metricsAt,
    }));
  }

  @Post()
  create(@Body() dto: CreateNodeDto) {
    return this.nodes.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNodeDto) {
    return this.nodes.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.nodes.remove(id);
  }
}
