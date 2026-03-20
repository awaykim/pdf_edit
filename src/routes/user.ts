/**
 * @swagger
 * tags:
 *   - name: User
 *     description: 사용자 관리 API
 */

/**
 * @swagger
 * /user/info:
 *   get:
 *     summary: 회원 정보 조회
 *     description: 현재 로그인한 사용자의 정보를 조회합니다.
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 회원 정보 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 payload:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         uid:
 *                           type: string
 *                         email:
 *                           type: string
 *                         name:
 *                           type: string
 *                         contact:
 *                           type: string
 *                         isActive:
 *                           type: boolean
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                         deletedAt:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *       401:
 *         description: 인증되지 않은 사용자
 *       404:
 *         description: 사용자를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /user/info:
 *   patch:
 *     summary: 회원 정보 수정
 *     description: 현재 로그인한 사용자의 정보를 수정합니다.
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: 사용자 이름
 *               contact:
 *                 type: string
 *                 description: 사용자 연락처
 *     responses:
 *       200:
 *         description: 회원 정보 수정 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 payload:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "회원 정보 수정됨"
 *       400:
 *         description: 잘못된 입력(이름/연락처 누락 등)
 *       401:
 *         description: 인증되지 않은 사용자
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /user:
 *   delete:
 *     summary: 회원 탈퇴
 *     description: 현재 로그인한 사용자의 계정을 삭제합니다.
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 회원 탈퇴 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 payload:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "회원 탈퇴 완료"
 *       401:
 *         description: 인증되지 않은 사용자
 *       404:
 *         description: 사용자를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /user/auth/kakao:
 *   post:
 *     summary: 카카오 로그인 또는 자동 회원가입
 *     tags: [User]
 *     description: 카카오 인가 코드로 로그인하거나, 최초 요청 시 자동으로 회원가입 처리 후 Firebase Custom Token을 반환합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: 카카오에서 발급받은 인가 코드
 *     responses:
 *       200:
 *         description: 로그인 또는 회원가입 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uid:
 *                   type: string
 *                   description: Firebase UID
 *                 customToken:
 *                   type: string
 *                   description: Firebase Custom Token
 *                 isNewUser:
 *                   type: boolean
 *                   description: 신규 회원 여부
 *       400:
 *         description: code 누락 등 잘못된 요청
 *       500:
 *         description: 서버 오류
 */


// 라우팅 설정
import express from "express";
import { authenticate } from "@/middlewares/auth";
import { kakaoAuth, getUserInfo, updateUserInfo, deleteUser } from "@/controllers/user";

const userRouter = express.Router();

// 카카오 로그인
userRouter.post("/auth/kakao", kakaoAuth);

// 회원 정보 조회
userRouter.get("/info", authenticate, getUserInfo);

// 회원 정보 수정
userRouter.patch("/info", authenticate, updateUserInfo);

// 회원 탈퇴
userRouter.delete("/", authenticate, deleteUser);

export default userRouter;
