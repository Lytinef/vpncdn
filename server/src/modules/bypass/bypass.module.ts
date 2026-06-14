import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BypassEntry } from './entities/bypass-entry.entity';
import { BypassService } from './bypass.service';
import { BypassController } from './bypass.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BypassEntry])],
  providers: [BypassService],
  controllers: [BypassController],
  exports: [BypassService],
})
export class BypassModule {}
