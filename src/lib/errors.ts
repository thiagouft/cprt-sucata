export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'bad_request') => new AppError(400, code, message);
export const unauthorized = (message = 'Faça login.', code = 'unauthenticated') => new AppError(401, code, message);
export const forbidden = (message = 'Você não tem permissão para esta ação.') => new AppError(403, 'forbidden', message);
export const notFound = (message = 'Registro não encontrado.') => new AppError(404, 'not_found', message);
export const conflict = (message: string) => new AppError(409, 'conflict', message);
