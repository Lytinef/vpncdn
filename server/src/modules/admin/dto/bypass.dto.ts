import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { BypassType } from '../../bypass/entities/bypass-entry.entity';

export class CreateBypassDto {
  @IsEnum(BypassType)
  type: BypassType;

  @IsString()
  value: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBypassDto extends PartialType(CreateBypassDto) {}
