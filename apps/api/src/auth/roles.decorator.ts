import { SetMetadata } from '@nestjs/common';

export type SchoolRole = 'admin' | 'teacher';
export const SCHOOL_ROLES_KEY = 'schoolRoles';
export const SchoolRoles = (...roles: SchoolRole[]) =>
  SetMetadata(SCHOOL_ROLES_KEY, roles);
