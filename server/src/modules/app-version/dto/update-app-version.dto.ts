import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateAppVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  latestVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  latestBuild?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minBuild?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  updateUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
