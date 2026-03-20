// 에러 코드 모음 
export const ERROR_CODES: Object = {
  SYSTEM: {
    UNKNOWN: {
      code: "E999",
      message: "알 수 없는 오류가 발생했습니다.",
      status: 500,
    },
    FIRESTORE_FAIL: {
      code: "E998",
      message: "데이터베이스 오류가 발생했습니다.",
      status: 500,
    },
    INVALID_INPUT: {
      code: "E997",
      message: "요청 값이 올바르지 않습니다.",
      status: 400,
    },
    AUTH_FAIL: {
      code: "E996",
      message: "사용자 인증에 실패했습니다.",
      status: 401,
    },
  },

  DATA: {
    LOAD_FAIL: {
      code: "D001",
      message: "데이터를 불러오는 중 오류가 발생했습니다.",
      status: 500,
    },
  },

  STORE: {
    NOT_FOUND: {
      code: "S404",
      message: "가게를 찾을 수 없습니다.",
      status: 409,
    },
    ALREADY_REGISTERED: {
      code: "S200",
      message: "이미 등록된 가게입니다.",
      status: 409,
    },
    NOT_A_WORKER: {
      code: "S201",
      message: "등록된 가게가 아닙니다.",
      status: 409,
    },
    MANAGER_ALREADY_EXISTS: {
      code: "S202",
      message: "이미 매니저가 등록된 가게입니다.",
      status: 409,
    }
  },

  SCHEDULE: {
    CANNOT_CHANGE: {
      code: "H001",
      message: "대타 요청이 진행 중인 스케줄입니다.",
      status: 409,
    },
    INVALID_DATE: {
      code: "H010",
      message: "잘못된 날짜 형식입니다. (yyyy.mm)",
      status: 400
    }
  },

  TRANSACTION: {
    CONFLICT: {
      code: "T001",
      message: "동시 처리 충돌이 발생했습니다. 잠시 후 다시 시도해주세요.",
      status: 409,
    },
  },

  USER: {
    NOT_SIGNED_IN: {
      code: "U001",
      message: "로그인된 사용자가 없습니다.",
      status: 401,
    },
    NOT_FOUND: {
      code: "U002",
      message: "존재하지 않는 사용자입니다.",
      status: 404,
    },
    AUTH_FAIL: {
      code: "U003",
      message: "사용자 인증에 실패했습니다.",
      status: 401,
    },
    KAKAO_AUTH_FAIL: {
      code: "K001",
      message: "카카오 인증에 실패했습니다.",
      status: 401,
    },
    KAKAO_TOKEN_MISSING: {
      code: "K002",
      message: "카카오 토큰이 없습니다.",
      status: 400,
    },
    KAKAO_LOGIN_FAIL: {
      code: "K999",
      message: "카카오 로그인 처리에 실패했습니다.",
      status: 500,
    },
  },

  REQUEST: {
    INVALID_DATE: {
      code: "R010",
      message: "올바르지 않은 날짜입니다.",
      status: 400,
    },
    INVALID_INPUT: {
      code: "R011",
      message: "요청 값이 올바르지 않습니다. (scheduleId가 없으면 storeId, workingTime 모두 필요)",
      status: 400,
    },
    NOT_FOUND: {
      code: "R003",
      message: "해당 대타 요청을 찾을 수 없습니다.",
      status: 409,
    },
    ALREADY_MATCHED: {
      code: "R004",
      message: "이미 지원돤 대타 요청입니다.",
      status: 409,
    },
    ALREADY_ASSIGNED: {
      code: "R005",
      message: "이미 해당 날짜에 근무가 배정되어 있습니다.",
      status: 409,
    },
    INVALID_SCHEDULE: {
      code: "R006",
      message: "이미 해당 날짜에 근무가 배정되어 있습니다.",
      status: 409,
    },
    DUPLICATED_TODAY: {
      code: "R501",
      message: "이벤트 가게는 하루 두번의 대타 지원만 가능합니다.",
      status: 409,
    }
  },

  ACCESS: {
    FORBIDDEN: {
      code: "A001",
      message: "접근 권한이 없습니다.",
      status: 403,
    },
  },
};
