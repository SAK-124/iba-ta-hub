import { PostgrestError } from '@supabase/supabase-js';

export type AppError = {
  code: string;
  message: string;
  cause?: unknown;
};

export const toAppError = (error: unknown, fallbackCode = 'unknown_error'): AppError => {
  if (!error) {
    return { code: fallbackCode, message: 'Unknown error' };
  }

  if (error instanceof Error) {
    return { code: fallbackCode, message: error.message, cause: error };
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Partial<PostgrestError> & { message?: unknown; code?: unknown };
    return {
      code: typeof candidate.code === 'string' ? candidate.code : fallbackCode,
      message: typeof candidate.message === 'string' ? candidate.message : 'Unknown error',
      cause: error,
    };
  }

  return {
    code: fallbackCode,
    message: String(error),
    cause: error,
  };
};

export const throwIfError = (error: unknown, fallbackCode?: string): never => {
  throw toAppError(error, fallbackCode);
};
