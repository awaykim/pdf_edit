import express from "express";
import { authenticate } from "@/middlewares/auth";
import { requestQuick, cancelQuick, getQuickNotifications, submitQuickEvaluation } from "@/controllers/manager/quick";

const managerQuickRouter = express.Router(); 

managerQuickRouter.post("/quick/request", authenticate, requestQuick);
managerQuickRouter.post("/quick/cancel", authenticate, cancelQuick);
managerQuickRouter.post("/quick/evaluation", authenticate, submitQuickEvaluation);
managerQuickRouter.get("/quick/:storeId/notifications", authenticate, getQuickNotifications);

export default managerQuickRouter;

/**
 * @swagger
 * tags:
 *   - name: Manager - Quick Shift Request
 *     description: 매니저 긴급 대타 프로세스
 */

/**
 * @swagger
 * /manager/quick/request:
 *   post:
 *     summary: 매니저가 긴급 대타 요청을 생성합니다.
 *     description: 매니저가 특정 날짜와 시간에 대해 대타 요청을 보냅니다.
 *     tags: [Manager - Quick Shift Request]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - storeId
 *               - shiftDate
 *               - workingTime
 *               - recipients
 *             properties:
 *               storeId:
 *                 type: string
 *                 example: "store_12345"
 *               shiftDate:
 *                 type: string
 *                 example: "2025.04.01"
 *                 description: 요청 대상 날짜 (YYYY.MM.DD 포맷)
 *               workingTime:
 *                 type: object
 *                 properties:
 *                   start:
 *                     type: string
 *                     example: "오전 9:00"
 *                   end:
 *                     type: string
 *                     example: "오후 8:00"
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["uid_1", "uid_2"]
 *     responses:
 *       200:
 *         description: 요청 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quickId:
 *                   type: string
 *                   example: "quick_98765"
 *       400:
 *         description: 뭔가 필드를 잘못 채움
 *         content:
 *           application/json:
 *             example:
 *               code: "E997"
 *               message: "요청 값이 올바르지 않습니다."
 *               status: 400
 *       401:
 *         description: 인증되지 않은 사용자
 *       403:
 *         description: 매니저 권한 없음
 *         content:
 *           application/json:
 *             example:
 *               code: "S403"
 *               message: "매니저가 아닙니다."
 *               status: 403
 *       404:
 *         description: 매장을 찾을 수 없음
 *         content:
 *           application/json:
 *             example:
 *               code: "S404"
 *               message: "가게를 찾을 수 없습니다."
 *               status: 404
 */

/**
 * @swagger
 * /manager/quick/{storeId}/notifications:
 *   get:
 *     summary: 매니저 긴급 대타 요청 알림 조회
 *     tags: [Manager - Quick Shift Request]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 매장 ID
 *     responses:
 *       200:
 *         description: 알림 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 active:
 *                   type: array
 *                   description: 현재 진행 중인 요청들
 *                   items:
 *                     type: object
 *                     properties:
 *                       quickId:
 *                         type: string
 *                         example: "quick_11111"
 *                       shiftDate:
 *                         type: string
 *                         example: "2025-09-28T12:00:00.000Z"
 *                       dayOfWeek:
 *                         type: number
 *                         example: 2
 *                       workingTime:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                             example: "오전 9:00"
 *                           end:
 *                             type: string
 *                             example: "오후 6:00"
 *                       note:
 *                         type: string
 *                         example: "급하게 대타 가능하신 분 부탁드립니다."
 *                       status:
 *                         type: string
 *                         enum: [requested, matched]
 *                         example: "requested"
 *                       createdAt:
 *                         type: string
 *                         example: "2025-09-28T12:00:00.000Z"
 *                       updatedAt:
 *                         type: string
 *                         example: "2025-09-28T13:00:00.000Z"
 *                       matchedName:
 *                         type: string
 *                         example: "홍길동(nullable)"
 *                       matchedId:
 *                         type: string
 *                         example: "uid_123(nullable)"
 *                 inactive:
 *                   type: array
 *                   description: 만료된 요청들
 *                   items:
 *                     type: object
 *                     properties:
 *                       quickId:
 *                         type: string
 *                         example: "quick_22222"
 *                       shiftDate:
 *                         type: string
 *                         example: "2025-09-28T12:00:00.000Z"
 *                       dayOfWeek:
 *                         type: number
 *                         example: 0
 *                       workingTime:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                             example: "오전 9:00"
 *                           end:
 *                             type: string
 *                             example: "오후 8:00"
 *                       note:
 *                         type: string
 *                         example: "급하게 대타 가능하신 분 부탁드립니다."
 *                       status:
 *                         type: string
 *                         enum: [requested, matched, canceled]
 *                         example: "matched"
 *                       createdAt:
 *                         type: string
 *                         example: "2025-09-28T12:00:00.000Z"
 *                       updatedAt:
 *                         type: string
 *                         example: "2025-09-28T13:00:00.000Z"
 *                       matchedWorkerName:
 *                         type: string
 *                         example: "홍길동(nullable)"
 *                       matchedWorkerId:
 *                         type: string
 *                         example: "uid_123(nullable)"
 *       401:
 *         description: 인증되지 않은 사용자
 *       403:
 *         description: 매니저 권한 없음
 *         content:
 *           application/json:
 *             example:
 *               code: "S403"
 *               message: "매니저가 아닙니다."
 *               status: 403
 *       404:
 *         description: 매장을 찾을 수 없음
 *         content:
 *           application/json:
 *             example:
 *               code: "S404"
 *               message: "가게를 찾을 수 없습니다."
 *               status: 404
 */

/**
 * @swagger
 * /manager/quick/cancel:
 *   post:
 *     summary: 긴급 대타 요청 취소
 *     tags: [Manager - Quick Shift Request]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quickId
 *             properties:
 *               quickId:
 *                 type: string
 *                 example: "quick_98765"
 *     responses:
 *       200:
 *         description: 취소 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: 뭔가 필드를 잘못 채움
 *         content:
 *           application/json:
 *             example:
 *               code: "E997"
 *               message: "요청 값이 올바르지 않습니다."
 *               status: 400
 *       401:
 *         description: 인증되지 않은 사용자
 *       403:
 *         description: 매니저 권한 없음
 *         content:
 *           application/json:
 *             example:
 *               code: "S403"
 *               message: "매니저가 아닙니다."
 *               status: 403
 *       404:
 *         description: 요청을 찾을 수 없음 (잘못된 quickId)
 *         content:
 *           application/json:
 *             example:
 *               code: "Q404"
 *               message: "요청을 찾을 수 없습니다."
 *               status: 404
 */
