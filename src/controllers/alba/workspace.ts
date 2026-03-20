import { Request, Response, NextFunction } from "express";
import * as db from "@/firebase/db";
import { AppError } from "@/utils/errorParser"
import { getOrCreateStoreService, registerWorkerService } from "@/services/worker";
import { TimeUtils } from "@/utils/time";
import { FieldValue, auth } from "@/firebase/config";
import { findExceptionalSchedules } from "@/services/schedule";
import { spreadSchedule } from "@/utils/scheduleFommater";
import { reassignShiftRequests } from "@/services/request";

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

    if (storeId) await reassignShiftRequests(storeId, userId);

    console.log(`✅ [registerMyScheduleToStore] 근무지 등록 완료! 가게: ${storeName}, 유저: ${userId}`);
    return res.success({ storeId });
  } catch (error: unknown) {
    console.error("❌ [registerMyScheduleToStore] 오류:", error);
    next(error);
  }
};

export const convertToManagedStore = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");
    const { storeId } = req.params;
    if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT");

    const storeRef = db.doc(`stores/${storeId}`);
    const storeSnap = await storeRef.get();
    const storeData = storeSnap.data();
    if (!storeData) throw new AppError("STORE.NOT_FOUND");
    const workerRef = db.doc(`stores/${storeId}/workers/${uid}`);
    const storeName = storeData?.place_name || "?";
    const worksSpaceRef = db.doc(`users/${uid}/stores/${storeId}`);
    const workerSnap = await workerRef.get();
    const userName = workerSnap.data()?.userName || workerSnap.data()?.name || "알 수 없는 이름";
    const date = workerSnap.data()?.date;
    const endDate = workerSnap.data()?.endDate || null;
    const isPrevious = !workerSnap.data()?.isActive;
    const { storeRegularSchedules = [] } = workerSnap.data()?.storeRegularSchedules || [];

    let schedules: any[] = []

    // 퇴사 처리
    await db.runTransaction(async (tx) => {
      const now = FieldValue.serverTimestamp();

      // 1. 정규 스케줄 비활성화 처리
      for (const scheduleId of storeRegularSchedules) {
        const scheduleRef = db.doc(`schedules/${scheduleId}`);

        const scheduleSnap = await tx.get(scheduleRef);
        const data = scheduleSnap.data();
        if (!scheduleSnap.exists || !data) continue;
        // endDate가 null인 경우에만 schedules 배열에 추가
        if (!data.endDate) {
          schedules.push({
            date: data.date.toDate(), // Firestore Timestamp → JS Date
            dateStr: data.dateStr,
            dayOfWeek: data.dayOfWeek,
            workingTime: data.workingTime,
            isActive: data.isActive,
            endDate: data.endDate || null,
          });
        }
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

    // 근무 이력 삭제하기  
    const today = new Date();
    const yyyyMMdd = today.toISOString().slice(0, 10).replace(/-/g, '');

    const deletedWorkerRef = db.doc(`stores/${storeId}/deletedWorkers/${storeId}_${yyyyMMdd}`);
    const deletedStoreRef = db.doc(`users/${uid}/deletedStores/${storeId}_${yyyyMMdd}`);
    const schedulesSnap = await db
      .collection("schedules")
      .where("storeId", "==", storeId)
      .where("userId", "==", uid)
      .get();

    const scheduleIds: string[] = [];
    const batch = db.batch();

    schedulesSnap.forEach((doc) => {
      const s = doc.data(); // ✅ 각 문서(doc)에서 data를 가져와야 함
      scheduleIds.push(doc.id);
      if (s.status === "approved") scheduleIds.push(s.shiftRequestId);
      batch.update(doc.ref, { isActive: false });
    });

    // ✅ users/uid/schedules/all에서 배열 제거
    const allScheduleRef = db.doc(`users/${uid}/schedules/all`);
    if (scheduleIds.length > 0) {
      batch.update(allScheduleRef, {
        allRecurringSchedules: FieldValue.arrayRemove(...scheduleIds),
      });
    }

    batch.delete(workerRef);
    batch.delete(worksSpaceRef);
    batch.set(deletedWorkerRef, { deletedAt: today, uid });
    batch.set(deletedStoreRef, { deletedAt: today, storeId });

    await batch.commit();

    // 4. 매니저 매장으로 전환
    const mapId = storeData.mapId;
    if (!mapId) throw new AppError("STORE.INVALID_MAP_ID");

    const storeQuery = await db.collection("stores")
      .where("mapId", "==", mapId)
      .where("isClosed", "==", false)
      .get();

    let managedStoreId = storeId;
    let managerId = "";
    for (const doc of storeQuery.docs) {
      const data = doc.data();
      if (data.managerId && doc.id !== storeId) {
        managerId = data.managerId;
        managedStoreId = doc.id;
        break;
      }
    }

    // 매니저 매장 등록
    await db.runTransaction(async (tx) => {
      registerWorkerService(tx, {
        storeId: managedStoreId,
        userId: uid,
        userName,
        storeName,
        date: date,
        endDate: endDate || null,
        isPrevious,
        address: "",
        managerId,
        isNew: true,
        separatedSchedules: schedules,
      });
    });

    return res.success({ message: "근무 이력을 성공적으로 비활성화하고, 매니저 매장으로 전환하였습니다." });

  } catch (error) {
    console.error("❌ [convertToManagedStore] 오류:", error);
    next(error);
  }
}

// 알바 근무지 정보 조회
export const getStoreInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mapId } = req.query;
    const uid = req.user?.uid || null;

    if (!mapId) throw new AppError("SYSTEM.INVALID_INPUT");

    const storeQuerySnap = await db
      .collection("stores")
      .where("mapId", "==", mapId)
      .where("isActive", "==", true)
      .get();

    if (storeQuerySnap.empty) {
      return res.success({
        storeId: "",
        hasManager: false,
        workerCount: 0,
        isWorker: false,
      });
    }

    let hasManager = false;
    let workerCount = 0;
    let isWorker = false;
    let storeId = "";

    for (const storeDoc of storeQuerySnap.docs) {
      storeId = storeDoc.id;
      if (storeDoc.data().managerId) {
        hasManager = true;
        break;
      }
    }

    try {
      const countSnap = await db.collection('stores').doc(storeId).collection('workers').count().get();
      workerCount = countSnap.data().count;

      if (uid) {
        const workerSnap = await db.doc(`stores/${storeId}/workers/${uid}`).get();
        isWorker = workerSnap.exists;
      }
    } catch (err) {
      console.warn("⚠️ workerCount 또는 isWorker 확인 실패", err);
    }

    return res.success({
      storeId,
      hasManager,
      workerCount,
      isWorker,
    });
  } catch (error) {
    console.error("❌ [getStoreInfo] 오류:", error);
    next(error);
  }
};

