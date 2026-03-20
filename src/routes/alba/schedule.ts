import express from "express"
import { authenticate } from "@/middlewares/auth";
import { getMyScheduleInStore, getMySchedules, updateMySchedule, } from "@/controllers/alba/schedule";

const albaScheduleRouter = express.Router()
albaScheduleRouter.patch("/alba/schedule", authenticate, updateMySchedule);
albaScheduleRouter.get("/alba/schedules", authenticate, getMySchedules);
albaScheduleRouter.get("/alba/schedule/store", authenticate, getMyScheduleInStore);

export default albaScheduleRouter;

/**
 * @swagger
 * tags:
 *   - name: Alba - Schedule
 *     description: 알바 스케줄 관리
 */

/**
 * @swagger
 * /group/alba/schedule:
 *   patch:
 *     summary: 알바생 자신의 스케줄 변경
 *     description: 근무 시작일 기준으로 스케줄을 수정합니다. 기존 반복 스케줄과 비교하여 추가, 수정, 만료 처리됩니다.
 *     tags: [Alba - Schedule]
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
 *             properties:
 *               storeId:
 *                 type: string
 *                 description: 매장 ID (store 문서의 ID)
 *                 example: "abc123storeId"
 *               date:
 *                 type: string
 *                 description: 근무 시작일 (스케줄 기준 날짜)
 *                 example: "2025.01"
 *               endDate:
 *                 type: string
 *                 description: 근무 종료일 (스케줄 기준 날짜)
 *                 example: "2025.01"
 *               schedules:
 *                 type: array
 *                 description: 새로운 반복 스케줄 배열
 *                 items:
 *                   type: object
 *                   required:
 *                     - daysOfWeek
 *                     - workingTime
 *                   properties:
 *                     id:
 *                       type: number
 *                       description: 클라이언트 기준 식별자 (서버에서 사용하는 ID는 아님)
 *                       example: 0
 *                     daysOfWeek:
 *                       type: array
 *                       description: 반복 요일 (0=일, 1=월, ..., 6=토)
 *                       items:
 *                         type: number
 *                         example: 1
 *                     workingTime:
 *                       type: object
 *                       required:
 *                         - start
 *                         - end
 *                       properties:
 *                         start:
 *                           type: string
 *                           example: "오전 08:00"
 *                         end:
 *                           type: string
 *                           example: "오후 02:00"
 *     responses:
 *       200:
 *         description: 스케줄 변경 완료
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
 *                       example: "스케줄이 성공적으로 업데이트 되었습니다."
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 실패
 *       404:
 *         description: 근무자 정보를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /group/alba/schedules:
 *   get:
 *     summary: 현재 로그인한 알바생의 모든 스케줄을 조회합니다.
 *     description: 현재 로그인한 알바생의 모든 스케줄을 조회합니다.
 *     tags: [Alba - Schedule]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 스케줄 조회 성공
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
 *                     recurringSchedules:
 *                       type: array
 *                       description: 정기 스케줄 목록
 *                       items:
 *                         type: object
 *                         properties:
 *                           scheduleId:
 *                             type: string
 *                           dayOfWeek:
 *                             type: number
 *                             example: 1
 *                           storeId:
 *                             type: string
 *                           date:
 *                             type: string
 *                             example: "2025-03-05T00:00:00.000Z"
 *                           workingTime:
 *                             type: object
 *                             properties:
 *                               start:
 *                                 type: string
 *                                 example: "오전 9:00"
 *                               end:
 *                                 type: string
 *                                 example: "오후 6:00"
 *                           status:
 *                             type: string
 *                           isRecurring:
 *                             type: boolean
 *                             example: true
 *                           recurringId:
 *                             type: string
 *                           storeName:
 *                             type: string
 *                           storeType:
 *                             type: string
 *                             enum: [manager, alba]
 *                             example: alba
 *                           endDate:
 *                             type: string
 *                             nullable: true
 *                             example: null
 *                     exceptionalSchedules:
 *                       type: array
 *                       description: 예외 스케줄 목록
 *                       items:
 *                         type: object
 *                         properties:
 *                           scheduleId:
 *                             type: string
 *                           dayOfWeek:
 *                             type: number
 *                             example: 1
 *                           storeId:
 *                             type: string
 *                           date:
 *                             type: string
 *                             example: "2025-03-12T00:00:00.000Z"
 *                           workingTime:
 *                             type: object
 *                             properties:
 *                               start:
 *                                 type: string
 *                                 example: "오전 11:00"
 *                               end:
 *                                 type: string
 *                                 example: "오후 3:00"
 *                           status:
 *                             type: string
 *                           isQuick:
 *                             type: boolean
 *                             description: 긴급 대타인지 여부 (NULLABLE)
 *                           isRecurring:
 *                             type: boolean
 *                             example: false
 *                           recurringId:
 *                             type: string
 *                           storeName:
 *                             type: string
 *                           storeType:
 *                             type: string
 *                             enum: [manager, alba]
 *                             example: manager
 *                           isActive:
 *                             type: boolean
 *                           endDate:
 *                             type: string
 *                             nullable: true
 *                             example: null
 *                           matchedName:
 *                             type: string
 *                             nullable: true
 *                             example: "홍길동"
 *                           matchedId:
 *                             type: string
 *                             nullable: true
 *                             example: "matched_id"
 *       401:
 *         description: 인증되지 않은 사용자
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /group/alba/schedule/store:
 *   get:
 *     summary: 특정 매장에서의 내 스케줄 조회
 *     description: 로그인한 알바생이 특정 매장에서 가진 정규 스케줄 정보를 조회합니다.
 *     tags: [Alba - Schedule]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 매장 ID
 *     responses:
 *       200:
 *         description: 스케줄 조회 성공
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
 *                     userId:
 *                       type: string
 *                       example: "user_123"
 *                     date:
 *                       type: string
 *                       example: "2025.03"
 *                     isPrevious:
 *                       type: boolean
 *                       example: false
 *                     schedules:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: number
 *                             example: 0
 *                           workingTime:
 *                             type: object
 *                             properties:
 *                               start:
 *                                 type: string
 *                                 example: "오전 09:00"
 *                               end:
 *                                 type: string
 *                                 example: "오후 6:00"
 *                           daysOfWeek:
 *                             type: array
 *                             items:
 *                               type: number
 *                             example: [0, 2, 4]
 *                     endDate:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *       400:
 *         description: storeId 누락 등 잘못된 요청
 *       401:
 *         description: 인증되지 않은 사용자
 *       404:
 *         description: 근무 기록 없음
 *       500:
 *         description: 서버 오류
 */

