import { Request, Response, NextFunction } from "express";
import { FieldValue } from "@/firebase/config";
import * as db from "@/firebase/db";
import { AppError } from "@/utils/errorParser";
import { TimeUtils } from "@/utils/time";
import { spreadSchedule } from "@/utils/scheduleFommater";
import { getUserName, registerWorkerService } from "@/services/worker";
import { diffScheduleList, findExceptionalSchedules } from "@/services/schedule";
import { updateSchedulesTransaction } from "@/services/schedule";
import { reassignShiftRequests } from "@/services/request";

// 이화여자대학교 가게 storeId 목록 (하드코딩)
// const EWHA_STORE_IDS: string[] = [
//   // TODO: 이화여자대학교 실제 storeId로 교체하세요
//   //"jBqqOFhroycSp6ZRphi9", // TEST용
//   "vsnBVgCjvMHes71nffPc", //dev용
//   "XWfUWc49YN8fj7piiLdn",
// ];

const EWHA_STORE_IDS = process.env.NODE_ENV === "production" ? ["XWfUWc49YN8fj7piiLdn"] : ["vsnBVgCjvMHes71nffPc"];

export const getAllWorkers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.params;

    const workerRef = db.collection(`stores/${storeId}/workers`);
    const worekrsSnap = await workerRef.get();

    const pending: any[] = [];
    const active: any[] = [];
    const retired: any[] = [];
    // 현재 가게의 최종 근무자 id Set (추천 인력 중복 제외용)
    const existingWorkerIds = new Set<string>();

    if (!worekrsSnap.empty) {
      for (const doc of worekrsSnap.docs) {
        const data = doc.data();
        const workerId = doc.id;
        existingWorkerIds.add(workerId);
        const userSnap = await db.doc(`users/${workerId}`).get();
        const name = userSnap.data()?.name;
        const date = TimeUtils.convertTimestampToyyyymm(data.date);
        const endDate = TimeUtils.convertTimestampToyyyymm(data.endDate) || "";

        if (data.isPending) {
          pending.push({ workerId, name })
        } else if (data.isActive) {
          active.push({ workerId, name, date });
        } else {
          retired.push({ workerId, name, date, endDate });
        }
      }
    }

    // 서울 서대문구 가게인 경우 이화여대 추천 인력 조회
    const recommend: any[] = [];
    const storeSnap = await db.doc(`stores/${storeId}`).get();
    const addressName: string = storeSnap.data()?.address_name || "";

    if (addressName.startsWith("서울 서대문구")) {
      for (const ewhaStoreId of EWHA_STORE_IDS) {
        const ewhaWorkersSnap = await db.collection(`stores/${ewhaStoreId}/workers`).get();
        for (const workerDoc of ewhaWorkersSnap.docs) {
          // const workerData = workerDoc.data();
          // // 활성 근무자이고, 현재 가게 근무자가 아닌 경우만
          // if (!workerData.isActive) continue;
          if (existingWorkerIds.has(workerDoc.id)) continue;
          const userSnap = await db.doc(`users/${workerDoc.id}`).get();
          if (!userSnap.exists) continue;
          recommend.push({
            workerId: workerDoc.id,
            name: userSnap.data()?.name || "",
          });
          existingWorkerIds.add(workerDoc.id); // 중복 리스트 방지
        }
      }
    }

    return res.success({ pending, active, retired, recommend });
  } catch (error) {
    console.error("❌ [getAllWorkers] 오류:", error);
    next(error);
  }
};


export const getWorkerSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, workerId } = req.params;

    const draftRef = db.doc(`stores/${storeId}/workers/${workerId}`);

    const draftSnap = await draftRef.get();

    const workerData = draftSnap.data();

    if (!workerData) throw new AppError("WORKER.NOT_FOUND");

    const scheduleIds: string[] = workerData.storeRegularSchedules || [];
    if (scheduleIds.length === 0) {
      return res.success({
        date: TimeUtils.convertTimestampToyyyymm(workerData.date),
        isPrevious: !workerData.isActive,
        schedules: [],
        endDate: TimeUtils.convertTimestampToyyyymm(workerData.endDate),
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
          workingTime: { start: start, end: end },
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
      name: workerData.userName || "",
      createdAt: TimeUtils.convertTimeStampToKSTISOString(workerData?.createdAt),
      schedules: schedules || [],
      date: TimeUtils.convertTimestampToyyyymm(workerData?.date),
      endDate: TimeUtils.convertTimestampToyyyymm(workerData?.endDate) || null,
      isPrevious: workerData?.isPrevious || false,
    });
  } catch (error) {
    console.error("❌ 알바생 드래프트 불러오기 오류:", error);
    next(error);
  }
};

