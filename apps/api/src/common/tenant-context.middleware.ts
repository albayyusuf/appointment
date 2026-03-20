import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export type TenantRequest = Request & { tenantId?: string };

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: TenantRequest, _res: Response, next: NextFunction): void {
    // Keep health and root routes public for uptime checks.
    if (
      req.path === '/' ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/tenants/bootstrap') ||
      req.path.startsWith('/saas') ||
      req.path.startsWith('/platform')
    ) {
      next();
      return;
    }

    const tenantId = req.header('x-tenant-id');
    if (!tenantId) {
      throw new BadRequestException('Missing x-tenant-id header');
    }

    req.tenantId = tenantId;
    next();
  }
}
