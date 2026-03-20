import { Request, Response, NextFunction } from "express";
import { FieldValue, Timestamp } from "@/firebase/config";
import { Timestamp as TimestampType } from "firebase-admin/firestore";
import * as db from "@/firebase/db";
import { AppError } from "@/utils/errorParser";
import dayjs from "dayjs";
import { TimeUtils } from "@/utils/time";
import { getUserName } from "@/services/worker";

export const approveShift = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");
    const { requestId } = req.body;
    if (!requestId) throw new AppError("SYSTEM.INVALID_INPUT.STOREID");

    await db.runTransaction(async (transaction) => {
      // 1. 요청 문서 읽기
      const requestRef = db.collection("shiftRequests").doc(requestId);
      const requestSnap = await requestRef.get();
      const requestData = requestSnap.data();
      if (!requestSnap.exists || !requestData) throw new AppError("REQUEST.NOT_FOUND");

      // 2. 스케줄 문서들 참조
      const originalScheRef = db.doc(`schedules/${requestData.scheduleId}`);
      const newScheRef = db.doc(`schedules/${requestId}`); // 예외 스케줄
      
      // 4. 요청 상태 업데이트
      transaction.update(requestRef, {
        isExpired: true,
        status: "approved",
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 5. 예외 스케줄 승인 상태로 업데이트
      transaction.update(newScheRef, {
        status: "approved",
        updatedAt: FieldValue.serverTimestamp(),
      });

      
      transaction.update(originalScheRef, {
        status: "changed",
        updatedAt: FieldValue.serverTimestamp(),
      });
      

      const shiftStartStr = requestData.workingTime.start;
      const shiftEndStr = requestData.workingTime.end;
      const pushNotiData = {
        data: {
          shiftDate: TimeUtils.convertDateToMMDD(requestData.shiftDate),
          storeName: requestData.storeName,
          workingTime: {
            start: shiftStartStr,
            end: shiftEndStr,
          },
        },
        createdAt: FieldValue.serverTimestamp(),
        isRead: false,
      };

      const pushNotiRef1 = db.collection("pushes").doc();
      const pushNotiRef2 = db.collection("pushes").doc();

      transaction.set(pushNotiRef1, {
        ...pushNotiData,
        type: "worker:approved-shift-request",
        recipient: requestData.matchedWorkerId,
      });

      transaction.set(pushNotiRef2, {
        ...pushNotiData,
        type: "worker:changed-shift-request",
        recipient: requestData.userId,
      });
    });

    console.log(`✅ [approveShift] 대타 승인 완료! 알림: ${requestId} 유저: ${uid}`);
    return res.success({ message: "대타 승인 완료" });
  } catch (error) {
    console.error("❌ approveShift 에러:", error);
    return next(error);
  }
};