export const confirmWorker = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, workerId } = req.params;
    const { date, endDate = "", schedules = [], isPrevious } = req.body;

    const workerRef = db.doc(`stores/${storeId}/workers/${workerId}`);
    const userScheduleRef = db.doc(`users/${workerId}/schedules/all`);

    const workerSnap = await workerRef.get();
    if (!workerSnap.exists) throw new AppError("WORKER.NOT_FOUND");

    const workerData = workerSnap.data();
    if (!workerData) throw new AppError("WORKER.NOT_FOUND")
    if (!workerData.isPending) throw new AppError("WORKER.NOT_PENDING");

    const prevScheduleIds: string[] = workerData.storeRegularSchedules || [];

    await db.runTransaction(async (tx) => {
      if (prevScheduleIds.length > 0) {
        for (const scheduleId of prevScheduleIds) {
          const scheduleRef = db.doc(`schedules/${scheduleId}`);
          tx.delete(scheduleRef);
        }
      }

      const hireDateStamp = TimeUtils.yyyymmToTimestamp(date);
      const quitDateStamp = endDate ? TimeUtils.yyyymmToTimestamp(endDate) : null;
      const hireDate = hireDateStamp.toDate();

      const userSnap = await db.doc(`users/${workerId}`).get();
      const userName = userSnap.data()?.name || "";

      const storeSnap = await db.doc(`stores/${storeId}`).get();
      const storeData = storeSnap.data()!;
      const storeName = storeData.place_name || "unknown";
      const address = storeData.road_address_name || storeData.address_name || "unknown address";
      const managerId = storeData.managerId || "";

      const separatedSchedules = spreadSchedule(schedules, hireDate);

      registerWorkerService(tx, {
        storeId,
        userId: workerId,
        userName,
        date: hireDateStamp,
        endDate: quitDateStamp || null,
        storeName,
        address,
        separatedSchedules,
        isPrevious,
        managerId,
        isNew: false, // 사장이 컨펌한 거니까 isPending false 처리됨
      });
    });
    await reassignShiftRequests(storeId, workerId);

    console.log(`✅ [confirmWorker] 근무자 스케줄 등록 완료! 가게: ${storeId} 알바 유저: ${workerId}`);
    return res.success({ message: "근무자 스케줄 등록완료" });
  } catch (error) {
    console.error("❌ [confirmWorker] 오류:", error);
    next(error);
  }
};

export const rejectWorker = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, workerId } = req.params;

    const workerRef = db.doc(`stores/${storeId}/workers/${workerId}`);
    const userStoreRef = db.doc(`users/${workerId}/stores/${storeId}`);
    const userScheduleRef = db.doc(`users/${workerId}/schedules/all`);

    const workerSnap = await workerRef.get();
    if (!workerSnap.exists) throw new AppError("WORKER.NOT_FOUND");

    const workerData = workerSnap.data();
    if (!workerData) throw new AppError("WORKER.NOT_FOUND");
    if (!workerData.isPending) throw new AppError("WORKER.NOT_PENDING");

    const prevScheduleIds: string[] = workerData.storeRegularSchedules || [];

    await db.runTransaction(async (tx) => {
      // 1. 기존 스케줄 문서 삭제


      // 2. 유저 전체 스케줄 목록에서 삭제
      if (prevScheduleIds.length > 0) {
        for (const scheduleId of prevScheduleIds) {
          const scheduleRef = db.doc(`schedules/${scheduleId}`);
          tx.delete(scheduleRef);
        }
        tx.set(
          userScheduleRef,
          {
            allRecurringSchedules: FieldValue.arrayRemove(...prevScheduleIds),
          },
          { merge: true }
        );
      }

      // 3. workers 문서 삭제
      tx.delete(workerRef);

      // 4. users/{uid}/stores/{storeId} 문서 삭제
      tx.delete(userStoreRef);
    });

    console.log(`✅ [rejectWorker] 알바 스케줄 초안 삭제 완료! 가게: ${storeId}, 유저: ${workerId}`);
    return res.success({ message: "알바생 스케줄 초안이 삭제되었습니다." });
  } catch (err: any) {
    console.error("❌ [rejectWorker] 오류:", err);
    next(err)
  }
};