export const getManagerInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");

    const { storeId } = req.query as { storeId?: string };
    if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT");

    const storeSnap = await db.doc(`stores/${storeId}`).get();
    if (!storeSnap.exists) throw new AppError("STORE.NOT_FOUND");

    const storeData = storeSnap.data();
    const managerId = storeData?.managerId || "";
    if (!managerId) {
      return res.success({
        managerId: "",
        name: "",
        contact: "",
        email: "",
      });
    }

    const managerSnap = await db.doc(`users/${managerId}`).get();
    const managerData = managerSnap.data();

    let email = managerData?.email || "";
    if (!email) {
      try {
        const userRecord = await auth.getUser(managerId);
        email = userRecord.email || "";
      } catch (error) {
        console.warn("⚠️ [getManagerInfo] manager email 조회 실패:", error);
      }
    }

    return res.success({
      managerId,
      name: managerData?.name || "",
      contact: managerData?.contact || "",
      email,
    });
  } catch (error) {
    console.error("❌ [getManagerInfo] 오류:", error);
    next(error);
  }
};

// 내 근무지 조회
export const getMyWorks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");

    const userStoreRef = db.collection("users").doc(uid).collection("stores");
    const workSpaceSnap = await userStoreRef.get();

    const workSpaces = await Promise.all(
      workSpaceSnap.docs.map(async (doc) => {
        const workSpaceData = doc.data();
        const storeId = doc.id;
        const storeSnap = await db.doc(`stores/${storeId}`).get();
        const storeData = storeSnap.data();

        return {
          storeId,
          storeName: storeData?.name || storeData?.place_name,
          isActive: workSpaceData?.isActive || false,
          isClosed: storeData?.isClosed || false,
          isPending: workSpaceData?.isPending || false,
          hasManager: !!storeData?.managerId || false,
          category: storeData?.category_group_name || "unknown",
          date: TimeUtils.convertTimestampToyyyymm(workSpaceData?.date) || "",
          endDate: TimeUtils.convertTimestampToyyyymm(workSpaceData?.endDate) || null,
        };
      })
    );

    return res.success(workSpaces);
  } catch (error) {
    console.error("🔥 getMyWorks 에러:", error);
    next(error);
  }
};