export const rejectShift = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");

    const { requestId } = req.body;
    if (!requestId) throw new AppError("SYSTEM.INVALID_INPUT.REQUESTID");

    await db.runTransaction(async (transaction) => {
      // 1. 요청 문서
      const requestRef = db.doc(`shiftRequests/${requestId}`);
      const requestSnap = await transaction.get(requestRef);
      const requestData = requestSnap.data();
      if (!requestSnap.exists || !requestData) throw new AppError("REQUEST.NOT_FOUND");

      if (requestData.status !== "accepted") throw new AppError("REQUEST.ALREADY_HANDLED");

      // 2. 기존 스케줄 문서
      const originalScheRef = db.doc(`schedules/${requestData.scheduleId}`);
      const originalSnap = await transaction.get(originalScheRef);
      const originalData = originalSnap.data();
      if (!originalSnap.exists || !originalData) throw new AppError("SCHEDULE.NOT_FOUND");

      // 3. 예외 스케줄 문서
      const newScheRef = db.doc(`schedules/${requestId}`);

      // 요청 상태 변경
      transaction.update(requestRef, {
        isExpired: true,
        status: "rejected",
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 예외 스케줄 삭제
      transaction.update(newScheRef, {
          isActive: false,
          updatedAt: FieldValue.serverTimestamp(),
        });

      // 기존 스케줄 상태 복구
      if (!originalData.recurringId) {
        transaction.update(originalScheRef, {
          status: "approved",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else { 
        transaction.update(originalScheRef, {
          isActive: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } 

      // 푸시 알림 전송
      const shiftStartStr = requestData.workingTime.start;
      const shiftEndStr = requestData.workingTime.end;
      const pushNotiData = {
        data: {
          shiftDate: TimeUtils.convertDateToMMDD(requestData.shiftDate),
          storeName: requestData.storeName,
          workingTime: {
            start: shiftStartStr,
            end: shiftEndStr,
          },
        },
        createdAt: FieldValue.serverTimestamp(),
        isRead: false,
      };

      const pushNotiRef1 = db.collection("pushes").doc();
      const pushNotiRef2 = db.collection("pushes").doc();

      transaction.set(pushNotiRef1, {
        ...pushNotiData,
        type: "worker:rejected-shift-request",
        recipient: requestData.matchedWorkerId,
      });

      transaction.set(pushNotiRef2, {
        ...pushNotiData,
        type: "worker:rejected-shift-request",
        recipient: requestData.userId,
      });
    });


    console.log(`✅ [rejectShift] 대타 거절 완료! 알림: ${requestId} 유저: ${uid}`);
    return res.success({ message: "대타 거절 완료" });
  } catch (error) {
    console.error("❌ rejectShift 에러:", error);
    return next(error);
  }
};

export const getStoreNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.params;
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");

    // 서버 기준 현재 시각(Timestamp)
    const nowTs = Timestamp.now();
    const twoDaysAgoTs = Timestamp.fromMillis(
      nowTs.toMillis() - 2 * 24 * 60 * 60 * 1000
    );

    // 매칭된 요청만 (요구사항 유지)
    const requestSnapshot = await db
      .collection("shiftRequests")
      .where("storeId", "==", storeId)
      .where("isMatched", "==", true)
      .get();

    type StoreNoti = {
      requestId: string;
      isQuick: boolean;
      isMatched: boolean;
      isExpired: boolean;
      status?: string;
      date: string | null;
      expiredAt: string | null;
      workingTime?: { startNum?: number; start?: string; end?: string };
      old: { id: string; name: string };
      matched: { id: string; name: string };
      hasManager?: boolean;
      _raw: {
        docPath: string;
        shiftTs?: TimestampType;
      };
    };

    const docs = requestSnapshot.docs;

    const results = await Promise.all<StoreNoti | null>(
      docs.map(async (doc) => {
        try {
          const data: any = doc.data();
          if (!data) return null;
          if (data.isQuick) return null; // 1) isQuick 패스

          const shiftTs = data.shiftDate;

          const [userName, matchedName] = await Promise.all([
            getUserName(data.userId),
            data.matchedWorkerId ? getUserName(data.matchedWorkerId) : Promise.resolve(""),
          ]);

          const dateStr = TimeUtils.convertTimeStampToKSTISOString(shiftTs) || null;
          const expiredAtStr = data.isExpired && data.updatedAt
            ? TimeUtils.convertTimeStampToKSTISOString(data.updatedAt) || null
            : null;

          return {
            requestId: doc.id,
            isQuick: !!data.isQuick,
            isMatched: !!data.isMatched,
            isExpired: !!data.isExpired,
            status: data.status || "",
            date: dateStr,
            expiredAt: expiredAtStr,
            workingTime: data.workingTime,
            old: { id: data.userId, name: userName || "" },
            matched: { id: data.matchedWorkerId || "", name: matchedName || "" },
            hasManager: !!data.storeManagerId, // 있으면 표시, 없으면 무시
            _raw: {
              docPath: doc.ref.path,
              shiftTs,
            },
          };
        } catch {
          return null;
        }
      })
    );

    const expanded = results.filter(Boolean) as StoreNoti[];

    // 2) 만료 대상: shiftDate ≤ now-2일 && isExpired === false
    const toExpire = expanded.filter((n) => {
      const shiftTs = n._raw.shiftTs;
      if (!shiftTs) return false;
      const isDateExpired = shiftTs.toMillis() <= twoDaysAgoTs.toMillis();
      return !n.isExpired && isDateExpired;
    });

    // 3) Firestore 배치 업데이트 (serverTimestamp)
    if (toExpire.length > 0) {
      // 배치 크기 여유있게 400으로 chunk
      for (let i = 0; i < toExpire.length; i += 400) {
        const chunk = toExpire.slice(i, i + 400);
        const batch = db.batch();
        chunk.forEach((n) => {
          const ref = db.doc(n._raw.docPath);
          batch.set(
            ref,
            {
              isExpired: true,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        });
        await batch.commit();
      }

      // 응답 일관성 위해 메모리 객체도 즉시 갱신
      const idSet = new Set(toExpire.map((n) => n.requestId));
      expanded.forEach((n) => {
        if (idSet.has(n.requestId)) {
          n.isExpired = true;
          // expiredAt은 다음 조회에서 서버타임스탬프가 반영됨
        }
      });
    }

    // 4) 정렬: shiftDate → workingTime.startNum
    expanded.sort((a, b) => {
      const aMs = a._raw.shiftTs?.toMillis() ?? 0;
      const bMs = b._raw.shiftTs?.toMillis() ?? 0;
      if (aMs !== bMs) return aMs - bMs;

      const aStart = a.workingTime?.startNum ?? 0;
      const bStart = b.workingTime?.startNum ?? 0;
      return aStart - bStart;
    });

    // 5) 응답: active = !isExpired, inactive = isExpired
    const activeNotis = expanded.filter((n) => !n.isExpired);
    const inactiveNotis = expanded.filter((n) => n.isExpired);

    return res.success({ activeNotis, inactiveNotis });
  } catch (error) {
    console.error("🔥 getStoreNotifications 에러:", error);
    next(error);
  }
};

export const getStoreIssues = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");

    const { storeId } = req.params;
    const { startDate, endDate } = req.query;

    if (!storeId || !startDate || !endDate) {
      throw new AppError("SYSTEM.INVALID_INPUT");
    }

    const startDateStamp = Timestamp.fromDate(dayjs(startDate as string).startOf("day").toDate());
    const endDateStamp = Timestamp.fromDate(dayjs(endDate as string).endOf("day").toDate());

    // 1. 대타 요청 조회
    const requestSnap = await db
      .collection("shiftRequests")
      .where("storeId", "==", storeId)
      .where("shiftDate", ">=", startDateStamp)
      .where("shiftDate", "<=", endDateStamp)
      .get();

    const userIds = new Set<string>();

    // userId가 없는 문서는 제외
    const requests = requestSnap.docs
      .map((doc) => {
        const data = doc.data() as any;
        if (data.userId) userIds.add(data.userId);
        if (data.matchedWorkerId) userIds.add(data.matchedWorkerId);

        if (!data.userId && !data.matchedWorkerId) return null;

        return {
          id: doc.id,
          userId: data.userId,
          matchedWorkerId: data.matchedWorkerId,
          scheduleId: data.scheduleId,
          shiftDate: data.shiftDate,
          workingTime: data.workingTime,
          status: data.status,
          isQuick: data.isQuick || false,
        };
      })
      .filter(Boolean) as any[];

    // 2. 사용자 정보 일괄 조회
    const userDocs = await Promise.all(
      [...userIds].map((uid) => db.collection("users").doc(uid).get())
    );

    const userMap = new Map<string, { id: string; name: string }>();
    userDocs.forEach((doc) => {
      if (doc.exists) {
        userMap.set(doc.id, {
          id: doc.id,
          name: doc.get("name") || "",
        });
      }
    });

    // 3. 결과 조합
    const issues = requests.map((r) => {
      let status = r.status || "";
      // 조건: isQuick = true && status = matched → urgentAccepted로 변경
      if (r.isQuick && r.status === "matched") {
        status = "urgentAccepted";
      }

      return {
        requestId: r.id,
        old: userMap.get(r.userId) || { id: r.userId, name: "" },
        matched: r.matchedWorkerId
          ? userMap.get(r.matchedWorkerId) || { id: r.matchedWorkerId, name: "" }
          : null,
        shiftDate: TimeUtils.convertTimeStampToKSTISOString(r.shiftDate),
        workingTime: r.workingTime || { start: "", end: "" },
        status,
        isQuick: r.isQuick,
      };
    });

    return res.success({ issues });
  } catch (error) {
    console.error("❌[getStoreIssues] 에러:", error);
    return next(error);
  }
};
