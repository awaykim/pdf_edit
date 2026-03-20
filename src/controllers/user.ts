import axios from "axios";
import dotenv from "dotenv";
import { Request, Response, NextFunction } from "express";
import { auth, FieldValue, db } from "@/firebase/config";
import * as testDB from "@/firebase/db";
import { TimeUtils } from "@/utils/time";
import { AppError } from "../utils/errorParser";

dotenv.config();

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

export const signupWithServer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.query;
    if (code !== "start0101") throw new AppError("서버 회원가입은 개발용입니다. 담당자에게 문의하세요.");

    const { email, password, name, role } = req.body;
    if (!email || !password || !name)
      throw new AppError("SYSTEM.INVALID_INPUT");
    const safeEmail = email.replace(/[^a-zA-Z0-9]/g, "_");
    const uid = `${role}-${safeEmail}`;

    const userRecord = await auth.createUser({
      uid, 
      email,
      password,
      displayName: name,
    });


    const userData = {
    email,
    name,
    role,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
  };


  await testDB.collection("users").doc(userRecord.uid).set(userData);
  await db.collection("users").doc(userRecord.uid).set(userData);
  return res.success({
      uid,
      email,
      password,
    });
  } catch (error) {
    console.error("🔥 signupWithServer 에러:", error);
    next(error);
  }
};

export const kakaoAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body;
    if (!code) throw new AppError("USER.KAKAO_AUTH_FAIL");

    // 1. 카카오 access token 발급
    const tokenRes = await axios.post("https://kauth.kakao.com/oauth/token", {
      grant_type: "authorization_code",
      client_id: KAKAO_REST_API_KEY,
      redirect_uri: "https://kkaeal-group.web.app/auth/kakao/callback",
      code,
      client_secret: "iPergUndT3PwhdPYoJ2px4qZ0j7ZkKkR",
    }, {
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    });

    const { access_token, refresh_token } = tokenRes.data;
    if (!access_token) throw new AppError("USER.KAKAO_AUTH_FAIL");

    // 2. 사용자 정보 가져오기
    const userInfoRes = await axios.get("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const kakaoUser = userInfoRes.data;
    const kakaoId = `kakao:${kakaoUser.id}`;
    const kakaoEmail = kakaoUser.kakao_account?.email || `${kakaoUser.id}@kakao.user`;
    const displayName = kakaoUser.properties?.nickname || "김깨알 사용자";

    let userRecord;
    let isNewUser = false;

    // 3. Firebase 사용자 확인 또는 생성
    try {
      // uid로 직접 시도 (기존 kakao:{id} 사용자 있는 경우)
      userRecord = await auth.getUser(kakaoId);
  } catch (error: unknown) {
    const firebaseError = error as { code?: string };

    if (firebaseError.code === "auth/user-not-found") {
      isNewUser = true;

      try {
        userRecord = await auth.createUser({
          uid: kakaoId,
          email: kakaoEmail,
          displayName,
        });
      } catch (createError: unknown) {
        const createErr = createError as { code?: string };

        if (createErr.code === "auth/email-already-exists") {
          userRecord = await auth.getUserByEmail(kakaoEmail);
          isNewUser = false;
        } else {
          throw createError;
        }
      }

    } else {
      throw error;
    }
  }


    // 4. accessToken 저장 (선택 사항)
    await testDB.collection("userAuthTokens").doc(userRecord.uid).set({
      accessToken: access_token,
      refreshToken: refresh_token,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      provider: "kakao"
    });

    // 5. Firebase custom token 발급
    const customToken = await auth.createCustomToken(userRecord.uid);

    // 6. 응답
    return res.success({
      uid: userRecord.uid,
      customToken,
      isNewUser,
    });

  } catch (error) {
    console.error("🔥 kakaoAuth 에러:", error);
    next(error);
  }
};

export const getUserInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.uid) {
      throw new AppError("USER.NOT_AUTHENTICATED");
    }
    const { uid } = req.user;

    // Get user info from Firestore
    const userDoc = await testDB.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.error(404, "USER.NOT_FOUND", "사용자 정보를 찾을 수 없습니다.");
    }

    const userData = userDoc.data();
    if (!userData) {
      return res.error(404, "USER.NOT_FOUND", "사용자 정보를 찾을 수 없습니다.");
    }
    res.success({
      user: {
        uid,
        email: userData.email,
        name: userData.name,
        contact: userData.contact || "",
        isActive: userData.isActive,
        role: userData.role,
        createdAt: TimeUtils.convertTimeStampToKSTISOString(userData.createdAt) || null,
        updatedAt: TimeUtils.convertTimeStampToKSTISOString(userData.updatedAt) || null,
        deletedAt: TimeUtils.convertTimeStampToKSTISOString(userData.deletedAt) || null,
      },
    });
  } catch (error) {
    console.error("회원 정보 조회 에러:", error);
    next(error);
  }
};

