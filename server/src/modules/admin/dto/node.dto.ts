import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateNodeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsString()
  originHost: string;

  @IsString()
  cdnDomain: string;

  @IsString()
  sni: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  wsPath?: string;

  @IsOptional()
  @IsString()
  apiUrl?: string;

  @IsOptional()
  @IsString()
  apiSecret?: string;

  // ── Прямой режим (мимо CDN): hysteria2 | reality ──
  @IsOptional()
  @IsString()
  directProtocol?: string;

  @IsOptional()
  @IsString()
  directHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  directPort?: number;

  @IsOptional()
  @IsString()
  directPublicKey?: string;

  @IsOptional()
  @IsString()
  directShortId?: string;

  @IsOptional()
  @IsString()
  directSni?: string;

  @IsOptional()
  @IsString()
  directCertPin?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateNodeDto extends PartialType(CreateNodeDto) {}
