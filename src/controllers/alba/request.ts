// controllers/alba/request.ts
/**
 * 알바 유저의 대타 요청 프로세스 
 */

import { Request, Response, NextFunction } from "express";
import * as db from "@/firebase/db";
import { FieldValue } from "@/firebase/config";
import { TimeUtils } from "@/utils/time";
import { AppError } from "@/utils/errorParser";
import { requestShiftService } from "@/services/request";
import { ScheduleInput } from '../../types/models';

/**
 * 대타 요청 생성
 * - 스케줄 ID가 있으면 해당 스케줄을 기준으로, 없으면 직접 입력한 매장/근무시간으로 요청을 생성합니다.
 * - 날짜, 로그인 여부 등 기본 유효성 검증을 수행합니다.
 */
export const requestShift = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let { shiftDate, scheduleId = "", storeId = "", workingTime = null } = req.body;

    // 기본 유효성 검증
    if (!req.user || !req.user.uid) throw new AppError("USER.NOT_AUTHENTICATED");
    if (!shiftDate || typeof shiftDate !== "string" || !/^\d{4}\.\d{2}\.\d{2}$/.test(shiftDate)) throw new AppError("REQUEST.INVALID_DATE");
    if (!scheduleId && (!storeId || !workingTime)) throw new AppError("REQUEST.INVALID_INPUT");

    const { uid: userId } = req.user;

    const workerRef = db.doc(`stores/${storeId}/workers/${userId}`);
    const workerSnap = await workerRef.get();

    if (!workerSnap.exists) throw new AppError("STORE.NOT_A_WORKER");

    const workerData = workerSnap.data();
    if (!workerData) throw new AppError("STORE.WORKER_DATA_NOT_FOUND");

    if (workerData.isPending) { throw new AppError("STORE.NOT_A_WORKER") }

    let isRecurring = null;
    let recurringId = "";
    if (workingTime) workingTime = TimeUtils.convertKorStringToNum(workingTime);

    // 스케줄 ID로 요청하는 경우: 중복 요청/상태 검증 후 해당 스케줄 정보로 채움
    if (scheduleId) {
      const scheduleRef = db.collection("schedules").doc(scheduleId);
      const scheduleSnap = await scheduleRef.get();
      const scheduleData = scheduleSnap.data();
      if (!scheduleSnap.exists || !scheduleData) throw new AppError("SCHEDULE.NOT_FOUND");
      // if (!scheduleData.isActive) throw new AppError("SCHEDULE.INVALID_SCHEDULE");
      storeId = scheduleData.storeId;
      workingTime = scheduleData.workingTime;
      isRecurring = scheduleData.isRecurring;
      recurringId = scheduleData.recurringId;
    }


    // "YYYY.MM.DD" → Firestore Timestamp 파싱
    const parsedShiftDate = TimeUtils.parseDateString(shiftDate);

    // 서비스에 위임해 요청/스케줄 생성 트랜잭션 처리
    const { newScheduleId, requestId } = await requestShiftService(parsedShiftDate, userId, {
      storeId,
      workingTime,
      isRecurring,
      recurringId,
      scheduleId
    });


    return res.success({ newScheduleId, requestId });
  } catch (error) {
    console.error("❌ [requestShift] 에러:", error);
    next(error);
  }
};

/**
 * 대타 요청 취소
 * - 요청, 관련 알림, 예외 스케줄을 정리하고 원본 스케줄 상태를 복원합니다.
 */
