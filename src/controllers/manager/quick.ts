import { Request, Response, NextFunction } from "express";
import { FieldValue } from "@/firebase/config";
import * as db from "@/firebase/db";
import { AppError } from "@/utils/errorParser";
import { TimeUtils } from "@/utils/time";
import { Timestamp } from "firebase-admin/firestore";
import { getStoreName } from "@/services/store";
import { getUserName } from "@/services/worker";

interface RequestQuickBody {
  storeId: string;
  shiftDate: string; // ISO string
  workingTime: { start: string; end: string };
  recipients: string[];
  wage?: number;
  note?: string;        // 긴급 대타 메모
  recommend?: string[]; // 추천 인력 uid 목록 (이대 상권 이벤트)
}

interface SubmitQuickEvaluationBody {
  quickId: string;
  worked: boolean; // 실제 근무 여부
  rating: number; // 만족도 별점 (1~5)
  comment?: string; // 만족도 코멘트
}

export const requestQuick = async (
  req: Request<unknown, unknown, RequestQuickBody>,
  res: Response,
  next: NextFunction
) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");

    const { storeId, shiftDate, workingTime, recipients, wage, note, recommend } = req.body;
    if (!storeId || !shiftDate || !workingTime || !recipients) {
      throw new AppError("SYSTEM.INVALID_INPUT");
    }
    const recommendList = recommend || [];
    const notificationRecipients = Array.from(new Set([...(recipients || []), ...recommendList]));

    const storeName = await getStoreName(storeId);

    const scheduleRef = db.collection("schedules").doc();
    const quickRef = db.collection("shiftRequests").doc(scheduleRef.id);

    const shiftDateStr = TimeUtils.convertToKorDotDate(shiftDate);
    const shiftDateObj = new Date(shiftDateStr);
    shiftDateObj.setHours(0, 0, 0, 0);
    const shiftDateTimeStamp = Timestamp.fromDate(shiftDateObj);

    await db.runTransaction(async (transaction) => {
      const currentTimeStamp = FieldValue.serverTimestamp();

      // 스케줄 생성
      transaction.set(scheduleRef, {
        storeId,
        storeName,
        date: shiftDateTimeStamp,
        dateStr: shiftDate,
        dayOfWeek: shiftDateObj.getDay(),
        endDate: null,
        workingTime: TimeUtils.convertKorStringToNum(workingTime),
        userId: null,
        isQuick: true,
        status: "requested",
        isRecurring: false,
        recurringId: "",
        createdAt: currentTimeStamp,
        updatedAt: currentTimeStamp,
        wage: wage || 0,
      });

      // quick 요청 생성
      transaction.set(quickRef, {
        storeId,
        storeName,
        shiftDate: shiftDateTimeStamp,
        workingTime,
        recipients: notificationRecipients,
        status: "requested",
        createdAt: currentTimeStamp,
        updatedAt: currentTimeStamp,
        isMatched: false,
        isExpired: false,
        isQuick: true,
        managerId: uid,
        recurringId: "",
        scheduleId: scheduleRef.id,
        wage: wage || 0,
        note: note || "",
        recommend: recommendList,
      });

      // push 알림 생성
      notificationRecipients.forEach((r) => {
        const pushRef = db.collection("pushes").doc();
        transaction.set(pushRef, {
          type: "worker:quick-request",
          recipient: r,
          data: {
            storeName,
            shiftDate: TimeUtils.convertDateToMMDD(shiftDateObj),
            workingTime,
          },
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.set(db.doc(`users/${r}/shiftNotifications/${quickRef.id}`), {
          requestId: quickRef.id,
          shiftDate: shiftDateTimeStamp,
          isActive: true,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
    });

    console.log(`✅ [requestQuick] quickId=${quickRef.id} 생성 완료`);
    return res.success({ quickId: quickRef.id });
  } catch (error) {
    console.error("❌ requestQuick 에러:", error);
    return next(error);
  }
};


// 매니저 긴급 대타 요청 알림 조회
export const getQuickNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.params;
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");
    if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT.STOREID");

    const snap = await db
      .collection("shiftRequests")
      .where("storeId", "==", storeId)
      .where("isQuick", "==", true)
      .get();

    const active: any[] = [];
    const inactive: any[] = [];
    const pendingEvaluations: any[] = [];

    const promises = snap.docs.map(async (doc) => {
      const data = doc.data();
      let matchedName = null;
      if (data.matchedWorkerId) {
        matchedName = await getUserName(data.matchedWorkerId);
      }


      const startTime = TimeUtils.getPreciseTime(data.shiftDate, data.workingTime.start)
      const endTime = TimeUtils.getPreciseTime(data.shiftDate, data.workingTime.end)
      let parsed = {
        quickId: doc.id,
        shiftDate: TimeUtils.convertTimeStampToKSTISOString(data.shiftDate),
        dayOfWeek: data.shiftDate.toDate().getDay(),
        workingTime: data.workingTime,
        note: data.note || "",
        status: data.status,
        createdAt: TimeUtils.convertTimeStampToKSTISOString(data.createdAt),
        updatedAt: TimeUtils.convertTimeStampToKSTISOString(data.updatedAt),
        matchedName,
        matchedId: data.matchedWorkerId,
        startTime,
        endTime,
        storeName: data.storeName,
        evaluation: data.evaluation || null,
        wage: data.wage || 0
      };

      const now = new Date();
      const nowStamp = FieldValue.serverTimestamp()

      if (startTime <= now && !data.isExpired && data.status === "requested") {
        await db.doc(`shiftRequests/${doc.id}`).update({
          isExpired: true,
          updatedAt: nowStamp
        })
        inactive.push(parsed);
      } else if (endTime <= now && data.isMatched) {
        let finalEvaluation = data.evaluation || null;
        await db.runTransaction(async (transaction) => {
          const quickRef = db.doc(`shiftRequests/${doc.id}`);
          const quickSnap = await transaction.get(quickRef);
          const quickData = quickSnap.data() as any;
          if (!quickSnap.exists || !quickData) return;

          const latestEndTime = TimeUtils.getPreciseTime(quickData.shiftDate, quickData.workingTime.end);
          if (latestEndTime > now || !quickData.isMatched) return;

          const currentEvaluation = quickData.evaluation || {};
          const isFirstTrigger = !currentEvaluation.requestedAt;

          const nextEvaluation = {
            required: true,
            requestedAt: currentEvaluation.requestedAt || FieldValue.serverTimestamp(),
            isEvaluated: currentEvaluation.isEvaluated ?? false,
            worked: currentEvaluation.worked ?? null,
            rating: currentEvaluation.rating ?? null,
            comment: currentEvaluation.comment ?? "",
            evaluatedAt: currentEvaluation.evaluatedAt ?? null,
            evaluatorId: currentEvaluation.evaluatorId ?? null,
          };

          finalEvaluation = nextEvaluation;

          transaction.update(quickRef, {
            isExpired: true,
            status: "matched",
            evaluation: nextEvaluation,
            updatedAt: FieldValue.serverTimestamp(),
          });

          // 근무 종료 트리거 최초 평가 시점에만 매니저용 팝업/푸시 생성
          if (isFirstTrigger && quickData.managerId) {
            const pushRef = db.collection("pushes").doc();
            transaction.set(pushRef, {
              type: "manager:quick-shift-ended",
              recipient: quickData.managerId,
              data: {
                quickId: doc.id,
                storeName: quickData.storeName,
                shiftDate: TimeUtils.convertDateToMMDD(quickData.shiftDate),
                workingTime: quickData.workingTime,
              },
              isRead: false,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
        });

        parsed = {
          ...parsed,
          status: "matched",
          updatedAt: now.toISOString(),
          evaluation: finalEvaluation,
        };
        inactive.push(parsed)
      } else if (data.status === "matched" || (!data.isExpired && data.status === "requested")) {
        active.push(parsed);
      } else {
        inactive.push(parsed);
      }

      const queueEvaluation = (parsed as any)?.evaluation || {};
      if (endTime <= now && data.isMatched && !queueEvaluation.isEvaluated) {
        pendingEvaluations.push({
          quickId: doc.id,
          workDate: TimeUtils.convertTimeStampToKSTISOString(data.shiftDate),
          workingTime: data.workingTime,
          storeName: data.storeName,
          matchedWorkerId: data.matchedWorkerId || null,
          endTime,
          isEvaluated: false,
        });
      }
    });

    await Promise.all(promises);
    const sortByStartTime = (direction: "asc" | "desc" = "asc") => (a: any, b: any) => {
      const aStart = a.startTime?.getTime?.() ?? 0;
      const bStart = b.startTime?.getTime?.() ?? 0;

      // asc: 오름차순 (과거 -> 미래), desc: 내림차순 (미래 -> 과거)
      return direction === "asc" ? aStart - bStart : bStart - aStart;
    };
    const sortByEndTime = (direction: "asc" | "desc" = "asc") => (a: any, b: any) => {
      const aEnd = a.endTime?.getTime?.() ?? 0;
      const bEnd = b.endTime?.getTime?.() ?? 0;
      return direction === "asc" ? aEnd - bEnd : bEnd - aEnd;
    };

    active.sort(sortByStartTime("asc")); // 가까운 시간순 (과거 -> 미래)
    inactive.sort(sortByStartTime("desc")); // 가까운 시간순 (미래 -> 과거)
    pendingEvaluations.sort(sortByEndTime("asc")); // 과거부터 큐로 적재


    return res.success({ active, inactive, pendingEvaluations });
  } catch (error) {
    console.error("❌ getQuickNotifications 에러:", error);
    return next(error);
  }
};

export const submitQuickEvaluation = async (
  req: Request<unknown, unknown, SubmitQuickEvaluationBody>,
  res: Response,
  next: NextFunction
) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");

    const { quickId, worked, rating, comment } = req.body;
    if (!quickId || typeof worked !== "boolean" || typeof rating !== "number") {
      throw new AppError("SYSTEM.INVALID_INPUT");
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new AppError("SYSTEM.INVALID_INPUT");
    }

    const quickRef = db.doc(`shiftRequests/${quickId}`);
    const quickSnap = await quickRef.get();
    const quickData = quickSnap.data() as any;
    if (!quickSnap.exists || !quickData) throw new AppError("QUICK.NOT_FOUND");
    if (!quickData.isQuick) throw new AppError("SYSTEM.INVALID_INPUT");
    if (quickData.managerId !== uid) throw new AppError("STORE.NOT_MANAGER");

    const currentEvaluation = quickData.evaluation || {};

    await quickRef.update({
      evaluation: {
        required: true,
        requestedAt: currentEvaluation.requestedAt || FieldValue.serverTimestamp(),
        isEvaluated: true,
        worked,
        rating,
        comment: (comment || "").trim(),
        evaluatedAt: FieldValue.serverTimestamp(),
        evaluatorId: uid,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.success({ success: true, quickId });
  } catch (error) {
    console.error("❌ submitQuickEvaluation 에러:", error);
    return next(error);
  }
};


// 긴급 대타 요청 취소
export const cancelQuick = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");

    const { quickId } = req.body;
    if (!quickId) throw new AppError("SYSTEM.INVALID_INPUT.QUICKID");

    const quickRef = db.doc(`shiftRequests/${quickId}`);
    const quickSnap = await quickRef.get();
    const quickData = quickSnap.data();
    if (!quickSnap.exists || !quickData) {
      throw new AppError("QUICK.NOT_FOUND");
    }

    if (quickData.isMatched) {
      throw new AppError("REQUEST.ALREADY_MATCHED");
    }

    await db.runTransaction(async (transaction) => {
      transaction.update(quickRef, {
        status: "canceled",
        isExpired: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      quickData.recipients.forEach((r: string) => {
        const userNotiRef = db.doc(`users/${r}/shiftNotifications/${quickId}`);
        transaction.update(userNotiRef, {
          isActive: false,
        })
      })
    })



    return res.success({ success: true });
  } catch (error) {
    console.error("❌ cancelQuick 에러:", error);
    return next(error);
  }
};
