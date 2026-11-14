import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE_NAME, ALL_PERMISSION_KEYS, DEFAULT_ROLES, PERMISSIONS, isPermissionKey } from '../src/shared/permissions.js';

describe('catálogo de permissões', () => {
  it('não possui chaves duplicadas e segue o padrão menu:ação', () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(PERMISSIONS.length);
    for (const k of ALL_PERMISSION_KEYS) expect(k).toMatch(/^[a-z]+:[a-z]+$/);
  });

  it('isPermissionKey rejeita chaves desconhecidas', () => {
    expect(isPermissionKey('perfis:ver')).toBe(true);
    // gestão de usuários é exclusiva do master, não uma permissão atribuível
    expect(isPermissionKey('usuarios:gerenciar')).toBe(false);
    expect(isPermissionKey('foo:bar')).toBe(false);
  });

  it('o perfil Administrador tem todas as permissões', () => {
    const admin = DEFAULT_ROLES.find(r => r.nome === ADMIN_ROLE_NAME);
    expect(admin?.permissoes.slice().sort()).toEqual(ALL_PERMISSION_KEYS.slice().sort());
  });

  it('perfis padrão só usam permissões existentes', () => {
    for (const r of DEFAULT_ROLES) for (const p of r.permissoes) expect(isPermissionKey(p)).toBe(true);
  });
});
