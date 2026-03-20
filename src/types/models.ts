import { Timestamp } from "firebase-admin/firestore";

export interface Schedule {
  daysOfWeek: number[]; // 요일 (0: 일요일, 1: 월요일, ..., 6: 토요일)
  workingTime: {
    start: string; // 예: "오전 9:00"
    end: string;   // 예: "오후 6:00"
  };
  [key: string]: any; // 추가 필드 허용 (id, role,  등)
}

export interface MapFromKakao {
  address_name: string;
  category_group_code: string;   // 예: "CE7"
  category_group_name: string;   // 예: "카페"
  category_name: string;         // 예: "음식점 > 카페 > 커피전문점 > 스타벅스"
  distance: string;              // 문자열 숫자 (ex: "278")
  id: string;                    // 문자열 숫자 ID
  phone: string;                 // 전화번호
  place_name: string;           // 장소명 (ex: "스타벅스 이대점")
  place_url: string;            // 장소 상세 페이지 URL
  road_address_name: string;    // 도로명 주소
  x: string;                    // 경도 (longitude), 문자열
  y: string;                    // 위도 (latitude), 문자열
}

interface WorkingTime {
  start: number;
  end: number;
}

export interface ScheduleInput {
  date: Date;
  dateStr: string;
  dayOfWeek: any;
  workingTime: WorkingTime;
  isActive?: boolean; 
  endDate?: Timestamp | null;
}

export interface WorkerInfo {
  storeId: string;
  userId: string;
  userName: string;
  storeName: string;
  address: string;
  date: Timestamp; // 근무 시작일
  endDate?: Timestamp | null; // 있을 경우 이전 근무자
  separatedSchedules?: ScheduleInput[]; // 없으면 이전 근무자
  isPrevious?: boolean;
  managerId?: string;
  isNew?: boolean;
}

