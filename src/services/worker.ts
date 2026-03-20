import { FieldValue } from "@/firebase/config";
import * as db from "@/firebase/db";
import { Transaction } from "firebase-admin/firestore";
import { MapFromKakao, WorkerInfo } from "@/types/models";

export const getOrCreateStoreService = async (tx: Transaction, map: MapFromKakao) => {
  const mapId = map.id;

  const storeQuery = db.collection("stores").where("mapId", "==", mapId);
  const storeSnap = await storeQuery.get();

  const openStoreDocs = storeSnap.docs.filter(
    (doc) => doc.data().isClosed !== true
  );

  if (openStoreDocs.length > 0) {
    if (openStoreDocs.length === 1) {
      return openStoreDocs[0].id;
    }

    const docWithManager = openStoreDocs.find(
      (doc) => doc.data().managerId !== ""
    );

    if (docWithManager) {
      return docWithManager.id;
    }

    // fallback
    return openStoreDocs[0].id;
  }

  // 새로 생성
  const storeId = db.collection("stores").doc().id;
  const storeRef = db.doc(`stores/${storeId}`);
  tx.set(storeRef, {
    ...map,
    mapId,
    createdAt: FieldValue.serverTimestamp(),
    isClosed: false,
    isActive: true,
    managerId: null,
  });

  return storeId;
};

export const registerWorkerService = (
  tx: Transaction,
  workerInfo: WorkerInfo
) => {
  const {
    storeId,
    userId,
    userName,
    storeName,
    address,
    date,
    endDate,
    separatedSchedules,
    isPrevious,
    managerId,
    isNew
  } = workerInfo;

  const workerRef = db.doc(`stores/${storeId}/workers/${userId}`);
  const userStoreRef = db.doc(`users/${userId}/stores/${storeId}`);

  const isPending = isNew && !!managerId;

  let workerData = {
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    date: date,
    endDate: endDate || null,
    isActive: !isPrevious,
    userName,
    storeName,
    storeRegularSchedules: [] as string[], 
    isPending,
  }


  // 저장 - users/stores
  tx.set(userStoreRef, {
    date: date,
    endDate: endDate,
    storeName,
    isActive: !isPrevious,
    isPending,
  });

  // 3. 정규 스케줄이 있는 경우만 처리
  if (Array.isArray(separatedSchedules) && separatedSchedules.length > 0) {
    const scheduleArray: string[] = [];

    for (const item of separatedSchedules) {
      const scheduleRef = db.collection("schedules").doc();

      tx.set(scheduleRef, {
        userId,
        storeId,
        storeName,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        endDate: null,
        status: "default",
        isRecurring: true,
        recurringId: scheduleRef.id,
        date: item.date,
        dateStr: item.dateStr,
        dayOfWeek: item.dayOfWeek,
        workingTime: item.workingTime,
        isActive: !isPending,
      });

      scheduleArray.push(scheduleRef.id);
    }


    workerData = { ...workerData, storeRegularSchedules: scheduleArray}
    // 5. 사용자 전체 스케줄에 등록
    if (scheduleArray && !isPending) {
      const userScheduleRef = db.doc(`users/${userId}/schedules/all`);
      tx.set(
        userScheduleRef,
        {
          allRecurringSchedules: FieldValue.arrayUnion(...scheduleArray),
        },
        { merge: true }
      );
    }
  }
  tx.set(workerRef, workerData);
  if (isPending) {
    const pushRef = db.collection("pushes").doc();
    tx.set(pushRef, {
      type: "manager:new-worker-join",
      data: {
        workerName: userName,
      },
      recipient: managerId,
      createdAt: FieldValue.serverTimestamp(),
      isRead: false,
    }
    );
  }
};

export const getUserName = async (userId: string): Promise<string> => {
  try {
    if (!userId) return "";
    const userRef = db.doc(`users/${userId}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      console.warn(`⚠️ userId ${userId} not found.`);
      return "";
    }
    return userSnap.get("name") || "";
  } catch (err) {
    console.error(`❌ getUserName error:`, err);
    return "";
  }
};