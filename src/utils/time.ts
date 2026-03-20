// utils/TimeUtils.ts
import { Timestamp } from "firebase-admin/firestore";

/**
 * 시간/날짜 유틸 클래스 (KST/한국어 시각 문자열 처리 포함)
 */
export class TimeUtils {
  /**
   * "YYYY.MM" -> Firebase Timestamp (해당 월 1일 00:00:00)
   */
  static yyyymmToTimestamp(yyyymm: string): Timestamp {
    if (!/^\d{4}\.\d{2}$/.test(yyyymm)) {
      throw new Error("Invalid date format. Use YYYY.MM");
    }
    const [year, month] = yyyymm.split(".").map(Number);
    const date = new Date(year, month - 1, 1);
    return Timestamp.fromDate(date);
  }

  /**
   * Firebase Timestamp -> "YYYY.MM"
   */
  static convertTimestampToyyyymm(time: Timestamp | null | undefined): string {
    if (!time) return "";
    const date = time.toDate();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    return `${yyyy}.${mm}`;
  }

  /**
   * 한국어 12시간 문자열("오전/오후 HH:MM") -> 10분 단위 인덱스 번호
   * 반환: { startNum, endNum }  (endNum는 구간 포함을 위해 -1 적용)
   */
  static convertKorStringToNum(workingTime: {start: string, end: string}) {
    const convertSingle = (timeInput: string | number) => {
      if (typeof timeInput === "number") return timeInput;
      if (typeof timeInput !== "string") return NaN;

      const trimmed = timeInput.trim();
      let period: "AM" | "PM" | null = null;
      let timePart = trimmed;

      if (trimmed.startsWith("오전")) {
        period = "AM";
        timePart = trimmed.slice(2).trim();
      } else if (trimmed.startsWith("오후")) {
        period = "PM";
        timePart = trimmed.slice(2).trim();
      }

      const [hourStr, minuteStr] = timePart.split(":");
      let hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);

      if (period === "AM" && hour === 12) hour = 0;       // 오전 12시 -> 00시
      if (period === "PM" && hour !== 12) hour += 12;     // 오후 1~11시 -> 13~23시

      const totalMinutes = hour * 60 + minute;
      return Math.floor(totalMinutes / 10);               // 10분 단위 인덱스
    };

    const start = convertSingle(workingTime.start);
    const end = convertSingle(workingTime.end) - 1;       // 종료 인덱스 포함 처리

