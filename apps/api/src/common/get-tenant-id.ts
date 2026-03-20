import { BadRequestException } from '@nestjs/common';
import type { TenantRequest } from './tenant-context.middleware';

export function getTenantId(req: TenantRequest): string {
  const headerTenantId = req.headers['x-tenant-id'];
  const tenantId = req.tenantId ?? (Array.isArray(headerTenantId) ? headerTenantId[0] : headerTenantId);
  if (!tenantId) {
    throw new BadRequestException('Missing x-tenant-id header');
  }
  return tenantId;
}
