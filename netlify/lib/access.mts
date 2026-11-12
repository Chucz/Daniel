export const ACCESS_ROLES = ['admin', 'editor', 'consulta'] as const;
export function canEditSchedule(user: { role: string; mustChangePassword?: boolean } | null | undefined) {
  return !!user && !user.mustChangePassword && ['admin', 'editor'].includes(user.role);
}
export function canManageUsers(user: { role: string; mustChangePassword?: boolean } | null | undefined) {
  return !!user && !user.mustChangePassword && user.role === 'admin';
}
export function safeUser(user: any) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active,
    isPrimary: user.isPrimary, mustChangePassword: user.mustChangePassword, version: user.version, createdAt: user.createdAt };
}
