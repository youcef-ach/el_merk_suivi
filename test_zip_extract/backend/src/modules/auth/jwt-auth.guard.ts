import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Attempt standard Passport execution which populates request.user
    return super.canActivate(context);
  }

  handleRequest(err, user, info, context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If there's a valid user, they are attached to req.user by passport.
    if (user) {
      return user;
    }

    // If it's a public route and user is missing/invalid, do not throw. 
    // They will just proceed as an anonymous guest (req.user = undefined).
    if (isPublic) {
      return null;
    }

    // For protected routes, actively block if missing or invalid
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or missing authentication token');
    }

    return user;
  }
}
