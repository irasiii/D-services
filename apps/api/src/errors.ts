export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);
export const conflict = (message: string) => new HttpError(409, message);
export const unprocessable = (message: string) => new HttpError(422, message);
