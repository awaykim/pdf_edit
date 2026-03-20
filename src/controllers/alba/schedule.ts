import { Request, Response, NextFunction } from "express";

import { FieldValue } from "@/firebase/config";
import * as db from "@/firebase/db";
import { registerWorkerService, getOrCreateStoreService } from "@/services/worker";
import { diffScheduleList, updateSchedulesTransaction } from "@/services/schedule";
import { reassignShiftRequests } from "@/services/request";
import { TimeUtils } from "@/utils/time";
import { spreadSchedule } from "@/utils/scheduleFommater";
import { AppError } from "@/utils/errorParser";

export const registerToStore = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.uid) throw new AppError("USER.NOT_AUTHENTICATED");
    const { uid: userId } = req.user;
    let { storeId = "", map, date, isPrevious, endDate = null, schedules = [] } = req.body;
    if (!date) throw new AppError("SYSTEM.INVALID_INPUT");

    let hireDateStamp = null;
    let quitDateStamp = null;
        
    try {
      hireDateStamp = TimeUtils.yyyymmToTimestamp(date);
      quitDateStamp = endDate ? TimeUtils.yyyymmToTimestamp(endDate) : null;
    } catch (err) {
      throw new AppError("SCHEDULE.INVALID_DATE");
    }

    let storeName = "";
    let address = "";
    let managerId = "";

    if (!storeId) {
      if (!map?.id) throw new AppError("SYSTEM.INVALID_INPUT");
      await db.runTransaction(async (tx) => {
        storeId = await getOrCreateStoreService(tx, map);
      });
    } 
    const storeSnap = await db.doc(`stores/${storeId}`).get();
    const storeData = storeSnap.data();
    storeName = storeData?.place_name || map.place_name;
    address = storeData?.road_address_name || storeData?.address_name || map.road_address_name || map.address_name || "unknown address";
    managerId = storeData?.managerId || "";


    // 등록 여부 확인
    const existingWorkerDoc = await db.doc(`stores/${storeId}/workers/${userId}`).get();
    if (existingWorkerDoc.exists) throw new AppError("STORE.ALREADY_REGISTERED");

    const userSnap = await db.doc(`users/${userId}`).get();
    const userName = userSnap.data()?.name || "";

    const hireDate = hireDateStamp.toDate();

    let separatedSchedules: any[] = [];
    if (schedules) separatedSchedules = spreadSchedule(schedules, hireDate);

    await db.runTransaction(async (tx) => {
      registerWorkerService(tx, {
        storeId,
        userId,
        userName,
        date: hireDateStamp,
        endDate: quitDateStamp || null,
        storeName,
        address,
        separatedSchedules,
        isPrevious,
        managerId,
        isNew: true,
      });
    });

    if (storeId && !managerId) await reassignShiftRequests(storeId, userId);

    console.log(`✅ [registerMyScheduleToStore] 근무지 등록 완료! 가게: ${storeName}, 유저: ${userId}`);
    return res.success({ storeId });
  } catch (error: unknown) {
    console.error("❌ [registerMyScheduleToStore] 오류:", error);
    next(error);
  }
};

