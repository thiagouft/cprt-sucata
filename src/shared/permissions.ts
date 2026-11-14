/**
 * Catálogo de permissões do sistema. A chave segue o padrão "<menu>:<ação>".
 * Este arquivo é a fonte da verdade: o startup/seed sincroniza a tabela `permissoes`.
 */
export const PERMISSIONS = [
  { chave: 'registrar:ver', menu: 'Registrar', descricao: 'Acessar o menu Registrar (abrir novas operações)' },
  { chave: 'pendencias:ver', menu: 'Pendências', descricao: 'Acessar o menu Pendências' },
  { chave: 'alertas:ver', menu: 'Alertas', descricao: 'Acessar o menu Alertas' },
  { chave: 'historico:ver', menu: 'Histórico', descricao: 'Acessar o menu Histórico' },
  { chave: 'painel:ver', menu: 'Painel', descricao: 'Acessar o menu Painel' },
  { chave: 'operacoes:gravar', menu: 'Operações', descricao: 'Criar e alterar operações, anexar fotos e usar a leitura automática' },
  { chave: 'operacoes:excluir', menu: 'Operações', descricao: 'Excluir operações' },
  { chave: 'ajustes:ver', menu: 'Ajustes', descricao: 'Acessar o menu Ajustes' },
  { chave: 'ajustes:editar', menu: 'Ajustes', descricao: 'Alterar sucateiros, preços e textos de NF/MTR' },
  { chave: 'perfis:ver', menu: 'Perfis', descricao: 'Acessar o menu Perfis e permissões' },
  { chave: 'perfis:gerenciar', menu: 'Perfis', descricao: 'Criar, editar e excluir perfis e suas permissões' }
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['chave'];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map(p => p.chave);

export const isPermissionKey = (v: string): v is PermissionKey => (ALL_PERMISSION_KEYS as string[]).includes(v);

/**
 * O perfil Administrador é o "master": só ele cria usuários e redefine senhas. Isso não é uma
 * permissão atribuível a outros perfis (por isso não está no catálogo acima).
 */
export const ADMIN_ROLE_NAME = 'Administrador';
export const isMasterRole = (nomePerfil: string) => nomePerfil === ADMIN_ROLE_NAME;

/** Perfis criados por padrão. "Administrador" sempre recebe todas as permissões. */
export const DEFAULT_ROLES: { nome: string; descricao: string; permissoes: PermissionKey[] }[] = [
  { nome: ADMIN_ROLE_NAME, descricao: 'Acesso total ao sistema', permissoes: ALL_PERMISSION_KEYS },
  {
    nome: 'Controlador',
    descricao: 'Registra e acompanha as operações do pátio',
    permissoes: ['registrar:ver', 'pendencias:ver', 'alertas:ver', 'historico:ver', 'painel:ver', 'operacoes:gravar', 'ajustes:ver']
  },
  {
    nome: 'Consulta',
    descricao: 'Somente visualização',
    permissoes: ['historico:ver', 'painel:ver', 'alertas:ver']
  }
];
