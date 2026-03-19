import { PostgrestError } from '@supabase/supabase-js';

export type AppError = {
  code: string;
  message: string;
  cause?: unknown;
};

export const getErrorMessage = (error: unknown, fallback = 'Unknown error'): string => {
  if (!error) {
    return fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && message.trim() ? message : fallback;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
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
