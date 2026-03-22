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

    /** tenantId @Query ile controller'da okunur; middleware'de query güvenilir olmayabilir */
    if (req.path.startsWith('/guest/branches')) {
      next();
      return;
    }

    const fromHeader = req.header('x-tenant-id');
    let tenantId = fromHeader?.trim() || undefined;
    /** Misafir GET’lerde tenantId sorgu parametresi (CORS preflight gerektirmez) */
    if (!tenantId && req.path.startsWith('/guest/')) {
      const q = req.query?.tenantId;
      const fromQuery = typeof q === 'string' ? q : Array.isArray(q) && q[0] ? String(q[0]) : undefined;
      tenantId = fromQuery?.trim() || undefined;
    }

    if (!tenantId) {
      throw new BadRequestException('Missing x-tenant-id header');
    }

    req.tenantId = tenantId;
    next();
  }
}
