// 커스텀 에러 
import { ERROR_CODES } from "./errorCodes";

interface ErrorObject {
  code: string;
  message: string;
  status?: number;
}

type ErrorInput = string | ErrorObject;

export class AppError extends Error {
  code: string;
  status: number;
  key: string | null;

  constructor(keyOrObj: ErrorInput) {
    // 초기화 전 호출 필요
    super("");

    // 문자열로 들어온 경우: "something.subkey" 형태의 키
    if (typeof keyOrObj === "string") {
      const parts = keyOrObj.split(".");
      let obj: any = ERROR_CODES;

      for (const part of parts) {
        obj = obj?.[part];
      }

      if (!obj || !obj.code || !obj.message) {
        this.code = "E000";
        this.status = 400;
        this.message = "";
        this.key = keyOrObj;
      } else {
        this.message = obj.message;
        this.code = obj.code;
        this.status = obj.status || 400;
        this.key = keyOrObj;
      }
    }

    // 객체로 들어온 경우
    else if (
      typeof keyOrObj === "object" &&
      typeof keyOrObj.code === "string" &&
      typeof keyOrObj.message === "string"
    ) {
      this.message = keyOrObj.message;
      this.code = keyOrObj.code;
      this.status = keyOrObj.status || 400;
      this.key = null;
    }

    // 예외 상황
    else {
      this.message = "";
      this.code = "E000";
      this.status = 500;
      this.key = null;
    }

    // Error stack trace 유지
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      error: {
        key: this.key,
        code: this.code,
        message: this.message,
      },
    };
  }
}