    return { start, end };
  }

  /**
   * 10분 단위 인덱스 -> 한국어 12시간 문자열("오전/오후 HH:MM")
   * convertKorStringToNum과 반대 변환 (endNum는 +1 하여 보정)
   */
  static convertNumToKorString(workingTime: { start: number, end: number }) {
    const convertSingle = (timeNum: number) => {
      const totalMinutes = timeNum * 10;
      let hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;

      const period = hour < 12 ? "오전" : "오후";
      if (hour === 0) hour = 12;    // 00:xx -> 오전 12:xx
      else if (hour > 12) hour -= 12;

      return `${period} ${hour}:${String(minute).padStart(2, "0")}`;
    };

    return { start: convertSingle(workingTime.start), end: convertSingle(workingTime.end + 1) };
  }

  /**
   * Firebase Timestamp -> KST 기준 ISO 문자열
   * 예: "2025-04-10T00:00:00.000Z" (표기는 Z이지만 값은 KST 시각을 반영)
   */
  static convertTimeStampToKSTISOString(timestamp: Timestamp | null) {
    if (!timestamp) return null;
    const utcDate = timestamp.toDate();
    const kstOffsetMs = 9 * 60 * 60 * 1000;
    const kstDate = new Date(utcDate.getTime() + kstOffsetMs);
    return kstDate.toISOString();
  }

  /**
   * "YYYY-MM-DD" 또는 "YYYY.MM.DD" -> Date
   */
  static parseDateString(dateString: string): Date {
    const separator = dateString.includes("-") ? "-" : ".";
    const parts = dateString.split(separator).filter(Boolean);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }

  /**
   * 오늘(Asia/Seoul) 00:00 기준, 10분 인덱스를 ISO로 변환
   * isEnd가 true면 구간 종료 보정으로 +1 인덱스 적용
   */
  static convertIndexToISO(isEnd: boolean, index: number): string {
    if (typeof index !== "number") return "";

    let idx = index;
    if (isEnd) idx += 1;

    // 오늘 기준(서울 타임존)
    const seoulNow = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
    );
    const year = seoulNow.getFullYear();
    const month = seoulNow.getMonth();
    const day = seoulNow.getDate();

    const baseDate = new Date(year, month, day, 0, 0, 0);
    baseDate.setMinutes(idx * 10);
    return baseDate.toISOString();
  }

  /**
   * Firebase Timestamp -> "YYYY.MM.DD" (ko-KR locale 기반, 공백/마침표 정리)
   */
  static convertTimestampToKorDotDate(timestamp: Timestamp | null) {
    if (!timestamp) return null;
    return timestamp
      .toDate()
      .toLocaleDateString("ko-KR")
      .replace(/ /g, "")
      .replace(/\.$/, "");
  }

  /**
   * Date | string -> "YYYY.MM.DD"
   */
  static convertToKorDotDate(input: Date | string | null | undefined): string {
    if (!input) return "";
    const date =
      input instanceof Date ? input : typeof input === "string" ? new Date(input) : null;
    if (!date || isNaN(date.getTime())) return "";

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd}`;
  }

  /**
   * Date | Timestamp | ISO string -> "MM/DD"
   */
  static convertDateToMMDD(input: any) {
    const date =
      input instanceof Date
        ? input
        : input?.toDate?.() || new Date(input);

    if (!(date instanceof Date) || isNaN(date.getTime())) return null;

    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${mm}/${dd}`;
  }

  /**
   * startDate 기준 다음 targetDay(0=일, ... 6=토)의 Date
   */
  static getNextDate(startDate: Date, targetDay: number): Date {
    const currentDay = startDate.getDay();
    const diff = (targetDay - currentDay + 7) % 7;
    const resultDate = new Date(startDate);
    resultDate.setDate(startDate.getDate() + diff);
    return resultDate;
  }

  /**
   * "오전/오후 HH:MM" | "AM/PM HH:MM" 문자열을 24시간제 시:분으로 파싱
   */
  private static parseAmPmToHM(timeStr: string): { hour: number; minute: number } {
    if (!timeStr || typeof timeStr !== "string") {
      return { hour: 0, minute: 0 };
    }
    const s = timeStr.trim();

    const isPM = /(오후|PM)/i.test(s);
    const isAM = /(오전|AM)/i.test(s);

    const m = s.match(/(\d{1,2})\s*:\s*(\d{2})/);
    if (!m) throw new Error(`Invalid time format: ${timeStr}`);

    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);

    // 12시간 → 24시간
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;

    // period 표기가 없고 0~23시로 들어왔다면 그대로 사용(유연 처리)
    return { hour, minute };
  }

  /**
   * Firebase Timestamp(날짜만, 00:00) + "오전/오후 HH:MM" -> Date
   * - Asia/Seoul 기준의 '그 시각'을 실제 UTC 인스턴트로 변환해 반환
   * - 반환값(Date)은 비교 연산(<=, >=)에 바로 사용 가능
   */
  static getPreciseTime(shiftDate: Timestamp, timeStr: string): Date {
    if (!shiftDate) throw new Error("shiftDate is required");

    // shiftDate를 KST 달력 기준으로 변환하여 년/월/일을 얻는다
    const baseUTC = shiftDate.toDate();
    const kstCal = new Date(
      baseUTC.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
    );
    const year = kstCal.getFullYear();
    const month = kstCal.getMonth();      // 0-based
    const day = kstCal.getDate();

    // "오전/오후 HH:MM" 파싱 → 24시간제
    const { hour, minute } = this.parseAmPmToHM(timeStr || "오전 12:00");

    // KST의 (year,month,day,hour,minute)을 '실제 UTC 인스턴트'로 만들기:
    // KST = UTC+9 → UTC 시간 = KST 시간 - 9시간
    const utcMs = Date.UTC(year, month, day, hour, minute, 0, 0) - 9 * 60 * 60 * 1000;
    return new Date(utcMs);
  }
}