export const getMySchedules = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");

    // ✅ 1. 정기 스케줄 조회
    const recurringScheduleRef = db.doc(`users/${uid}/schedules/all`);
    const recurringSnap = await recurringScheduleRef.get();
    const recurringIds: string[] = recurringSnap.exists
      ? recurringSnap.data()?.allRecurringSchedules ?? []
      : [];

    const recurringDocs = recurringIds.length > 0
      ? await Promise.all(recurringIds.map((id) => db.doc(`schedules/${id}`).get()))
      : [];

    const rawRecurringSchedules = recurringDocs.map((doc) => {
      const data = doc.data();
      if (!data) return null;

      return {
        scheduleId: doc.id,
        dayOfWeek: data.dayOfWeek ?? null,
        storeId: data.storeId,
        date: TimeUtils.convertTimeStampToKSTISOString(data.date),
        workingTime:  TimeUtils.convertNumToKorString(data.workingTime),
        status: data.status,
        isRecurring: true,
        recurringId: data.recurringId ?? null,
        storeName: data.storeName,
        endDate: TimeUtils.convertTimeStampToKSTISOString(data.endDate),
      };
    }).filter(Boolean);

    // ✅ 2. 예외 스케줄 조회
    const exceptionSnap = await db
      .collection("schedules")
      .where("isRecurring", "==", false)
      .where("userId", "==", uid)
      .where("isActive", "==", true)
      .get();

    const rawExceptionalSchedules = await Promise.all(
      exceptionSnap.docs.map(async (doc) => {
        const data = doc.data();
        const {
          dayOfWeek,
          date,
          workingTime,
          storeId,
          isRecurring,
          isActive,
          recurringId,
          storeName,
          endDate,
          shiftRequestId,
          status
        } = data;

        let matchedId = "";
        let matchedName = "";
        let statusName = data.status

        const targetRequestId = (data.status === "approved" || data.status === "accepted") ? doc.id : shiftRequestId;
        if (targetRequestId) {
          const requestSnap = await db.doc(`shiftRequests/${targetRequestId}`).get();
          const requestData = requestSnap.exists ? requestSnap.data() : null;
          if (requestData) {
            matchedId =
              (data.status === "approved" || data.status === "accepted") ? requestData.userId : requestData.matchedWorkerId;
          }
        }

        if (matchedId) {
          const partnerSnap = await db.doc(`users/${matchedId}`).get();
          matchedName = partnerSnap.exists ? partnerSnap.data()?.name ?? "" : "";
        }


        if (data.isQuick && status !== "requested") statusName = "urgentAccepted";
        return {
          scheduleId: doc.id,
          dayOfWeek: dayOfWeek ?? null,
          date: TimeUtils.convertTimeStampToKSTISOString(date),
          workingTime:  TimeUtils.convertNumToKorString(data.workingTime),
          status: statusName || data.status,
          storeId,
          isQuick: data.isQuick || false,
          isRecurring,
          recurringId: recurringId ?? null,
          storeName,
          isActive,
          endDate: TimeUtils.convertTimeStampToKSTISOString(endDate),
          matchedId,
          matchedName,
        };
      })
    );

    // ✅ 3. 모든 storeId 수집 (중복 제거)
    const allSchedules = [...rawRecurringSchedules, ...rawExceptionalSchedules];
    const uniqueStoreIds = [...new Set(allSchedules.map(s => s?.storeId).filter(Boolean))];

    // ✅ 4. storeId → hasManager 맵 만들기
    const storeSnaps = await Promise.all(
      uniqueStoreIds.map((storeId) => db.doc(`stores/${storeId}`).get())
    );

    const storeHasManagerMap: Record<string, boolean> = {};
    storeSnaps.forEach((snap, idx) => {
      const data = snap.data();
      const managerId = data?.managerId;
      const storeId = uniqueStoreIds[idx];
      storeHasManagerMap[storeId] = !!(managerId && managerId !== "");
    });

    // ✅ 5. hasManager 병합
    const recurringSchedules = rawRecurringSchedules.map(s => ({
      ...s,
      hasManager: storeHasManagerMap[s?.storeId] ?? false
    }));

    const exceptionalSchedules = rawExceptionalSchedules.map(s => ({
      ...s,
      hasManager: storeHasManagerMap[s.storeId] ?? false
    }));

    return res.success({ recurringSchedules, exceptionalSchedules });
  } catch (error: unknown) {
    console.error("❌ [getMySchedules] 오류:", error);
    next(error);
  }
};

