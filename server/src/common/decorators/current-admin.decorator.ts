import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthAdmin {
  id: string;
  role: string;
  email: string;
}

export const CurrentAdmin = createParamDecorator(
  (data: keyof AuthAdmin | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const admin = request.user as AuthAdmin;
    return data ? admin?.[data] : admin;
  },
);
