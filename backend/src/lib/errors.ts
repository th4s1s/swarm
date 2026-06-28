/** Error carrying an HTTP status, mapped to a response by the Fastify error handler. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (m: string) => new AppError(400, m);
export const notFound = (m: string) => new AppError(404, m);
export const conflict = (m: string) => new AppError(409, m);
export const serverError = (m: string) => new AppError(500, m);