export const getMyScheduleInStore = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    const storeId = req.query.storeId as string;

    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");
    if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT");

    const workerRef = db.doc(`stores/${storeId}/workers/${uid}`);
    const workerSnap = await workerRef.get();

    if (!workerSnap.exists) throw new AppError("STORE.NOT_A_WORKER");

    const workerData = workerSnap.data();
    if (!workerData) throw new AppError("STORE.WORKER_DATA_NOT_FOUND");

    const scheduleIds: string[] = workerData.storeRegularSchedules || [];


    if (workerData.isPending) {
      return res.success({
        date: TimeUtils.convertTimestampToyyyymm(workerData.date),
        isPrevious: !workerData.isActive,
        isPending: true,
        schedules: [],
        endDate: TimeUtils.convertTimestampToyyyymm(workerData.endDate) || null,
      });
    }


    if (scheduleIds.length === 0) {
      return res.success({
        date: TimeUtils.convertTimestampToyyyymm(workerData.date),
        isPrevious: !workerData.isActive,
        isPending: false,
        schedules: [],
        endDate: TimeUtils.convertTimestampToyyyymm(workerData.endDate) || null,
      });
    }

    const scheduleDocs = await Promise.all(scheduleIds.map((id: string) => db.doc(`schedules/${id}`).get()));

    // 🔹 workingTime +  기준으로 그룹핑
    const grouped: Record<string, {
      workingTime: { start: string; end: string };
      daysOfWeek: number[];
    }> = {};

    for (const doc of scheduleDocs) {
      const data = doc.data();
      if (!data) continue;

      const { workingTime, dayOfWeek } = data;
      const { start, end } = TimeUtils.convertNumToKorString(workingTime);

      const key = `${start}-${end}`;

      if (!grouped[key]) {
        grouped[key] = {
          workingTime: TimeUtils.convertNumToKorString(workingTime),
          daysOfWeek: [],
        };
      }

      grouped[key].daysOfWeek.push(dayOfWeek);
    }

    const schedules = Object.values(grouped).map((entry, index) => ({
      id: index,
      workingTime: entry.workingTime,
      daysOfWeek: entry.daysOfWeek.sort((a, b) => a - b),
    }));

    return res.success({
      userId: uid,
      date: TimeUtils.convertTimestampToyyyymm(workerData.date) || "알 수 없음",
      isPrevious: false,
      isPending: false,
      schedules,
      endDate: null,
    });
  } catch (error) {
    console.error("❌ [getMyScheduleInStore] 오류:", error);
    next(error);
  }
};

export const updateMySchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");
    const { storeId, date: inputDate, endDate: inputEndDate, schedules } = req.body;
    if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT.STOREID");
    if (!inputDate && !inputEndDate && !schedules) {
      throw new AppError("SCHEDULE.NO_UPDATE_FIELD");
    }

    const storeRef = db.doc(`stores/${storeId}`);
    const workerRef = db.doc(`stores/${storeId}/workers/${uid}`);
    const userScheduleRef = db.doc(`users/${uid}/schedules/all`);
    const userStoreRef = db.doc(`users/${uid}/stores/${storeId}`);
    
    const storeSnap = await storeRef.get();
    const storeName = storeSnap.data()?.place_name;
    const workerSnap = await workerRef.get();
    const workerData = workerSnap.data();
    const storeRegularSchedules = workerData?.storeRegularSchedules || [];
    
    const hireDateStamp = inputDate ? TimeUtils.yyyymmToTimestamp(inputDate) : workerData?.date;
    const hireDate = hireDateStamp.toDate();

    
    // 부분 업데이트 필드 생성
    const updateFields: any = {};
    if (inputDate) updateFields.date = TimeUtils.yyyymmToTimestamp(inputDate);
    if (inputEndDate) updateFields.endDate = TimeUtils.yyyymmToTimestamp(inputEndDate);
    if (Object.keys(updateFields).length === 0 && !schedules) {
      throw new AppError("SCHEDULE.NO_UPDATE_FIELD");
    }
    updateFields.updatedAt = FieldValue.serverTimestamp();

    // 트랜잭션으로 워커 문서 업데이트
    await db.runTransaction(async (tx) => {
      tx.update(workerRef, updateFields);
      tx.update(userStoreRef, updateFields)
    });

    const newSchedules = spreadSchedule(schedules, hireDate);
    const existingRegularSchedules = await Promise.all(storeRegularSchedules.map((id: string) => db.doc(`schedules/${id}`).get()));
    const oldSchedules = existingRegularSchedules
      .map((schedule: any) => {
        const d = schedule.data();
        return {
          docId: schedule.id,
          userId: uid,
          storeId,
          dayOfWeek: d?.dayOfWeek,
          date: d?.date?.toDate?.() ?? null,
          dateStr: d?.dateStr ?? null,
          workingTime: d?.workingTime ?? null,
        };
      });
      const { toAdd, toExpire, toUpdate } = diffScheduleList(oldSchedules, newSchedules);
      await db.runTransaction(async (tx) => {
        await updateSchedulesTransaction({
          tx, toAdd, toExpire, toUpdate, storeRegularSchedules, uid, storeId, storeName, workerRef, userScheduleRef
        });
      });

    return res.success({ message: "스케줄이 성공적으로 업데이트 되었습니다." });
  } catch (error: unknown) {
    console.error("❌ [updateMySchedule] 오류:", error);
    next(error);
  }
};


