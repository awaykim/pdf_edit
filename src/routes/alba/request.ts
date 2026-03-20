import express from "express";
import { optionalAuth, authenticate } from "@/middlewares/auth";
import { requestShift, cancelShift, applyShift, getMyShiftNotifications, getMyRequests, getMyShifts } from "@/controllers/alba/request";

const albaRequestRouter = express.Router(); 
albaRequestRouter.post("/alba/shift/request", authenticate, requestShift);
albaRequestRouter.post("/alba/shift/cancel", authenticate, cancelShift);
albaRequestRouter.post("/alba/shift/apply", authenticate, applyShift);
albaRequestRouter.get("/alba/shift/notifications", authenticate, getMyShiftNotifications);
albaRequestRouter.get("/alba/shift/requests", authenticate, getMyRequests);
albaRequestRouter.get("/alba/my/shifts", authenticate, getMyShifts);



export default albaRequestRouter; 

/**
 * @swagger
 * tags:
 *   - name: Alba - Shift
 *     description: 알바 대타 요청 프로세스
 */


/**
 * @swagger
 * /group/alba/shift/request:
 *   post:
 *     summary: 알바생이 해당 스케줄에 대한 대타를 요청합니다. 
 *     description: 알바생이 해당 스케줄에 대한 대타를 요청합니다. 정기/예외 스케줄에 따라 처리 방식이 달라집니다.
 *     tags: [Alba - Shift]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shiftDate
 *             properties:
 *               scheduleId:
 *                 type: string
 *                 example: "schedule_abc123"
 *                 description: 요청할 스케줄의 ID (정기 스케줄인 경우)
 *               shiftDate:
 *                 type: string
 *                 example: "2025.04.01"
 *                 description: 요청 대상 날짜 (YYYY.MM.DD 포맷)
 *               storeId:
 *                 type: string
 *                 example: "store_xyz789"
 *                 description: 매장 ID (scheduleId가 없을 때 필수)
 *               workingTime:
 *                 type: object
 *                 description: 근무 시간 (scheduleId가 없을 때 필수)
 *                 properties:
 *                   start:
 *                     type: string
 *                     example: "오전 9:00"
 *                     description: 시작 시간 (한국어 포맷)
 *                   end:
 *                     type: string
 *                     example: "오후 6:00"
 *                     description: 종료 시간 (한국어 포맷)
 *     responses:
 *       200:
 *         description: 대타 요청 성공
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
 *                     newScheduleId:
 *                       type: string
 *                       example: "s12345"
 *                       description: 생성된 스케줄 ID
 *                     requestId:
 *                       type: string
 *                       example: "r98765"
 *                       description: 생성된 요청 ID
 *       400:
 *         description: 잘못된 요청 (날짜 포맷 오류, 필수 파라미터 누락 등)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "REQUEST.INVALID_DATE"
 *       401:
 *         description: 인증되지 않은 사용자
 *       404:
 *         description: 스케줄 또는 매장을 찾을 수 없음
 *       409:
 *         description: 이미 할당된 스케줄이거나 비활성 스케줄
 *       500:
 *         description: 서버 오류
 */
/**
 * @swagger
 * /group/alba/shift/cancel:
 *   post:
 *     summary: 알바생이 자신이 요청한 대타 요청을 취소합니다.
 *     description: 알바생이 자신이 요청한 대타 요청을 취소합니다.
 *     tags: [Alba - Shift]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - scheduleId
 *             properties:
 *               scheduleId:
 *                 type: string
 *                 example: "schedule_abc123"
 *                 description: 취소할 대타 요청의 스케줄 ID (newScheduleId)
 *     responses:
 *       200:
 *         description: 대타 요청 취소 성공
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
 *                     originalScheduleId:
 *                       type: string
 *                       example: "schedule_original123"
 *                       description: 원본 스케줄 ID
 *       400:
 *         description: 잘못된 요청 (scheduleId 누락 등)
 *       401:
 *         description: 인증되지 않은 사용자
 *       404:
 *         description: 해당 스케줄 ID의 대타 요청을 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */
/**
 * @swagger
 * /group/alba/shift/apply:
 *   post:
 *     summary: 알바생이 다른 알바생의 대타 근무 요청에 지원합니다.
 *     description: 알바생이 다른 알바생의 대타 근무 요청에 지원합니다.
 *     tags: [Alba - Shift]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - notiId
 *             properties:
 *               notiId:
 *                 type: string
 *                 example: "notification_xyz789"
 *                 description: 수락할 대타 요청 알림의 ID
 *     responses:
 *       200:
 *         description: 근무 요청 수락 및 스케줄 등록 완료
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
 *                       example: "근무 요청 수락 및 스케줄 등록 완료"
 *       400:
 *         description: 잘못된 입력 (notiId 누락)
 *       401:
 *         description: 인증되지 않은 사용자
 *       404:
 *         description: 해당 알림 ID의 대타 요청을 찾을 수 없음
 *       500:
 *         description: 서버 오류 (트랜잭션 실패 등)
 */
