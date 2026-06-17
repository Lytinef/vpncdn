import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CodeLoginDto {
  @IsString()
  @Length(4, 12)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  platform?: string;
}