export const updateUserInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.uid) {
      throw new AppError("USER.NOT_AUTHENTICATED");
    }

    const { uid } = req.user;
    const { name, contact } = req.body;

    const updateData: Record<string, any> = {
      ...(name !== undefined && { name }),
      ...(contact !== undefined && { contact }),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (Object.keys(updateData).length === 1) { // updatedAt만 있는 경우
      throw new AppError("SYSTEM.INVALID_INPUT");
    }

    // Firebase Authentication 정보 업데이트 (name만 해당)
    if (name !== undefined) {
      await auth.updateUser(uid, { displayName: name });
    }

    // Firestore 사용자 문서 업데이트
    await testDB.collection("users").doc(uid).update(updateData);

    res.success({ message: "회원 정보가 수정되었습니다." });
  } catch (error) {
    console.error("회원 정보 수정 에러:", error);
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.uid) {
      throw new AppError("USER.NOT_AUTHENTICATED");
    }
    const { uid } = req.user;
    await testDB.collection("userAuthTokens").doc(uid).delete();
    res.success({ message: "로그아웃 성공" });
  } catch (error) {
    console.error("로그아웃 에러:", error);
    next(error);
  }
};

/**
 * @swagger
 * /user/delete:
 *   delete:
 *     summary: 회원 탈퇴
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 회원 탈퇴 성공
 *       500:
 *         description: 서버 오류
 */
export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.uid) {
      throw new AppError("USER.NOT_AUTHENTICATED");
    }
    const { uid } = req.user;

    const isProd = process.env.NODE_ENV === "production";
    if (!isProd) return res.error(404, "", "개발 서버에서는 회원 탈퇴가 불가능합니다.")

    // 사용자 정보 조회
    const userDoc = await testDB.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.error(404, "USER.NOT_FOUND", "사용자 정보를 찾을 수 없습니다.");
    }

    const userData = userDoc.data();

    // 배치 시작
    const batch = testDB.batch();

    // 사용자 상태 업데이트
    const userRef = testDB.collection("users").doc(uid);
    batch.update(userRef, {
      isActive: false,
      deletedAt: FieldValue.serverTimestamp(),
    });

    // 사용자 토큰 삭제
    const tokensRef = testDB.collection("userAuthTokens").doc(uid);
    const tokensDoc = await tokensRef.get();
    if (tokensDoc.exists) {
      batch.delete(tokensRef);
    }

    // 유저의 미만료 대타 요청 모두 만료 처리
    const shiftRequestsRef = testDB.collection("shiftRequests");
    const shiftRequestsSnapshot = await shiftRequestsRef
      .where("uid", "==", uid)
      .where("isExpired", "==", false)
      .get();

    shiftRequestsSnapshot.forEach((doc) => {
      batch.update(doc.ref, { isExpired: true });
    });

    // users/uid/stores에서 근무지 확인 => stores/sid/workers에서 문서 삭제
    const userStoresRef = testDB.collection(`users/${uid}/stores`);
    const userStoresSnapshot = await userStoresRef.get();

    userStoresSnapshot.forEach((storeDoc) => {
      const storeId = storeDoc.id;
      const storeWorkersRef = testDB.collection(`stores/${storeId}/workers`).doc(uid);
      batch.delete(storeWorkersRef);
    });

    // 모든 스케줄 비활성화 
    const scheduleQuerySnapshot = await testDB
      .collection("schedules")
      .where("userId", "==", uid)
      .get();
    
    scheduleQuerySnapshot.forEach((scheduleDoc) => {
      batch.update(scheduleDoc.ref, { isActive: false });
    });

    // 탈퇴 기록 저장
    const deleteRecordRef = testDB.collection("deletedUsers").doc(uid);
    batch.set(deleteRecordRef, {
      uid,
      name: userData?.name || "",
      role: userData?.role || "",
      deletedAt: FieldValue.serverTimestamp(),
      reason: "user_request",
    });

    // 배치 커밋
    await batch.commit();

    // Firebase Auth에서 계정 삭제 시도
    try {
      await auth.deleteUser(uid);
      console.log(`✅ Firebase 인증에서 사용자 ${uid} 삭제 완료`);
    } catch (authError) {
      console.error(`⚠️ Firebase Auth 삭제 실패 ${uid}, `, authError);
      return res.success({
        message: "Firestore 문서 삭제는 완료되었지만, 인증 계정 삭제에 실패했습니다.",
      });
    }

    return res.success({ message: "회원 탈퇴 완료" });

  } catch (error) {
    console.error("❌ [deleteUser] 회원 탈퇴 에러:", error);
    next(error);
  }
};


