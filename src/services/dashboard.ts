import { TimeUtils } from "@/utils/time";
import * as db from "@/firebase/db";
import { AppError } from "@/utils/errorParser";

/**
 * CSV 헤더와 데이터를 CSV 형식으로 변환
 */
function convertToCSV(headers: string[], data: (string | number)[][]): string {
  // 헤더 라인
  const headerLine = headers.map(h => `"${h}"`).join(",");
  
  // 데이터 라인
  const dataLines = data.map(row => 
    row.map(cell => {
      // 쉼표나 따옴표가 있으면 따옴표로 감싸기
      const str = String(cell);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  );

  return [headerLine, ...dataLines].join("\n");
}

/**
 * 요일 숫자를 한글 문자열로 변환 (0: 일, 1: 월, ..., 6: 토)
 */
function getDayOfWeekString(dayOfWeek: number): string {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return days[dayOfWeek % 7] || "정보없음";
}

/**
 * 사용자별 근무 정보 CSV 생성
 * (사용자 기준으로 어디에 일하고 어떤 근무 정보를 가지는지)
 */
export const generateUserWorkingInfoCSV = async (userId: string): Promise<string> => {
  try {
    // 사용자 정보 조회
    const userDoc = await db.doc(`users/${userId}`).get();
    if (!userDoc.exists) {
      throw new AppError("USER.NOT_FOUND");
    }

    const userData = userDoc.data();
    const userName = userData?.name || "정보없음";

    // 사용자의 근무지 정보 조회 (users/uid/stores)
    const userStoresSnap = await db.collection(`users/${userId}/stores`).get();

    const headers = ["userId", "사용자명", "가게명", "근무 시작일", "근무 종료일", "상태", "정규 근무 일정"];
    const rows: (string | number)[][] = [];

    for (const storeDoc of userStoresSnap.docs) {
      const storeData = storeDoc.data();
      const storeName = storeData.storeName || "정보없음";
      const date = storeData.date ? TimeUtils.convertTimeStampToKSTISOString(storeData.date) : "정보없음";
      const endDate = storeData.endDate ? TimeUtils.convertTimeStampToKSTISOString(storeData.endDate) : "현재 근무 중";
      
      const status = storeData.isActive ? "활성" : "비활성";

      // stores/{storeId}/workers/{userId} 에서 정규 근무 일정 조회
      const storeId = storeDoc.id;
      const workerDoc = await db.doc(`stores/${storeId}/workers/${userId}`).get();
      const workerData = workerDoc.data();
      const scheduleIds = workerData?.storeRegularSchedules || [];

      let scheduleInfo = "없음";
      if (scheduleIds.length > 0) {
        const scheduleDocs = await Promise.all(
          scheduleIds.map((id: any) => db.doc(`schedules/${id}`).get())
        );

        const schedules = scheduleDocs
          .filter(doc => doc.exists)
          .map(doc => {
            const data = doc.data();
            const dayOfWeek = getDayOfWeekString(data?.dayOfWeek);
            const { start, end } = TimeUtils.convertNumToKorString(data?.workingTime || {});
            return `${dayOfWeek} ${start}-${end}`;
          });

        scheduleInfo = schedules.join(" | ");
      }

      rows.push([userId, userName, storeName, date, endDate, status, scheduleInfo]);
    }

    // 근무 정보가 없으면 기본 행 추가
    if (rows.length === 0) {
      rows.push([userId, userName, "정보없음", "정보없음", "정보없음", "정보없음", "없음"]);
    }

    return convertToCSV(headers, rows);
  } catch (error) {
    console.error("❌ [generateUserWorkingInfoCSV] 오류:", error);
    throw error;
  }

};

/**
 * 가게별 근무자 정보 CSV 생성
 * (가게 기준으로 어떤 사람들이 일하고 어떤 근무 정보를 가지는지)
 */
export const generateStoreManagingInfoCSV = async (storeId: string): Promise<string> => {
  try {
    // 가게 정보 조회
    const storeDoc = await db.doc(`stores/${storeId}`).get();
    if (!storeDoc.exists) {
      throw new AppError("STORE.NOT_FOUND");
    }

    const storeData = storeDoc.data();
    const storeName = storeData?.place_name || storeData?.storeName || "정보없음";
    const storeCreatedAt = storeData?.createdAt ? TimeUtils.convertTimeStampToKSTISOString(storeData.createdAt) : "정보없음";
    const storePhone = storeData?.phone || "정보없음";
    const managerId = storeData?.managerId || "정보없음";
    const ownerName = storeData?.ownerName || "정보없음";
    const contact = storeData?.contact || "정보없음";
    const categoryGroupName = storeData?.category_group_name || "정보없음";
    const categoryName = storeData?.category_name || "정보없음";
    const xCoord = storeData?.x || "정보없음";
    const yCoord = storeData?.y || "정보없음";
    const placeUrl = storeData?.place_url || "정보없음";

    // 가게의 근무자 정보 조회 (stores/{storeId}/workers)
    const workersSnap = await db.collection(`stores/${storeId}/workers`).get();

    const headers = [
      "storeId", "가게명", "생성일", "전화번호", "매니저ID", "사장명", "연락처", "카테고리그룹명", "카테고리명", "경도", "위도", "장소URL",
      "근무자ID", "근무자명", "근무시작일", "근무종료일", "상태", "정규근무일정"
    ];
    const rows: (string | number)[][] = [];

    if (workersSnap.empty) {
      // 근무자가 없는 경우
      rows.push([
        storeId, storeName, storeCreatedAt, storePhone, managerId, ownerName, contact, categoryGroupName, categoryName, xCoord, yCoord, placeUrl,
        "정보없음", "정보없음", "정보없음", "정보없음", "정보없음", "정보없음"
      ]);
    } else {
      // 근무자들 처리
      for (const workerDoc of workersSnap.docs) {
        const workerId = workerDoc.id;
        const workerData = workerDoc.data();

        // 사용자 정보 조회
        const userDoc = await db.doc(`users/${workerId}`).get();
        const userName = userDoc.data()?.name || "정보없음";

        const date = workerData.date ? TimeUtils.convertTimeStampToKSTISOString(workerData.date) : "정보없음";
        const endDate = workerData.endDate ? TimeUtils.convertTimeStampToKSTISOString(workerData.endDate) : "현재 근무 중";
        const status = workerData.isActive ? "활성" : "비활성";

        // 정규 근무 일정 조회
        const scheduleIds = workerData.storeRegularSchedules || [];
        let scheduleInfo = "없음";

        if (scheduleIds.length > 0) {
          const scheduleDocs = await Promise.all(
            scheduleIds.map((id: any) => db.doc(`schedules/${id}`).get())
          );

          const schedules = scheduleDocs
            .filter(doc => doc.exists)
            .map(doc => {
              const data = doc.data();
              const dayOfWeek = getDayOfWeekString(data?.dayOfWeek);
              const { start, end } = TimeUtils.convertNumToKorString(data?.workingTime || {});
              return `${dayOfWeek} ${start}-${end}`;
            });

          scheduleInfo = schedules.join(" | ");
        }

        // 근무자 행 추가
        rows.push([
          storeId, storeName, storeCreatedAt, storePhone, managerId, ownerName, contact, categoryGroupName, categoryName, xCoord, yCoord, placeUrl,
          workerId, userName, date, endDate, status, scheduleInfo
        ]);
      }
    }

    return convertToCSV(headers, rows);
  } catch (error) {
    console.error("❌ [generateStoreManagingInfoCSV] 오류:", error);
    throw error;
  }
};

/**
 * 모든 사용자의 근무 정보 CSV 생성
 */
export const generateAllUserWorkingInfoCSV = async (): Promise<string> => {
  try {
    const headers = ["userId", "사용자명", "가게명", "근무 시작일", "근무 종료일", "상태", "정규 근무 일정"];
    const rows: (string | number)[][] = [];

    // 모든 사용자 조회
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const userName = userData?.name || "정보없음";

      // 사용자의 근무지 정보 조회 (users/uid/stores)
      const userStoresSnap = await db.collection(`users/${userId}/stores`).get();

      if (userStoresSnap.empty) {
        rows.push([userId, userName, "정보없음", "정보없음", "정보없음", "정보없음", "없음"]);
      } else {
        for (const storeDoc of userStoresSnap.docs) {
          const storeData = storeDoc.data();
          const storeName = storeData.storeName || "정보없음";
          const date = storeData.date ? TimeUtils.convertTimeStampToKSTISOString(storeData.date) : "정보없음";
          const endDate = storeData.endDate ? TimeUtils.convertTimeStampToKSTISOString(storeData.endDate) : "현재 근무 중";
          
          const status = storeData.isActive ? "활성" : "비활성";

          // stores/{storeId}/workers/{userId} 에서 정규 근무 일정 조회
          const storeId = storeDoc.id;
          const workerDoc = await db.doc(`stores/${storeId}/workers/${userId}`).get();
          const workerData = workerDoc.data();
          const scheduleIds = workerData?.storeRegularSchedules || [];

          let scheduleInfo = "없음";
          if (scheduleIds.length > 0) {
            const scheduleDocs = await Promise.all(
              scheduleIds.map((id: any) => db.doc(`schedules/${id}`).get())
            );

            const schedules = scheduleDocs
              .filter(doc => doc.exists)
              .map(doc => {
                const data = doc.data();
                const dayOfWeek = getDayOfWeekString(data?.dayOfWeek);
                const { start, end } = TimeUtils.convertNumToKorString(data?.workingTime || {});
                return `${dayOfWeek} ${start}-${end}`;
              });

            scheduleInfo = schedules.join(" | ");
          }

          rows.push([userId, userName, storeName, date, endDate, status, scheduleInfo]);
        }
      }
    }

    return convertToCSV(headers, rows);
  } catch (error) {
    console.error("❌ [generateAllUserWorkingInfoCSV] 오류:", error);
    throw error;
  }
};

/**
 * 모든 가게의 근무자 정보 CSV 생성
 */
export const generateAllStoreManagingInfoCSV = async (): Promise<string> => {
  try {
    const headers = [
      "storeId", "가게명", "생성일", "전화번호", "매니저ID", "사장명", "연락처", "카테고리그룹명", "카테고리명", "경도", "위도", "장소URL",
      "근무자ID", "근무자명", "근무시작일", "근무종료일", "상태", "정규근무일정"
    ];
    const rows: (string | number)[][] = [];

    // 모든 가게 조회
    const storesSnap = await db.collection("stores").get();

    for (const storeDoc of storesSnap.docs) {
      const storeId = storeDoc.id;
      const storeData = storeDoc.data();
      const storeName = storeData?.place_name || storeData?.storeName || "정보없음";
      const storeCreatedAt = storeData?.createdAt ? TimeUtils.convertTimeStampToKSTISOString(storeData.createdAt) : "정보없음";
      const storePhone = storeData?.phone || "정보없음";
      const managerId = storeData?.managerId || "정보없음";
      const ownerName = storeData?.ownerName || "정보없음";
      const contact = storeData?.contact || "정보없음";
      const categoryGroupName = storeData?.category_group_name || "정보없음";
      const categoryName = storeData?.category_name || "정보없음";
      const xCoord = storeData?.x || "정보없음";
      const yCoord = storeData?.y || "정보없음";
      const placeUrl = storeData?.place_url || "정보없음";

      // 가게의 근무자 정보 조회 (stores/{storeId}/workers)
      const workersSnap = await db.collection(`stores/${storeId}/workers`).get();

      if (workersSnap.empty) {
        rows.push([
          storeId, storeName, storeCreatedAt, storePhone, managerId, ownerName, contact, categoryGroupName, categoryName, xCoord, yCoord, placeUrl,
          "정보없음", "정보없음", "정보없음", "정보없음", "정보없음", "정보없음"
        ]);
      } else {
        // 근무자들 처리
        for (const workerDoc of workersSnap.docs) {
          const workerId = workerDoc.id;
          const workerData = workerDoc.data();

          // 사용자 정보 조회
          const userDoc = await db.doc(`users/${workerId}`).get();
          const userName = userDoc.data()?.name || "정보없음";

          const date = workerData.date ? TimeUtils.convertTimeStampToKSTISOString(workerData.date) : "정보없음";
          const endDate = workerData.endDate ? TimeUtils.convertTimeStampToKSTISOString(workerData.endDate) : "현재 근무 중";
          const status = workerData.isActive ? "활성" : "비활성";

          // 정규 근무 일정 조회
          const scheduleIds = workerData.storeRegularSchedules || [];
          let scheduleInfo = "없음";

          if (scheduleIds.length > 0) {
            const scheduleDocs = await Promise.all(
              scheduleIds.map((id: any) => db.doc(`schedules/${id}`).get())
            );

            const schedules = scheduleDocs
              .filter(doc => doc.exists)
              .map(doc => {
                const data = doc.data();
                const dayOfWeek = getDayOfWeekString(data?.dayOfWeek);
                const { start, end } = TimeUtils.convertNumToKorString(data?.workingTime || {});
                return `${dayOfWeek} ${start}-${end}`;
              });

            scheduleInfo = schedules.join(" | ");
          }

          rows.push([
            storeId, storeName, storeCreatedAt, storePhone, managerId, ownerName, contact, categoryGroupName, categoryName, xCoord, yCoord, placeUrl,
            workerId, userName, date, endDate, status, scheduleInfo
          ]);
        }
      }
    }

    return convertToCSV(headers, rows);
  } catch (error) {
    console.error("❌ [generateAllStoreManagingInfoCSV] 오류:", error);
    throw error;
  }
};

/**
 * 특정 가게의 시프트 요청 정보 CSV 생성
 */
export const generateStoreShiftInfoCSV = async (storeId: string): Promise<string> => {
  try {
    const headers = [
      "storeId", "가게명", "생성일", "전화번호", "매니저ID", "사장명", "연락처", "카테고리그룹명", "카테고리명", "경도", "위도", "장소URL",
      "시프트요청ID", "신청자ID", "신청자명", "매칭근무자ID", "매칭근무자명", "근무시작시간", "근무종료시간", "시프트날짜"
    ];
    const rows: (string | number)[][] = [];

    // 가게 정보 조회
    const storeDoc = await db.doc(`stores/${storeId}`).get();
    if (!storeDoc.exists) {
      throw new AppError("SYSTEM.NOT_FOUND");
    }

    const storeData = storeDoc.data();
    const storeName = storeData?.place_name || storeData?.storeName || "정보없음";
    const storeCreatedAt = storeData?.createdAt ? TimeUtils.convertTimeStampToKSTISOString(storeData.createdAt) : "정보없음";
    const storePhone = storeData?.phone || "정보없음";
    const managerId = storeData?.managerId || "정보없음";
    const ownerName = storeData?.ownerName || "정보없음";
    const contact = storeData?.contact || "정보없음";
    const categoryGroupName = storeData?.category_group_name || "정보없음";
    const categoryName = storeData?.category_name || "정보없음";
    const xCoord = storeData?.x || "정보없음";
    const yCoord = storeData?.y || "정보없음";
    const placeUrl = storeData?.place_url || "정보없음";

    // 해당 가게의 시프트 요청 조회
    const shiftsSnap = await db.collection("shiftRequests").where("storeId", "==", storeId).get();

    if (shiftsSnap.empty) {
      rows.push([
        storeId, storeName, storeCreatedAt, storePhone, managerId, ownerName, contact, categoryGroupName, categoryName, xCoord, yCoord, placeUrl,
        "정보없음", "정보없음", "정보없음", "정보없음", "정보없음", "정보없음", "정보없음", "정보없음"
      ]);
    } else {
      // 시프트 요청별로 행 추가
      for (const shiftDoc of shiftsSnap.docs) {
        const shiftData = shiftDoc.data();
        const shiftId = shiftDoc.id;
        const requesterId = shiftData?.userId || "정보없음";
        const matchedWorkerId = shiftData?.matchedWorkerId || "정보없음";
        const shiftDate = shiftData?.shiftDate ? TimeUtils.convertTimeStampToKSTISOString(shiftData.shiftDate) : "정보없음";

        // 신청자명 조회
        let requesterName = "정보없음";
        if (requesterId !== "정보없음") {
          const requesterDoc = await db.doc(`users/${requesterId}`).get();
          requesterName = requesterDoc.data()?.name || "정보없음";
        }

        // 매칭근무자명 조회
        let matchedWorkerName = "정보없음";
        if (matchedWorkerId !== "정보없음") {
          const matchedWorkerDoc = await db.doc(`users/${matchedWorkerId}`).get();
          matchedWorkerName = matchedWorkerDoc.data()?.name || "정보없음";
        }

        // 근무 시간 추출
        const workingTime = shiftData?.workingTime || {};
        const startTime = workingTime.start || "정보없음";
        const endTime = workingTime.end || "정보없음";

        rows.push([
          storeId, storeName, storeCreatedAt, storePhone, managerId, ownerName, contact, categoryGroupName, categoryName, xCoord, yCoord, placeUrl,
          shiftId, requesterId, requesterName, matchedWorkerId, matchedWorkerName, startTime, endTime, shiftDate
        ]);
      }
    }

    return convertToCSV(headers, rows);
  } catch (error) {
    console.error("❌ [generateStoreShiftInfoCSV] 오류:", error);
    throw error;
  }
};

/**
 * 모든 가게의 시프트 요청 정보 CSV 생성
 */
export const generateAllStoreShiftInfoCSV = async (): Promise<string> => {
  try {
    const headers = [
      "storeId", "가게명", "생성일", "전화번호", "매니저ID", "사장명", "연락처", "카테고리그룹명", "카테고리명", "경도", "위도", "장소URL",
      "시프트요청ID", "신청자ID", "신청자명", "매칭근무자ID", "매칭근무자명", "근무시작시간", "근무종료시간", "시프트날짜"
    ];
    const rows: (string | number)[][] = [];

    // 모든 시프트 요청 조회
    const shiftsSnap = await db.collection("shiftRequests").get();

    if (shiftsSnap.empty) {
      // 시프트 요청이 없으면 모든 가게 정보만 표시
      const storesSnap = await db.collection("stores").get();
      if (storesSnap.empty) {
        rows.push(new Array(20).fill("정보없음"));
      } else {
        for (const storeDoc of storesSnap.docs) {
          const storeId = storeDoc.id;
          const storeData = storeDoc.data();
          const storeName = storeData?.place_name || storeData?.storeName || "정보없음";
          const storeCreatedAt = storeData?.createdAt ? TimeUtils.convertTimeStampToKSTISOString(storeData.createdAt) : "정보없음";
          const storePhone = storeData?.phone || "정보없음";
          const managerId = storeData?.managerId || "정보없음";
          const ownerName = storeData?.ownerName || "정보없음";
          const contact = storeData?.contact || "정보없음";
          const categoryGroupName = storeData?.category_group_name || "정보없음";
          const categoryName = storeData?.category_name || "정보없음";
          const xCoord = storeData?.x || "정보없음";
          const yCoord = storeData?.y || "정보없음";
          const placeUrl = storeData?.place_url || "정보없음";

          rows.push([
            storeId, storeName, storeCreatedAt, storePhone, managerId, ownerName, contact, categoryGroupName, categoryName, xCoord, yCoord, placeUrl,
            "정보없음", "정보없음", "정보없음", "정보없음", "정보없음", "정보없음", "정보없음", "정보없음"
          ]);
        }
      }
    } else {
      // 모든 가게 정보 먼저 맵으로 생성
      const storesSnap = await db.collection("stores").get();
      const storeInfoMap = new Map();

      storesSnap.forEach(storeDoc => {
        const storeId = storeDoc.id;
        const storeData = storeDoc.data();
        storeInfoMap.set(storeId, {
          storeName: storeData?.place_name || storeData?.storeName || "정보없음",
          storeCreatedAt: storeData?.createdAt ? TimeUtils.convertTimeStampToKSTISOString(storeData.createdAt) : "정보없음",
          storePhone: storeData?.phone || "정보없음",
          managerId: storeData?.managerId || "정보없음",
          ownerName: storeData?.ownerName || "정보없음",
          contact: storeData?.contact || "정보없음",
          categoryGroupName: storeData?.category_group_name || "정보없음",
          categoryName: storeData?.category_name || "정보없음",
          xCoord: storeData?.x || "정보없음",
          yCoord: storeData?.y || "정보없음",
          placeUrl: storeData?.place_url || "정보없음"
        });
      });

      // 시프트 요청별로 행 추가
      for (const shiftDoc of shiftsSnap.docs) {
        const shiftData = shiftDoc.data();
        const shiftId = shiftDoc.id;
        const storeId = shiftData?.storeId || "정보없음";
        const requesterId = shiftData?.userId || "정보없음";
        const matchedWorkerId = shiftData?.matchedWorkerId || "정보없음";
        const shiftDate = shiftData?.shiftDate ? TimeUtils.convertTimeStampToKSTISOString(shiftData.shiftDate) : "정보없음";

        // 가게 정보 조회
        const storeInfo = storeInfoMap.get(storeId) || {
          storeName: "정보없음",
          storeCreatedAt: "정보없음",
          storePhone: "정보없음",
          managerId: "정보없음",
          ownerName: "정보없음",
          contact: "정보없음",
          categoryGroupName: "정보없음",
          categoryName: "정보없음",
          xCoord: "정보없음",
          yCoord: "정보없음",
          placeUrl: "정보없음"
        };

        // 신청자명 조회
        let requesterName = "정보없음";
        if (requesterId !== "정보없음") {
          const requesterDoc = await db.doc(`users/${requesterId}`).get();
          requesterName = requesterDoc.data()?.name || "정보없음";
        }

        // 매칭근무자명 조회
        let matchedWorkerName = "정보없음";
        if (matchedWorkerId !== "정보없음") {
          const matchedWorkerDoc = await db.doc(`users/${matchedWorkerId}`).get();
          matchedWorkerName = matchedWorkerDoc.data()?.name || "정보없음";
        }

        // 근무 시간 추출
        const workingTime = shiftData?.workingTime || {};
        const startTime = workingTime.start || "정보없음";
        const endTime = workingTime.end || "정보없음";

        rows.push([
          storeId, storeInfo.storeName, storeInfo.storeCreatedAt, storeInfo.storePhone, storeInfo.managerId,
          storeInfo.ownerName, storeInfo.contact, storeInfo.categoryGroupName, storeInfo.categoryName,
          storeInfo.xCoord, storeInfo.yCoord, storeInfo.placeUrl,
          shiftId, requesterId, requesterName, matchedWorkerId, matchedWorkerName, startTime, endTime, shiftDate
        ]);
      }
    }

    return convertToCSV(headers, rows);
  } catch (error) {
    console.error("❌ [generateAllStoreShiftInfoCSV] 오류:", error);
    throw error;
  }
};