export const cancelShift = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scheduleId } = req.body;
    if (!req.user || !req.user.uid) throw new AppError("USER.NOT_AUTHENTICATED");
    const { uid } = req.user;
    let originalScheduleId = "";

    const scheduleRef = db.collection("schedules").doc(scheduleId);
    const scheduleSnap = await scheduleRef.get();
    const scheduleData = scheduleSnap.data();

    if (!scheduleSnap.exists || !scheduleData) throw new AppError("SCHEDULE.NOT_FOUND");
    if (scheduleData.status !== "requested") throw new AppError("REQUEST.ALREADY_MATCHED");
    const requestRef = db.collection("shiftRequests").doc(scheduleData.shiftRequestId);
    const requestSnap = await requestRef.get();
    const requestData = requestSnap.data();
    if (!requestSnap.exists || !requestData) throw new AppError("REQUEST.NOT_FOUND");
    originalScheduleId = requestData.recurringId;

    // 관련 문서들을 원자적으로 삭제/업데이트
    await db.runTransaction(async (tx) => {
      const recipients = requestData.recipients || [];
      for (const recipentId of recipients) {
        const notiRef = db
          .collection("users")
          .doc(recipentId)
          .collection("shiftNotifications")
          .doc(scheduleData.shiftRequestId);
        tx.delete(notiRef);
      }

      tx.delete(requestRef);

      if (scheduleData.recurringId) {
        tx.update(scheduleRef, {
          isActive: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(scheduleRef, {
          status: "approved",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    console.log(`✅ [cancelShift] 대타 신청 취소 완료! 스케줄: ${scheduleId} 유저: ${uid}`);
    return res.success({ originalScheduleId });
  } catch (error) {
    console.error("❌ [cancelShift] 에러:", error);
    next(error);
  }
};

/**
 * 대타 지원 수락 처리
 * - 기존 스케줄 상태 변경, 예외 스케줄 생성, 알림 비활성화 및 푸시 발송을 트랜잭션으로 처리합니다.
 */
export const applyShift = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { notiId } = req.body;
    if (!req.user || !req.user.uid) throw new AppError("USER.NOT_AUTHENTICATED");
    const { uid } = req.user;
    if (!notiId) throw new AppError("SYSTEM.INVALID_INPUT");
    const requestRef = db.collection("shiftRequests").doc(notiId);
    const requestSnap = await requestRef.get();
    const requestData = requestSnap.data();
    if (!requestSnap.exists || !requestData) throw new AppError("REQUEST.NOT_FOUND");
    if (requestData.status !== "requested") throw new AppError("REQUEST.ALREADY_MATCHED");

    const originalScheduleRef = db.collection("schedules").doc(requestData.scheduleId);
    const originalScheduleSnap = await originalScheduleRef.get();
    const originalScheduleData = originalScheduleSnap.data();

    if (!originalScheduleSnap.exists || !originalScheduleData) throw new AppError("SCHEDULE.NOT_FOUND");

    const { date, storeId } = originalScheduleData;
    const storeSnap = await db.doc(`stores/${storeId}`).get();
    const managerId = storeSnap.get("managerId") || "";
    const hasManager = !!managerId;

    const shiftStartStr = requestData.workingTime.start;
    const shiftEndStr = requestData.workingTime.end;

    if (originalScheduleData.isQuick) {
      await db.runTransaction(async (transaction) => {
        // ✅ Firestore transaction rule: do ALL reads first, then do writes.
        const recommendList: string[] = requestData.recommend || [];
        const isRecommendAccepted = recommendList.includes(uid);

        // --- READS (must come before any write) ---
        let existingWorkerSnap: FirebaseFirestore.DocumentSnapshot | null = null;
        let userName = "";

        if (isRecommendAccepted) {
          const workerDocRef = db.doc(`stores/${storeId}/workers/${uid}`);
          existingWorkerSnap = await transaction.get(workerDocRef);

          if (!existingWorkerSnap.exists) {
            const userRef = db.doc(`users/${uid}`);
            const userSnap = await transaction.get(userRef);
            userName = userSnap.data()?.name || "";
          }
        }

        // --- WRITES ---
        transaction.update(originalScheduleRef, {
          status: "matched",
          userId: uid,
          isActive: true,
          updatedAt: FieldValue.serverTimestamp(),
        });

        for (const recipient of requestData.recipients || []) {
          const notiRef = db.doc(`users/${recipient}/shiftNotifications/${notiId}`);
          transaction.update(notiRef, {
            isActive: false,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.update(requestRef, {
          status: "matched",
          isExpired: true,
          isMatched: true,
          matchedWorkerId: uid,
        });

        const pushNotiRef = db.collection("pushes").doc();
        transaction.set(pushNotiRef, {
          type: "manager:quick-shift-request",
          recipient: managerId,
          data: {
            shiftDate: TimeUtils.convertDateToMMDD(date),
            storeName: requestData.storeName,
            workingTime: {
              start: shiftStartStr,
              end: shiftEndStr,
            },
          },
          createdAt: FieldValue.serverTimestamp(),
          isRead: false,
        });

        // 이대 상권 이벤트: 추천 인력이 수락한 경우 자동으로 과거 근무자 등록
        if (isRecommendAccepted) {
          const workerDocRef = db.doc(`stores/${storeId}/workers/${uid}`);

          if (!existingWorkerSnap || !existingWorkerSnap.exists) {
            const now = FieldValue.serverTimestamp();

            // stores/{storeId}/workers/{uid} 등록 (과거 근무자: isActive false)
            transaction.set(workerDocRef, {
              createdAt: now,
              updatedAt: now,
              date: originalScheduleData.date, // 이번 근무 날짜
              endDate: originalScheduleData.date, // 과거 근무자이므로 동일 날짜
              isActive: false,
              isPending: false,
              isRecommend: true, // 추천 인력 이벤트로 참여
              userName,
              storeName: requestData.storeName,
              storeRegularSchedules: [],
            });

            // users/{uid}/stores/{storeId} 등록
            const userStoreRef = db.doc(`users/${uid}/stores/${storeId}`);
            transaction.set(userStoreRef, {
              date: originalScheduleData.date,
              endDate: originalScheduleData.date,
              storeName: requestData.storeName,
              isActive: false,
              isPending: false,
              isRecommend: true,
            });

            console.log(`✅ [applyShift] 추천 인력 자동 근무자 등록: storeId=${storeId}, uid=${uid}`);
          }
        }
      });
    } else {
      await db.runTransaction(async (transaction) => {
        // 기존 스케줄 상태 변경
        transaction.update(originalScheduleRef, {
          status: hasManager ? "matched" : "changed",
          updatedAt: FieldValue.serverTimestamp(),
        });

        // 알림 비활성화
        for (const recipient of requestData.recipients || []) {
          const notiRef = db.doc(`users/${recipient}/shiftNotifications/${notiId}`);
          transaction.update(notiRef, {
            isActive: false,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        const newScheduleRef = db.collection("schedules").doc(notiId);
        const pushNotiRef = db.collection("pushes").doc();
        // 새 예외 스케줄 데이터 (수락자 지정)
        const acceptedScheduleData = {
          ...originalScheduleData,
          userId: uid,
          recurringId: null,
          isRecurring: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        // 요청 문서 업데이트 데이터 (매칭/만료 여부 등)
        const updateRequestData = {
          isExpired: !hasManager,
          isMatched: true,
          matchedWorkerId: uid,
          updatedAt: FieldValue.serverTimestamp(),
        }
        // 원요청자에게 매칭 알림 발송
        const pushDataForWorker = {
          type: "worker:match-shift-request",
          recipient: requestData.userId,
          data: {
            shiftDate: TimeUtils.convertDateToMMDD(date),
            storeName: requestData.storeName,
            workingTime: {
              start: shiftStartStr,
              end: shiftEndStr,
            },
          },
          createdAt: FieldValue.serverTimestamp(),
          isRead: false,
        }
        let status = ""

        if (hasManager) status = "accepted";
        else {
          // 사장 승인 필요한 케이스: 사장에게 승인 요청 푸시
          transaction.set(pushNotiRef, {
            type: "manager:match-shift-request",
            recipient: managerId,
            data: {
              shiftDate: TimeUtils.convertDateToMMDD(date),
              storeName: requestData.storeName,
              workingTime: {
                start: shiftStartStr,
                end: shiftEndStr,
              },
            },
            createdAt: FieldValue.serverTimestamp(),
            isRead: false,
          });
          status = "approved";
        }

        transaction.set(newScheduleRef, { ...acceptedScheduleData, status });
        transaction.update(requestRef, { ...updateRequestData, status });
        transaction.set(pushNotiRef, pushDataForWorker);
      });
    }

    console.log(`✅ [applyShift] 대타 지원 완료! 알림: ${notiId} 유저: ${uid}`);
    return res.success({ message: "근무 요청 수락 및 스케줄 등록 완료" });

  } catch (error: any) {
    console.error("❌ applyShift 에러:", error);
    return next(error);
  }
};

/**
 * 내 대타 알림 목록 조회
 * - 유저의 알림 문서들을 요청/스케줄/가게 정보와 병합하여 반환
 * - 날짜 → 근무 시작시간 기준으로 정렬
 */
export const getMyShiftNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.uid) throw new AppError("USER.NOT_AUTHENTICATED");
    const { uid } = req.user;

    const notisSnapshot = await db.collection(`users/${uid}/shiftNotifications`).get();
    const allNotis = notisSnapshot.docs.map((doc) => ({
      id: doc.id,
      isActive: doc.data().isActive,
      ...(doc.data() as { requestId?: string;[key: string]: any }),
    }));
    if (allNotis.length === 0) return res.success({ activeNotis: [], inactiveNotis: [] });

    // 만료 정책 파라미터
    const EXPIRE_IN_DAYS = 2;
    const now = new Date();
    const expireBoundary = new Date(now.getTime() + EXPIRE_IN_DAYS * 24 * 60 * 60 * 1000);

    const active: any = [];
    const inactive: any = [];

    await Promise.all(
      allNotis.map(async (noti) => {
        try {
          if (!noti.requestId) return null;

          const requestRef = db.doc(`shiftRequests/${noti.requestId}`);
          const requestSnap = await requestRef.get();
          const request = requestSnap.data() as any;
          if (!requestSnap.exists || !request) return null;

          const scheduleSnap = await db.doc(`schedules/${request.scheduleId}`).get();
          const schedule = scheduleSnap.data() as any;
          if (!scheduleSnap.exists || !schedule) return null;

          const storeSnap = await db.doc(`stores/${request.storeId}`).get();
          const store = storeSnap.data() as any;
          if (!storeSnap.exists || !store) return null;

          let parsed = {
            id: noti.id,
            requestId: noti.requestId,
            isQuick: request.isQuick ?? false,
            note: request.note || "",
            wage: request.wage || 0,
            isMyShift: request.matchedWorkerId === uid,
            isMatched: request.isMatched ?? false,
            isExpired: request.isExpired ?? true,
            status: request.status,
            createdAt: TimeUtils.convertTimeStampToKSTISOString(request.createdAt) || null,
            updatedAt: TimeUtils.convertTimeStampToKSTISOString(request.updatedAt) || null,
            shiftDate: TimeUtils.convertTimeStampToKSTISOString(request.shiftDate) || null,
            hasManager: !!store.managerId,
            schedule: {
              scheduleId: request.scheduleId,
              userId: schedule.userId,
              storeId: schedule.storeId,
              storeName: schedule.storeName,
              workingTime: TimeUtils.convertNumToKorString(schedule.workingTime)
            },
          };
          const startTime = TimeUtils.getPreciseTime(request.shiftDate, request.workingTime.start)
          const endTime = TimeUtils.getPreciseTime(request.shiftDate, request.workingTime.end)

          const now = new Date();
          const nowStamp = FieldValue.serverTimestamp()

          if (request.isQuick) {
            if (request.status === "canceled") return null;
            if (startTime <= now && !request.isExpired && request.status === "requested") {
              await db.doc(`shiftRequests/${noti.requestId}`).update({
                isExpired: true,
                updatedAt: nowStamp
              })
              parsed = { ...parsed, isExpired: true, updatedAt: now.toISOString() }
              inactive.push(parsed);
            } else if (endTime <= now && request.isMatched) { // 근무 완료 처리
              await db.doc(`shiftRequests/${noti.requestId}`).update({
                isExpired: true,
                status: "matched",
                updatedAt: nowStamp
              })
              parsed = { ...parsed, isExpired: true, status: "matched", updatedAt: now.toISOString() }
              inactive.push(parsed)
            } else {
              if (!request.isExpired) active.push(parsed)
              else inactive.push(parsed)
            }
          } else {
            if (startTime <= expireBoundary) {
              if (request.status === "requested" && !request.isExpired) {
                await db.doc(`shiftRequests/${noti.requestId}`).update({
                  isExpired: true,
                  updatedAt: nowStamp
                })
                parsed = { ...parsed, isExpired: true, updatedAt: now.toISOString() }
                inactive.push(parsed);
              } else if (request.status === "accepted" || request.status === "matched") {
                await db.doc(`shiftRequests/${noti.requestId}`).update({
                  isExpired: true,
                  isMatched: true,
                  status: "approved",
                  updatedAt: nowStamp
                })
                parsed = { ...parsed, isExpired: true, isMatched: true, status: "approved", updatedAt: now.toISOString() }
                inactive.push(parsed);
              }
            } else {
              if (!request.isExpired && request.status === "requested") active.push(parsed)
              else inactive.push(parsed)
            }
          }
        } catch {
          return null;
        }
      })
    );

    const sortByDateAndStart = (a: any, b: any) => {
      const now = new Date().getTime();
      const aDate = new Date(a.shiftDate).getTime();
      const bDate = new Date(b.shiftDate).getTime();

      const aIsPast = aDate < now;
      const bIsPast = bDate < now;

      // 1️⃣ 둘 다 미래거나 현재 → 가까운 순 (오름차순)
      if (!aIsPast && !bIsPast) {
        if (aDate !== bDate) return aDate - bDate;
        const aStart = a.schedule?.workingTime?.startNum ?? 0;
        const bStart = b.schedule?.workingTime?.startNum ?? 0;
        return aStart - bStart;
      }

      // 2️⃣ 하나는 과거, 하나는 미래 → 미래 먼저
      if (aIsPast && !bIsPast) return 1;
      if (!aIsPast && bIsPast) return -1;

      // 3️⃣ 둘 다 과거 → 최근일수록 위로 (내림차순)
      if (aIsPast && bIsPast) {
        if (aDate !== bDate) return bDate - aDate;
        const aStart = a.schedule?.workingTime?.startNum ?? 0;
        const bStart = b.schedule?.workingTime?.startNum ?? 0;
        return aStart - bStart;
      }

      return 0;
    };

    active.sort(sortByDateAndStart);
    inactive.sort(sortByDateAndStart);

    return res.success({ activeNotis: active, inactiveNotis: inactive });
  } catch (error) {
    console.error("❌ [getMyShiftNotifications] 오류:", error);
    next(error);
  }
};

/**
 * 내가 보낸 대타 요청 목록 조회
 * - shiftRequests 컬렉션에서 본인이 생성한 요청을 조회합니다.
 * - Active(진행 중): shiftDate가 오늘 기준으로 미래인 것 
 * - Inactive(완료): shiftDate가 오늘 기준으로 과거인 것 
 * 
 * active: 오늘 날짜 포함 미래
inactive: 오늘 날짜 미포함 과거

[active]
- 변경요청: requested
- 변경요청+사장승인: matched && hasManager
- 변경완료: approved
- 거절: rejected

[inactive]
- 마감: approved
- 거절: rejected
- 이 외: 기간만료
 */
export const getMyRequests = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.uid) throw new AppError("USER.NOT_AUTHENTICATED");
    const { uid } = req.user;

    // 1. 내가 보낸 요청 조회 (최신순 정렬)
    const snapshot = await db.collection("shiftRequests")
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .get();

    if (snapshot.empty) {
      return res.success({ activeNotis: [], inactiveNotis: [] });
    }

    // 2. 데이터 가공 및 필요한 정보(매칭된 유저 이름 등) 병합
    const allRequests = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const shiftDateObj = data.shiftDate.toDate(); // Timestamp -> Date

        // 매칭된 근무자가 있다면 이름 조회 (matchedWorkerId 이용)
        let matchedName = null;
        if (data.matchedWorkerId) {
          const workerSnap = await db.doc(`users/${data.matchedWorkerId}`).get();
          if (workerSnap.exists) {
            matchedName = workerSnap.data()?.name || "알 수 없음";
          }
        }

        // 매장의 managerId 존재 여부 확인
        let hasManager = false;
        try {
          const storeSnap = await db.doc(`stores/${data.storeId}`).get();
          if (storeSnap.exists) {
            const managerId = storeSnap.data()?.managerId;
            hasManager = !!managerId;
          }
        } catch {
          hasManager = false;
        }

        const dayOfWeek = shiftDateObj.getDay();

        return {
          id: doc.id,
          userId: uid,
          scheduleId: data.scheduleId || "",
          status: data.status,
          createdAt: TimeUtils.convertTimeStampToKSTISOString(data.createdAt),
          shiftDate: TimeUtils.convertTimeStampToKSTISOString(data.shiftDate),
          dayOfWeek,
          workingTime: data.workingTime,
          storeId: data.storeId,
          storeName: data.storeName,
          matchedId: data.matchedWorkerId || null,
          matchedName,
          hasManager,
        };
      })
    );

    // 3. Active / Inactive 분류
    // 날짜 기준 
    const active: any[] = [];
    const inactive: any[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayValue = today.getTime();
    allRequests.forEach((reqItem) => {
      const shiftDateValue = (() => {
        if (!reqItem.shiftDate) return NaN;
        const parsed = new Date(reqItem.shiftDate);
        if (Number.isNaN(parsed.getTime())) return NaN;
        parsed.setHours(0, 0, 0, 0); // 날짜 기준 비교를 위해 00:00으로 고정
        return parsed.getTime();
      })();
      const hasValidDate = Number.isFinite(shiftDateValue);
      const isActiveList = hasValidDate && shiftDateValue >= todayValue;

      if (isActiveList) {
        active.push(reqItem);
      } else {
        inactive.push(reqItem);
      }
    });

    const sortByShiftDate = (direction: "asc" | "desc") => (a: any, b: any) => {
      const aDate = a.shiftDate ? new Date(a.shiftDate).getTime() : 0;
      const bDate = b.shiftDate ? new Date(b.shiftDate).getTime() : 0;
      return direction === "asc" ? aDate - bDate : bDate - aDate;
    };

    active.sort(sortByShiftDate("asc"));
    inactive.sort(sortByShiftDate("desc"));

    return res.success({
      activeNotis: active,
      inactiveNotis: inactive,
    });

  } catch (error) {
    console.error("❌ [getMyRequests] 에러:", error);
    next(error);
  }
};

/**
 * 내가 지원해서 매칭된 대타 목록 조회
 */
export const getMyShifts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.uid) throw new AppError("USER.NOT_AUTHENTICATED");
    const { uid } = req.user;

    // 1. 내가 매칭된 요청 조회
    const snapshot = await db.collection("shiftRequests")
      .where("matchedWorkerId", "==", uid)
      .get();

    if (snapshot.empty) {
      return res.success([]);
    }

    // 2. 데이터 가공
    const allShifts = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const shiftDateObj = data.shiftDate.toDate();

        let requesterName = "알 수 없음";
        if (data.userId) {
          const requesterSnap = await db.doc(`users/${data.userId}`).get();
          if (requesterSnap.exists) {
            requesterName = requesterSnap.data()?.name || "알 수 없음";
          }
        }

        let hasManager = false;
        try {
          const storeSnap = await db.doc(`stores/${data.storeId}`).get();
          if (storeSnap.exists) {
            hasManager = !!storeSnap.data()?.managerId;
          }
        } catch {
          hasManager = false;
        }

        const dayOfWeek = shiftDateObj.getDay();

        return {
          id: doc.id,
          userId: data.userId,
          requesterName,
          note: data.note || "",
          wage: data.wage || 0,
          status: data.status,
          isExpired: data.isExpired || false,
          isMatched: data.isMatched || false,
          createdAt: TimeUtils.convertTimeStampToKSTISOString(data.createdAt),
          shiftDate: TimeUtils.convertTimeStampToKSTISOString(data.shiftDate),
          dayOfWeek,
          workingTime: data.workingTime,
          storeId: data.storeId,
          storeName: data.storeName,
          hasManager,
        };
      })
    );

    return res.success(allShifts);

  } catch (error) {
    console.error("❌ [getMyShifts] 에러:", error);
    next(error);
  }
};