export const getExpireSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");
    const { storeId, workerId } = req.params;

    const { schedules, date, retire } = req.body;
    if (!storeId || !schedules || !date) throw new AppError("SYSTEM.INVALID_INPUT");

    const workerRef = db.doc(`stores/${storeId}/workers/${workerId}`);
    const workerSnap = await workerRef.get();
    if (!workerSnap.exists) throw new AppError("STORE.NOT_A_WORKER");

    const workerData = workerSnap.data();
    const storeRegularSchedules = workerData?.storeRegularSchedules || [];
    const hireDateStamp = TimeUtils.yyyymmToTimestamp(date);
    const hireDate = hireDateStamp.toDate();

    if (retire) {

    }
    // 1. 기존 스케줄 로드
    const existingDocs = await Promise.all(storeRegularSchedules.map((id: string) => db.doc(`schedules/${id}`).get()));
    const oldSchedules = existingDocs
      .filter((doc) => doc.exists) // 존재하지 않는 문서는 패스
      .map((doc: any) => {
        const d = doc.data();
        return {
          docId: doc.id,
          userId: uid,
          storeId,
          dayOfWeek: d?.dayOfWeek,
          date: d?.date?.toDate?.() ?? null,
          dateStr: d?.dateStr ?? null,
          workingTime: d?.workingTime ?? null,
        };
      });

    // 2. 새로운 스케줄 전개
    const newSchedules = spreadSchedule(schedules, hireDate);

    // 3. toExpire 목록 계산
    const { toExpire } = diffScheduleList(oldSchedules, newSchedules);
    const toExpireIds = toExpire.map(s => s.docId);

    // 4. 각 toExpire 스케줄에 대한 예외 스케줄 찾기
    const allExceptionals = await Promise.all(toExpireIds.map(findExceptionalSchedules));
    const flattened = allExceptionals.flat();

    // 5. 가공 후 리턴
    const result = await Promise.all(
      flattened.map(async (ex) => {
        const workerName = ex.userId ? await getUserName(ex.userId) : "";
        const matchedName = ex.matchedWorkerId ? await getUserName(ex.matchedWorkerId) : "";
        const { start, end } = TimeUtils.convertNumToKorString(ex.workingTime);



        return {
          scheduleId: ex.scheduleId,
          date: TimeUtils.convertDateToMMDD(ex.shiftDate),
          workingTime: { start, end },
          status: ex.status,
          workerId: ex.userId,
          workerName,
          matchedWorkerId: ex.matchedWorkerId,
          matchedName,
          shiftRequestId: ex.shiftRequestId,
        };
      })
    );


    return res.success({ toExpire: result });
  } catch (error) {
    console.error("❌ [getExpireSchedule] 오류:", error);
    return next(error);
  }
};

export const retireWorker = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");
    const { storeId, workerId } = req.params;

    if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT");

    const workerRef = db.doc(`stores/${storeId}/workers/${workerId}`);
    const storeSnap = await db.doc(`stores/${storeId}`).get();
    const storeName = storeSnap.data()?.place_name || "?";
    const workerSnap = await workerRef.get();

    const worksSpaceRef = db.doc(`users/${workerId}/stores/${storeId}`);

    if (!workerSnap.exists) throw new AppError("USER.NOT_FOUND");

    const { storeRegularSchedules = [] } = workerSnap.data() as { storeRegularSchedules?: string[] };

    await db.runTransaction(async (tx) => {
      const now = FieldValue.serverTimestamp();

      // 1. 정규 스케줄 비활성화 처리
      for (const scheduleId of storeRegularSchedules) {
        const scheduleRef = db.doc(`schedules/${scheduleId}`);
        tx.update(scheduleRef, {
          endDate: now,
          updatedAt: now,
        });

        // 2. 예외 스케줄 비활성화
        const exceptionals = await findExceptionalSchedules(scheduleId);
        for (const ex of exceptionals) {
          const exRef = db.doc(`schedules/${ex.scheduleId}`);
          tx.update(exRef, { isActive: false });

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
                updatedAt: now,
              });
              const pushRef = db.collection("pushes").doc();

              tx.set(pushRef, {
                type: "worker:expired-shift-request",
                recipient: ex.matchedWorkerId,
                createdAt: now,
                isRead: false,
                data: { storeName, shiftDate: TimeUtils.convertDateToMMDD(ex.shiftDate), workingTime: ex.workingTime },
              });
            }
          }
        }
      }

      // 3. 워커 문서 비활성화
      tx.update(workerRef, {
        isActive: false,
        updatedAt: now,
        endDate: now,
        storeRegularSchedules: [],
      });

      tx.update(worksSpaceRef, {
        isActive: false,
        updatedAt: now,
        endDate: now,
      })
    });

    return res.success({ "message": "근무 이력을 성공적으로 비활성화했습니다." });
  } catch (error: unknown) {
    console.error("❌ [retireStore] 오류:", error);
    next(error);
  }
}

