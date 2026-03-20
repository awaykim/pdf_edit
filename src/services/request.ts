import { FieldValue, Timestamp } from "@/firebase/config";
import * as db from "@/firebase/db";
import { ScheduleInput } from "@/types/models";
import { TimeUtils } from "@/utils/time";

// 대타 요청 생성
export const requestShiftService = async (
  shiftDate: Date,
  userId: string,
  schedule: {
    storeId: string,
    workingTime: {
      start: number;
      end: number;
    },
    isRecurring?: boolean;
    recurringId?: string;
    scheduleId?: string
  }

) => {
  const shiftDateStr = TimeUtils.convertToKorDotDate(shiftDate);
  const shiftDateObj = new Date(shiftDate);
  shiftDateObj.setHours(0, 0, 0, 0); 
  const shiftDateTimeStamp = Timestamp.fromDate(shiftDateObj);
  const dayOfWeek = shiftDateObj.getDay();
  const workersSnap = await db.collection(`stores/${schedule.storeId}/workers`).get();
  const availableWorkers: string[] = [];

  for (const doc of workersSnap.docs) {
    const workerId = doc.id;
    if (workerId === userId) continue;

    const [isExpAvailable, isRecAvailable] = await Promise.all([
      _checkScheduleAvailable(workerId, schedule.workingTime, { dateStr: shiftDateStr }),
      _checkScheduleAvailable(workerId, schedule.workingTime, { dayOfWeek }),
    ]);

    if (isExpAvailable && isRecAvailable) {
      availableWorkers.push(workerId);
    }
  }

  const storeRef = db.collection("stores").doc(schedule.storeId);
  const storeSnap = await storeRef.get();
  const storeName = storeSnap.data()?.place_name;

  let newScheduleId = "";
  let requestId = "";

  await db.runTransaction(async (tx) => {
    const shiftRequestRef = db.collection("shiftRequests").doc();
    let scheduleRef = null;
    
    // 예외스케줄에 대한 대타요청
    if (schedule.scheduleId && !schedule.isRecurring) {
      scheduleRef = db.collection("schedules").doc(schedule.scheduleId);
      tx.update(scheduleRef, {
        status: "requested",
        updatedAt: FieldValue.serverTimestamp(),
        shiftRequestId: shiftRequestRef.id,
      });
    } else {
      scheduleRef = db.collection("schedules").doc();
      tx.set(scheduleRef, {
        storeName,
        userId: userId,
        date: shiftDateTimeStamp,
        dateStr: shiftDateStr,
        status: "requested",
        isRecurring: false,
        storeId: schedule.storeId,
        workingTime: schedule.workingTime,
        dayOfWeek,
        isActive: true,
        recurringId: schedule.recurringId || "additional-request",
        shiftRequestId: shiftRequestRef.id,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    newScheduleId = scheduleRef.id;

    tx.set(shiftRequestRef, {
      userId: userId,
      scheduleId: newScheduleId,
      storeId: schedule.storeId,
      shiftDate: shiftDateTimeStamp,
      recurringId: schedule.recurringId || "",
      isMatched: false,
      isExpired: false,
      status: "requested",
      storeName,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      matchedWorkerId: "",
      recipients: availableWorkers,
      workingTime: TimeUtils.convertNumToKorString(schedule.workingTime)
    });
    requestId = shiftRequestRef.id;

    for (const workerId of availableWorkers) {
      tx.set(db.doc(`users/${workerId}/shiftNotifications/${requestId}`), {
        requestId,
        shiftDate: shiftDateTimeStamp,
        createdAt: FieldValue.serverTimestamp(),
      });

      const pushNoti = {
        type: "get-shift-request",
        recipient: workerId,
        data: {
          shiftDate: TimeUtils.convertDateToMMDD(shiftDate),
          storeName,
          workingTime: TimeUtils.convertNumToKorString(schedule.workingTime),
        },
        createdAt: FieldValue.serverTimestamp(),
        isRead: false,
      };

      tx.set(db.collection("pushes").doc(), pushNoti);
    }
  });

  return { newScheduleId, requestId };
}

// 나중에 등록한 사람들에게 대타 요청 재할당
export const reassignShiftRequests = async (storeId: string, userId: string) => {
  const batch = db.batch();

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 시/분/초 제거
  const todayTimestamp = Timestamp.fromDate(today);

  const requestQuerySnaps = await db
    .collection("shiftRequests")
    .where("storeId", "==", storeId)
    .where("isExpired", "==", false) 
    .get();


  for (const doc of requestQuerySnaps.docs) {
    const request = doc.data();
    const requestId = doc.id;
    const { scheduleId } = request;

    const scheduleRef = db.doc(`schedules/${scheduleId}`);
    const scheduleSnap = await scheduleRef.get();

    if (!scheduleSnap.exists) {
      console.warn(`⚠️ 스케줄 없음: ${scheduleId}`);
      continue;
    }

    const scheduleData = scheduleSnap.data();

    if (!scheduleData) {
      console.warn(`❌ 스케줄 데이터 없음: requestId=${requestId}`);
      continue;
    }

    const {
      workingTime,
      dayOfWeek,
      date: shiftDateTimeStamp,
      dateStr: shiftDateStr,
      isActive,
      endDate,
    } = scheduleData as ScheduleInput;


    if (endDate || !isActive) {
      console.warn(`🚫 유효하지 않은 스케줄: requestId=${requestId}, isActive=${isActive}, endDate=${endDate}`);
      continue;
    }

    const [isExpAvailable, isRecAvailable] = await Promise.all([
      _checkScheduleAvailable(userId, workingTime, { dateStr: shiftDateStr }),
      _checkScheduleAvailable(userId, workingTime, { dayOfWeek: dayOfWeek }),
    ]);

    if (isExpAvailable && isRecAvailable) {

      const notificationRef = db.doc(`users/${userId}/shiftNotifications/${requestId}`);
      batch.set(notificationRef, {
        requestId,
        shiftDate: shiftDateTimeStamp,
        createdAt: FieldValue.serverTimestamp(),
      });

      const requestRef = db.doc(`shiftRequests/${requestId}`);
      batch.update(requestRef, {
        recipients: FieldValue.arrayUnion(userId),
      });
    } else {
      console.warn(`❌ 스케줄 중복 → userId=${userId}, requestId=${requestId}, exp=${isExpAvailable}, rec=${isRecAvailable}`);
    }
  }

  await batch.commit();
};

/**
 * 근무 가능 여부 체크 (정기/예외 스케줄 모두 포함)
 * @param uid 사용자 ID
 * @param workingTime { start: number, end: number }
 * @param options 
 *  - dayOfWeek: number (정기 스케줄인 경우 필수)
 *  - dateStr: string (예외 스케줄인 경우 필수)
 * @returns true: 가능, false: 겹침
 */
const _checkScheduleAvailable = async (
  uid: string,
  workingTime: { start: number; end: number },
  options: { dayOfWeek?: any; dateStr?: any }
): Promise<boolean> => {
  const { dayOfWeek, dateStr } = options;

  const candidateDays =
    workingTime.end < workingTime.start && typeof dayOfWeek === "number"
      ? [dayOfWeek, (dayOfWeek + 1) % 7]
      : typeof dayOfWeek === "number"
      ? [dayOfWeek]
      : [];

  let scheduleDocs: FirebaseFirestore.DocumentSnapshot[] = [];

  // ✅ 정기 스케줄 조회
  if (typeof dayOfWeek === "number") {
    const scheduleRef = db.doc(`users/${uid}/schedules/all`);
    const scheduleSnap = await scheduleRef.get();

    const scheduleIds =
      scheduleSnap.exists && Array.isArray(scheduleSnap.data()?.allRecurringSchedules)
        ? scheduleSnap.data()!.allRecurringSchedules
        : [];

    if (scheduleIds.length > 0) {
      scheduleDocs = await Promise.all(scheduleIds.map((id: string) => db.doc(`schedules/${id}`).get()));
    }
  }

  // ✅ 예외 스케줄 조회
  else if (typeof dateStr === "string") {
    const snapshot = await db
      .collection("schedules")
      .where("userId", "==", uid)
      .where("dateStr", "==", dateStr)
      .where("isActive", "==", true)
      .get();

    scheduleDocs = snapshot.docs;
  }

  // ✅ 겹침 체크
  for (const doc of scheduleDocs) {
    const s = doc.data();
    if (!s || !s.workingTime) continue;
    if (s.endDate) continue;

    // 정기 스케줄일 경우 요일도 비교
    if (typeof dayOfWeek === "number") {
      if (
        candidateDays.includes(s.dayOfWeek) &&
        _isOverlap(s.workingTime, workingTime)
      ) {
        return false;
      }
    }
    // 예외 스케줄은 날짜가 이미 필터링 되어 있으므로 시간만 비교
    else {
      if (_isOverlap(s.workingTime, workingTime)) {
        return false;
      }
    }
  }

  return true;
};


const _isOverlap = (
  a: { start: number; end: number },
  b: { start: number; end: number }
): boolean => {
  if (![a?.start, a?.end, b?.start, b?.end].every((v) => typeof v === "number")) {
    return false;
  }

  const normalize = ({ start, end }: { start: number; end: number }) =>
    end >= start
      ? [[start, end]]
      : [
          [start, 143],
          [0, end],
        ];

  const aRanges = normalize(a);
  const bRanges = normalize(b);

  return aRanges.some(([aStart, aEnd]) =>
    bRanges.some(([bStart, bEnd]) => aStart <= bEnd && bStart <= aEnd)
  );
};
