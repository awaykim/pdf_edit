import { FieldValue, Timestamp } from "@/firebase/config";
import * as db from "@/firebase/db";
import { TimeUtils } from "@/utils/time";
import { ScheduleInput } from "@/types/models";

// 스케줄 업데이트 트랜잭션
export const updateSchedulesTransaction = async ({
  tx, toAdd, toExpire, toUpdate, storeRegularSchedules, uid, storeId, storeName, workerRef, userScheduleRef
}: any) => {
  const newScheduleIds: string[] = [];
  const oldScheduleIds: string[] = [];
  const allExceptionalSchedules: any[] = [];
  for (const s of toExpire) {
    const result = await findExceptionalSchedules(s.docId);
    allExceptionalSchedules.push(...result);
  }
  const now = Timestamp.now()
  // 1. 기존 스케줄 수정
  for (const s of toUpdate) {
    const ref = db.doc(`schedules/${s.docId}`);
    tx.update(ref, {
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  // 2. 기존 스케줄 만료 처리 (endDate 업데이트 & storeRefular~에서 삭제)
  for (const s of toExpire) {
    const ref = db.doc(`schedules/${s.docId}`);
    if (Timestamp.fromDate(s.date) > now) {
      tx.update(ref, {
        isActive: false,
        updatedAt: now
      });
      tx.set(
        userScheduleRef,
        {
          allRecurringSchedules: FieldValue.arrayRemove(s.docId),
        },
        { merge: true }
      );
    } else {
      tx.update(ref, {
        endDate: now,
        updatedAt: now
      });
    }
    oldScheduleIds.push(s.docId);
    for (const ex of allExceptionalSchedules) {
      if (!ex?.scheduleId) continue;
      const exRef = db.doc(`schedules/${ex.scheduleId}`);
      tx.update(exRef, {
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (ex.shiftRequestId) {
        const reqRef = db.doc(`shiftRequests/${ex.shiftRequestId}`);
        tx.update(reqRef, {
          isExpired: true,
          status: "rejected",
        });
        if (ex.matchedWorkerId) {
          const changedScheduleRef = db.doc(`schedules/${ex.shiftRequestId}`);
          tx.update(changedScheduleRef, {
            isActive: false,
            updatedAt: FieldValue.serverTimestamp(),
          });
          const pushRef = db.collection("pushes").doc();
          tx.set(pushRef, {
            type: "worker:expired-shift-request",
            recipient: ex.matchedWorkerId,
            createdAt: FieldValue.serverTimestamp(),
            isRead: false,
            data: { storeName, shiftDate: TimeUtils.convertDateToMMDD(ex.shiftDate), workingTime: ex.workingTime },
          });
        }
      }
    }
  }
  // 3. 새 스케줄 생성
  for (const s of toAdd) {
    // 기준 today: 한국 시간 기준 0시로 초기화
    let today = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
    );
    today.setHours(0, 0, 0, 0);

    let baseDate;
    // s.date가 있으면 Date로 변환
    const sDate = s.date instanceof Date ? s.date : (s.date ? new Date(s.date) : null);

    if (sDate && sDate.getTime() > Date.now()) {
      // s.date가 지금보다 미래면 s.date를 기준
      baseDate = sDate;
    } else {
      // 없거나 과거면 오늘을 기준
      baseDate = today;
    }
    baseDate.setHours(0, 0, 0, 0);

    // 요일 기준 다음 날짜 계산
    const newStartingDate = TimeUtils.getNextDate(baseDate, s.dayOfWeek);
    const newStartingDateStr = TimeUtils.convertToKorDotDate(newStartingDate);

    // Firestore 문서 ref 생성
    const scheduleRef = db.collection("schedules").doc();

    // 트랜잭션 set
    tx.set(scheduleRef, {
      userId: uid,
      storeId,
      storeName: storeName,
      date: newStartingDate,
      dateStr: newStartingDateStr,
      dayOfWeek: s.dayOfWeek,
      workingTime: s.workingTime,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      recurringId: scheduleRef.id,
      status: "default",
      endDate: null,
    });

    newScheduleIds.push(scheduleRef.id);
  }
  const currentActiveSchedules = [
    ...storeRegularSchedules.filter(
      (scheduleId: string) => !oldScheduleIds.includes(scheduleId)
    ),
    ...newScheduleIds,
  ];
  // 4. 워커, 유저 문서 업데이트
  tx.update(workerRef, {
    storeRegularSchedules: currentActiveSchedules,
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (newScheduleIds.length > 0) {
    tx.set(userScheduleRef, {
      allRecurringSchedules: FieldValue.arrayUnion(...newScheduleIds),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

// 새 스케줄 - 원 스케줄 비교하여 추가/만료/업데이트/유지 스케줄 계산
export const diffScheduleList = (oldSchedules: any[], newSchedules: any[]) => {
  const toAdd = [];
  const toExpire = [];
  const toUpdate = [];
  const unchange = [];

    const keyOf = (s: ScheduleInput) => {
    if (!s || s.dayOfWeek == null || !s.workingTime) {
      return "invalid-undefined";
    }
    return `${s.date}-${s.dayOfWeek}-${s.workingTime.start}-${s.workingTime.end}`;
  };

  const oldMap = new Map();
  for (const s of oldSchedules) {
    oldMap.set(keyOf(s), s);
  }

  const matchedOldKeys = new Set();

  // ✅ newSchedules 기준으로 판단
  for (const newS of newSchedules) {
    const key = keyOf(newS);
    const matched = oldMap.get(key);

    if (!matched) {
      toAdd.push(newS);
    } else {
      matchedOldKeys.add(key);
      if (
        newS.dateStr !== matched.dateStr
      ) {
        toUpdate.push({ ...newS, docId: matched.docId });
      } else {
        unchange.push({ ...newS, docId: matched.docId });
      }
    }
  }

  for (const oldS of oldSchedules) {
    const key = keyOf(oldS);
    if (!matchedOldKeys.has(key)) {
      toExpire.push(oldS);
    }
  }

  return { toAdd, toExpire, toUpdate, unchange };
};

// 특정 스케줄(docId)의 exceptional 스케줄(즉, recurringId가 해당 id인 것들) 찾기
export const findExceptionalSchedules = async (recurringId: string) => {
  const snapshot = await db
    .collection("schedules")
    .where("recurringId", "==", recurringId)
    .where("isRecurring", "==", false)
    .where("date", ">", Timestamp.now())
    .get();

  const result = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    let matchedWorkerId = null;
    let shiftDate = null;

    if (data.shiftRequestId) {
      const shiftRequestDoc = await db.doc(`shiftRequests/${data.shiftRequestId}`).get();
      if (shiftRequestDoc.exists) {
        matchedWorkerId = shiftRequestDoc.data()?.matchedWorkerId || null;
        shiftDate = shiftRequestDoc.data()?.shiftDate;
      }
    }

    result.push({
      scheduleId: doc.id,
      shiftDate: shiftDate,
      workingTime: data.workingTime,
      shiftRequestId: data.shiftRequestId || null,
      status: data.status,
      matchedWorkerId,
      userId: data.userId
    });
  }

  return result;
};