/**
 * @swagger
 * /group/alba/shift/notifications:
 *   get:
 *     summary: 현재 로그인한 알바생의 교대 요청 알림 목록을 조회합니다.
 *     description: 현재 로그인한 알바생의 교대 요청 알림 목록을 조회합니다.
 *     tags: [Alba - Shift]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 알림 조회 성공
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
 *                     activeNotis:
 *                       type: array
 *                       description: 활성 알림 목록
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             description: 알림 ID
 *                           requestId:
 *                             type: string
 *                             description: 요청 ID
 *                           isMyShift:
 *                             type: boolean
 *                             description: 내가 가기로 한 대타인지 여부
 *                           isMatched:
 *                             type: boolean
 *                             description: 매칭 완료 여부
 *                           isExpired:
 *                             type: boolean
 *                             description: 만료 여부
 *                           isQuick:
 *                             type: boolean
 *                             description: 긴급 대타인지 여부
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-04-10T00:00:00.000Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                             example: "2025-04-11T12:34:56.000Z"
 *                           shiftDate:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-04-12T09:00:00.000Z"
 *                           schedule:
 *                             type: object
 *                             properties:
 *                               scheduleId:
 *                                 type: string
 *                                 description: 스케줄 ID
 *                               userId:
 *                                 type: string
 *                                 description: 요청한 사용자 ID
 *                               storeId:
 *                                 type: string
 *                                 description: 매장 ID
 *                               storeName:
 *                                 type: string
 *                                 description: 매장명
 *                               workingTime:
 *                                 type: object
 *                                 properties:
 *                                   startNum:
 *                                     type: number
 *                                     description: 시작 시간 (숫자)
 *                                   start:
 *                                     type: string
 *                                     description: 시작 시간 (한국어)
 *                                   end:
 *                                     type: string
 *                                     description: 종료 시간 (한국어)
 *                     inactiveNotis:
 *                       type: array
 *                       description: 비활성 알림 목록
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             description: 알림 ID
 *                           requestId:
 *                             type: string
 *                             description: 요청 ID
 *                           isMyShift:
 *                             type: boolean
 *                             description: 내가 요청한 대타인지 여부
 *                           isMatched:
 *                             type: boolean
 *                             description: 매칭 완료 여부
 *                           isExpired:
 *                             type: boolean
 *                             description: 만료 여부
 *                           isQuick:
 *                             type: boolean
 *                             description: 긴급 대타인지 여부
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           shiftDate:
 *                             type: string
 *                             format: date-time
 *                           schedule:
 *                             type: object
 *                             properties:
 *                               scheduleId:
 *                                 type: string
 *                                 description: 스케줄 ID
 *                               userId:
 *                                 type: string
 *                                 description: 요청한 사용자 ID
 *                               storeId:
 *                                 type: string
 *                                 description: 매장 ID
 *                               storeName:
 *                                 type: string
 *                                 description: 매장명
 *                               workingTime:
 *                                 type: object
 *                                 properties:
 *                                   startNum:
 *                                     type: number
 *                                     description: 시작 시간 (숫자)
 *                                   start:
 *                                     type: string
 *                                     description: 시작 시간 (한국어)
 *                                   end:
 *                                     type: string
 *                                     description: 종료 시간 (한국어)
 *       401:
 *         description: 인증되지 않은 사용자
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /group/alba/shift/requests:
 *   get:
 *     summary: 내가 보낸 대타 요청 목록 조회
 *     description: |
 *       현재 로그인한 유저가 생성한 대타 요청 목록을 조회합니다.
 *       - **activeNotis**: 진행 중인 요청 (요청 중, 매칭 후 승인 대기)
 *       - **inactiveNotis**: 완료된 요청 (승인 완료, 마감, 취소, 기간 만료)
 *     tags: [Alba - Shift]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 요청 목록 조회 성공
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
 *                     activeNotis:
 *                       type: array
 *                       description: 진행 중인 요청 목록 (요청 중, 매칭됨)
 *                       items:
 *                         $ref: '#/components/schemas/MyShiftRequestItem'
 *                     inactiveNotis:
 *                       type: array
 *                       description: 완료/만료된 요청 목록 (승인됨, 취소됨, 만료됨)
 *                       items:
 *                         $ref: '#/components/schemas/MyShiftRequestItem'
 *       401:
 *         description: 인증되지 않은 사용자
 *       500:
 *         description: 서버 오류
 * components:
 *   schemas:
 *     MyShiftRequestItem:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: 요청 문서 ID
 *         userId:
 *           type: string
 *           description: 요청자 UID
 *         status:
 *           type: string
 *           description: 현재 상태 (requested, matched, approved, canceled)
 *           example: "requested"
 *         isExpired:
 *           type: boolean
 *           description: 기간 만료 여부
 *         isMatched:
 *           type: boolean
 *           description: 대타 매칭 여부 (지원자가 있는지)
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: 요청 생성 일시
 *         shiftDate:
 *           type: string
 *           format: date-time
 *           description: 근무 날짜
 *         dayOfWeek:
 *           type: string
 *           description: 요일 (한글)
 *           example: "월"
 *         storeId:
 *           type: string
 *           description: 매장 ID
 *         storeName:
 *           type: string
 *           description: 매장명
 *           example: "뚜레쥬르 마포역점"
 *         hasManager:
 *           type: boolean
 *           description: 매니저 잇는지
 *           example: true
 *         workingTime:
 *           type: object
 *           description: 근무 시간
 *           properties:
 *             start:
 *               type: string
 *               example: "09:00"
 *             end:
 *               type: string
 *               example: "13:00"
 *         matchedWorkerId:
 *           type: string
 *           nullable: true
 *           description: 매칭된 대타 근무자 ID (없으면 null)
 *         matchedName:
 *           type: string
 *           nullable: true
 *           description: 매칭된 대타 근무자 이름 (없으면 null)
 *           example: "성아정"
 */

