import express from "express";
import { authenticate } from "@/middlewares/auth";
import { approveShift, rejectShift, getStoreNotifications, getStoreIssues } from "@/controllers/manager/request";

const managerShiftRouter = express.Router(); 

managerShiftRouter.post("/shift/approve", authenticate, approveShift);
managerShiftRouter.post("/shift/reject", authenticate, rejectShift);
managerShiftRouter.get("/shift/:storeId/notifications", authenticate, getStoreNotifications);
managerShiftRouter.get("/store/:storeId/issues", authenticate, getStoreIssues);

export default managerShiftRouter;

/**
 * @swagger
 * tags:
 *   - name: Manager - Shift Request
 *     description: 매니저 대타 관리
 */

/**
 * @swagger
 * /manager/shift/approve:
 *   post:
 *     summary: 대타 근무 요청 승인
 *     description: 매니저 또는 매장 운영자가 대타 근무 요청을 승인합니다. 승인 시 기존 스케줄 상태를 변경하고, 예외 스케줄을 확정하며 관련된 알림도 처리됩니다.
 *     tags:
 *       - Manager - Shift Request
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requestId
 *             properties:
 *               requestId:
 *                 type: string
 *                 example: "abc123requestId"
 *                 description: 대타 근무 요청 ID (shiftRequests/{requestId})
 *     responses:
 *       200:
 *         description: 대타 요청 승인 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증되지 않음
 *       404:
 *         description: 해당 요청 또는 스케줄을 찾을 수 없음
 *       500:
 *         description: 서버 내부 오류
 */

/**
 * @swagger
 * /manager/shift/reject:
 *   post:
 *     summary: 대타 요청 거절
 *     description: 대타 요청을 거절하고 예외 스케줄을 삭제하며 기존 스케줄을 복구합니다. 거절된 요청과 관련된 알림도 비활성화되고, 푸시 알림이 전송됩니다.
 *     tags:
 *       - Manager - Shift Request
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requestId
 *             properties:
 *               requestId:
 *                 type: string
 *                 description: 거절할 대타 요청의 ID (shiftRequests 컬렉션 문서 ID)
 *     responses:
 *       200:
 *         description: 대타 요청 거절 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 대타 거절 완료
 *       400:
 *         description: 잘못된 요청 또는 인증되지 않은 사용자
 *       404:
 *         description: 요청 문서 또는 스케줄 문서를 찾을 수 없음
 */

/**
 * @swagger
 * /manager/shift/{storeId}/notifications:
 *   get:
 *     summary: 매장 대타 요청 알림 조회
 *     tags: [Manager - Shift Request]
 *     description: 특정 매장(storeId)에 대해 매칭된 대타 요청 알림 목록을 조회합니다. 활성/비활성 상태로 나누어 반환합니다.
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 매장 고유 ID
 *     responses:
 *       200:
 *         description: 알림 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activeNotis:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ShiftNotification'
 *                 inactiveNotis:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ShiftNotification'
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 에러
 */

/**
 * @swagger
 * /manager/store/{storeId}/issues:
 *   get:
 *     summary: 매장 대타 요청 이슈 목록 조회
 *     tags: [Manager - Shift Request]
 *     description: 특정 매장의 기간 내 대타 요청 이슈 목록을 조회합니다. 요청자/대타자, 스케줄, 근무시간 등의 정보가 포함됩니다.
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 매장 고유 ID
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회 시작 날짜 (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회 종료 날짜 (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: 이슈 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 issues:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ShiftIssue'
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 에러
 */


/**
 * @swagger
 * components:
 *   schemas:
 *     ShiftNotification:
 *       type: object
 *       properties:
 *         requestId:
 *           type: string
 *         date:
 *           type: string
 *         expiredAt:
 *           type: string
 *         workingTime:
 *           type: object
 *           properties:
 *             start:
 *               type: string
 *             end:
 *               type: string
 *         old:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *         matched:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *         isExpired:
 *           type: boolean
 *         status:
 *           type: string
 *     ShiftIssue:
 *       type: object
 *       properties:
 *         requestId:
 *           type: string
 *         shiftDate:
 *           type: string
 *         workingTime:
 *           type: object
 *           properties:
 *             start:
 *               type: string
 *             end:
 *               type: string
 *         status:
 *           type: string
 *         old:
 *           $ref: '#/components/schemas/UserInfo'
 *         matched:
 *           $ref: '#/components/schemas/UserInfo'
 *     UserInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 */
