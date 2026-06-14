import { Module } from '@nestjs/common';
import { XrayService } from './xray.service';
import { XrayNodeClient } from './xray-node.client';

@Module({
  providers: [XrayService, XrayNodeClient],
  exports: [XrayService],
})
export class XrayModule {}