/**
 * @swagger
 * /group/alba/my/shifts:
 *   get:
 *     summary: 내가 지원해서 매칭된 대타 근무 목록 조회
 *     description: |
 *       현재 로그인한 알바생이 다른 알바생의 대타 요청에 지원하여 매칭된(대타로 일하게 된) 근무 목록을 조회합니다.
 *     tags: [Alba - Shift]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 대타 근무 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 payload:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MatchedShiftItem'
 *       401:
 *         description: 인증되지 않은 사용자 (토큰 누락 또는 유효하지 않음)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "USER.NOT_AUTHENTICATED"
 *       500:
 *         description: 서버 오류
 * components:
 *   schemas:
 *     MatchedShiftItem:
 *       type: object
 *       description: 내가 매칭된 대타 근무 정보 항목
 *       properties:
 *         id:
 *           type: string
 *           description: 대타 요청 문서 ID
 *           example: "r98765"
 *         userId:
 *           type: string
 *           description: 원본 스케줄 요청자의 UID
 *           example: "u1a2b3c4d5e6f7"
 *         requesterName:
 *           type: string
 *           description: 원본 스케줄 요청자의 이름
 *           example: "김철수"
 *         note:
 *           type: string
 *           description: 대타 요청 메모
 *           example: "유니폼 착용 후 10분 전 도착 부탁드려요."
 *         wage:
 *           type: number
 *           description: 긴급 대타 시 지급 시급 또는 금액
 *           example: 12000
 *         status:
 *           type: string
 *           description: 대타 요청의 현재 상태 
 *           example: "matched"
 *         isExpired:
 *           type: boolean
 *           description: 요청 마감 기한 만료 여부
 *           example: false
 *         isMatched:
 *           type: boolean
 *           description: 대타 매칭 여부 (이 API에서는 항상 true)
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: 요청 생성 일시 (KST ISO String)
 *           example: "2025-04-10T09:00:00.000+09:00"
 *         shiftDate:
 *           type: string
 *           format: date-time
 *           description: 실제 근무 날짜 (KST ISO String)
 *           example: "2025-04-15T09:00:00.000+09:00"
 *         dayOfWeek:
 *           type: number
 *           description: 근무 날짜의 요일 (0:일요일 ~ 6:토요일)
 *           example: 1
 *         workingTime:
 *           type: object
 *           description: 근무 시간
 *           properties:
 *             start:
 *               type: string
 *               example: "오전 9:00"
 *             end:
 *               type: string
 *               example: "오후 6:00"
 *         storeId:
 *           type: string
 *           description: 매장 ID
 *           example: "store_xyz789"
 *         storeName:
 *           type: string
 *           description: 매장 이름
 *           example: "OOO 베이커리"
 *         hasManager:
 *           type: boolean
 *           description: 해당 매장에 매니저가 있는지 여부
 *           example: true
 */