export const updateWorkerSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");

    const { storeId, workerId } = req.params;
    const { date: inputDate, endDate: inputEndDate, schedules } = req.body;
    if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT.STOREID");
    const storeRef = db.doc(`stores/${storeId}`);
    const storeSnap = await storeRef.get();
    const storeName = storeSnap.data()?.place_name;
    const workerRef = db.doc(`stores/${storeId}/workers/${workerId}`);
    const workerSnap = await workerRef.get();
    if (!workerSnap.exists || !workerSnap.data()) throw new AppError("STORE.NOT_A_WORKER");
    const workerData = workerSnap.data();
    const storeRegularSchedules = workerData?.storeRegularSchedules || [];
    const userScheduleRef = db.doc(`users/${workerId}/schedules/all`);
    const userStoreRef = db.doc(`users/${uid}/stores/${storeId}`);

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

    // schedules가 있으면 기존 diff/add/update 로직 실행
    if (schedules) {
      const hireDateStamp = inputDate ? TimeUtils.yyyymmToTimestamp(inputDate) : workerData?.date;
      const hireDate = hireDateStamp.toDate();
      const newSchedules = spreadSchedule(schedules, hireDate);
      const existingDocs = await Promise.all(storeRegularSchedules.map((id: string) => db.doc(`schedules/${id}`).get()));
      const oldSchedules = existingDocs
        .filter((doc) => doc.exists) // 존재하지 않는 문서는 패스
        .map((doc: any) => {
          const d = doc.data();
          return {
            docId: doc.id,
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
          tx, toAdd, toExpire, toUpdate, storeRegularSchedules, uid: workerId, storeId, storeName, workerRef, userScheduleRef
        });
      });
    }

    return res.success({ message: "스케줄이 성공적으로 업데이트 되었습니다." });
  } catch (error: unknown) {
    console.error("❌ [updateMySchedule] 오류:", error);
    next(error);
  }
};

/**
 * 매니저가 특정 알바생의 근무지 목록을 조회
 * GET /manager/worker/:workerId/workplaces
 *
 * users/{workerId}/stores 컬렉션을 기반으로 각 가게 정보와 합쳐 반환합니다.
 */
export const getWorkerWorkplaces = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");

    const { workerId } = req.params;
    if (!workerId) throw new AppError("SYSTEM.INVALID_INPUT");

    const userStoreRef = db.collection(`users/${workerId}/stores`);
    const workSpaceSnap = await userStoreRef.get();

    if (workSpaceSnap.empty) {
      return res.success([]);
    }

    const workplaces = await Promise.all(
      workSpaceSnap.docs.map(async (doc) => {
        const workSpaceData = doc.data();
        const storeId = doc.id;
        const storeSnap = await db.doc(`stores/${storeId}`).get();
        const storeData = storeSnap.data();

        return {
          storeId,
          storeName: storeData?.place_name || storeData?.name || workSpaceData?.storeName || "",
          isActive: workSpaceData?.isActive || false,
          isPending: workSpaceData?.isPending || false,
          isClosed: storeData?.isClosed || false,
          hasManager: !!storeData?.managerId,
          category: storeData?.category_group_name || "",
          date: TimeUtils.convertTimestampToyyyymm(workSpaceData?.date) || "",
          endDate: TimeUtils.convertTimestampToyyyymm(workSpaceData?.endDate) || null,
          isRecommend: workSpaceData?.isRecommend || false,
        };
      })
    );

    // 활성 근무지 먼저, 그다음 과거 순
    workplaces.sort((a, b) => {
      if (a.isActive === b.isActive) return 0;
      return a.isActive ? -1 : 1;
    });

    console.log(`✅ [getWorkerWorkplaces] workerId=${workerId}, 근무지 수=${workplaces.length}`);
    return res.success(workplaces);
  } catch (error) {
    console.error("❌ [getWorkerWorkplaces] 오류:", error);
    next(error);
  }
};

