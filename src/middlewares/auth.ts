// 인증 미들웨어
import { Request, Response, NextFunction } from "express";
import { auth } from "@/firebase/config";
import * as db from "@/firebase/db";
import { AppError } from "@/utils/errorParser";

// local 개발 환경에서는 ID_TOEKN 없이 UserId로 AUTH 주입
const WITHOUT_TOKEN = process.env.NODE_ENV === "local";

// 인증 미들웨어
// 사용법: userRouter.get("/info", authenticate, getUserInfo); → 인증 필요
export const authenticate = async (req: Request, res: Response, next: NextFunction)  => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.error(401, "U001", "Authorization token missing");
  }

  const token = authHeader.split("Bearer ")[1];


  try {
    let uid;

    if (WITHOUT_TOKEN) {
      // 개발 환경: uid 직접 주입
      uid = token;
    } else {
      // 운영 환경: Firebase ID 토큰 검증
      const decodedToken = await auth.verifyIdToken(token);
      uid = decodedToken.uid;
    }

    // Firestore에서 사용자 문서 조회
    const userSnap = await db.collection("users").doc(uid).get();

    if (!userSnap.exists) {
      throw new AppError("USER.NOT_FOUND")
    }

    const userData = userSnap.data();

    // req.user에 UID + 전체 사용자 데이터 저장 (메모리에)
    req.user = {
      uid,
      ...userData,
    };


    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.error(401, "U003", "Invalid or expired token");
  }
};

// 선택적 인증 미들웨어
// 사용법: userRouter.get("/info", optionalAuth, getUserInfo); → 인증 선택적
export const optionalAuth = async (req: Request, res: Response, next: NextFunction)  => {
  const authHeader = req.headers.authorization;

  // Authorization 헤더가 없으면 그냥 넘어감
  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    let uid;

    if (WITHOUT_TOKEN) {
      uid = token;
    } else {
      const decodedToken = await auth.verifyIdToken(token);
      uid = decodedToken.uid;
    }

    const userSnap = await db.collection("users").doc(uid).get();

    if (!userSnap.exists) {
      console.warn("⚠️ optionalAuth: 유저 문서 없음", uid);
      return next(); // 유저 없으면 인증 없이 진행
    }

    const userData = userSnap.data();

    req.user = {
      uid,
      ...userData,
    };

    next();
  } catch (error) {
    console.warn("⚠️ optionalAuth: 인증 실패", error);
    next(); // 인증 실패해도 그냥 다음으로 넘어감
  }
}