// 한 근무지에서 일하는 알바생 목록 조회
export const getStoreWorkers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.query;
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");
    if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT");

    const workerRef = db.doc(`stores/${storeId}/workers/${uid}`);
    const workerSnap = await workerRef.get();
    if (!workerSnap.exists) throw new AppError("STORE.NOT_A_WORKER");

    const workersSnap = await db
      .collection(`stores/${storeId}/workers`)
      .orderBy("isActive", "desc")
      .get();

    const workers = await Promise.all(workersSnap.docs.map(async (doc) => {
      const workerId = doc.id;
      const userSnap = await db.doc(`users/${workerId}`).get();
      if (!userSnap.exists) throw new AppError("STORE.NOT_A_WORKER");
      const userData = userSnap.data();

      return {
        name: userData?.name || "알 수 없음.",
        workerId,
        contact: userData?.contact || ""
      };
    }));

    return res.success(workers.filter(worker => worker !== null && worker.workerId !== uid)); // Filter out null values
  } catch (error) {
    console.error("❌ [getStoreWorkers] 오류:", error);
    next(error);
  }
};

// 동료 알바생 조회
export const getCoworkerInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, workerId } = req.query;
    if (!storeId || !workerId) throw new AppError("SYSTEM.INVALID_INPUT");

    // 근무 정보
    const workerRef = db.doc(`users/${workerId}/stores/${storeId}`);
    const workerSnap = await workerRef.get();
    if (!workerSnap.exists) throw new AppError("STORE.NOT_A_WORKER");
    const workerData = workerSnap.data();
    if (!workerData) throw new AppError("STORE.WORKER_DATA_NOT_FOUND");
    const { date, endDate } = workerData;

    // 사용자 정보
    const userRef = db.doc(`users/${workerId}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new AppError("USER.NOT_FOUND");
    const userData = userSnap.data();
    if (!userData) throw new AppError("USER.NOT_FOUND");
    const { name, contact } = userData;

    return res.success({
      name: name || "",
      contact: contact || "",
      date: TimeUtils.convertTimestampToyyyymm(date) || "알 수 없음",
      endDate: TimeUtils.convertTimestampToyyyymm(endDate) || null,
    });
  } catch (error) {
    console.error("❌ [getCoworkerInfo] 오류:", error);
    next(error);
  }
}

// 내 근무지 퇴사 하기 (이전 근무자 처리)
export const retireStore = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");
    const { storeId } = req.params;

    if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT");

    const workerRef = db.doc(`stores/${storeId}/workers/${uid}`);
    const storeSnap = await db.doc(`stores/${storeId}`).get();
    const storeName = storeSnap.data()?.place_name || "?";
    const workerSnap = await workerRef.get();

    const worksSpaceRef = db.doc(`users/${uid}/stores/${storeId}`);

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

// 근무 이력 삭제하기  
export const deleteStore = async (req: Request, res: Response, next: NextFunction) => {
  const { storeId } = req.params;
  if (!req.user || !req.user.uid) throw new AppError("USER.NOT_AUTHENTICATED");
  const { uid } = req.user;
  if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT");

  // ✅ 추가 삭제 작업
  const today = new Date();
  const yyyyMMdd = today.toISOString().slice(0, 10).replace(/-/g, '');

  const workerRef = db.doc(`stores/${storeId}/workers/${uid}`);
  const worksSpaceRef = db.doc(`users/${uid}/stores/${storeId}`);
  const deletedWorkerRef = db.doc(`stores/${storeId}/deletedWorkers/${storeId}_${yyyyMMdd}`);
  const deletedStoreRef = db.doc(`users/${uid}/deletedStores/${storeId}_${yyyyMMdd}`);

  try {
    const workerSnap = await workerRef.get();
    if (workerSnap.exists && workerSnap.data()?.isActive) {
      throw new AppError("STORE.ACTIVE");
    }
    const schedulesSnap = await db
      .collection("schedules")
      .where("storeId", "==", storeId)
      .where("userId", "==", uid)
      .get();

    const scheduleIds: string[] = [];
    const batch = db.batch();

    schedulesSnap.forEach((doc) => {
      const s = doc.data(); // ✅ 각 문서(doc)에서 data를 가져와야 함
      scheduleIds.push(doc.id);
      if (s.status === "approved") scheduleIds.push(s.shiftRequestId);
      batch.update(doc.ref, { isActive: false });
    });


    // ✅ users/uid/schedules/all에서 배열 제거
    const allScheduleRef = db.doc(`users/${uid}/schedules/all`);
    if (scheduleIds.length > 0) {
      batch.update(allScheduleRef, {
        allRecurringSchedules: FieldValue.arrayRemove(...scheduleIds),
      });
    }


    batch.delete(workerRef);
    batch.delete(worksSpaceRef);
    batch.set(deletedWorkerRef, { deletedAt: today, uid });
    batch.set(deletedStoreRef, { deletedAt: today, storeId });

    await batch.commit();

    console.log(`✅ deleteStore 완료 - 비활성화된 schedule 수: ${scheduleIds.length}`);
    return res.success({ "message": "근무 이력 삭제 완료" });
  } catch (error) {
    console.error("❌ [deleteStore] 오류:", error);
    next(error);
  }
};
