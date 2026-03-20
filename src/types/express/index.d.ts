// 커스텀 req, res 타입
import express from 'express';

declare global {
  namespace Express {
    export interface Request {
      user?: {
        uid: string;
        [key: string]: any;
      };
    }
    export interface Response {
      success: (data: any) => void;
      error: (
        status?: number,
        code?: string,
        message?: string,
        errorObj?: Error | null
      ) => void;
    }
  }
}