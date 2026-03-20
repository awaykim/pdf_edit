import express from "express";
import { authenticate } from "@/middlewares/auth";
import { getAllWorkers, getWorkerSchedule, confirmWorker, rejectWorker, getExpireSchedule, retireWorker, updateWorkerSchedule, getWorkerWorkplaces } from "@/controllers/manager/workers";

const managerWorkerRouter = express.Router();

managerWorkerRouter.get("/store/:storeId/workers/", authenticate, getAllWorkers);
managerWorkerRouter.get("/store/:storeId/worker/:workerId", authenticate, getWorkerSchedule);
managerWorkerRouter.post("/store/:storeId/draft/:workerId/approve", authenticate, confirmWorker)
managerWorkerRouter.delete("/store/:storeId/draft/:workerId/reject", authenticate, rejectWorker)

managerWorkerRouter.post("/store/:storeId/worker/:workerId/expires", authenticate, getExpireSchedule)
managerWorkerRouter.delete("/store/:storeId/worker/:workerId/retire", authenticate, retireWorker)
managerWorkerRouter.patch("/store/:storeId/worker/:workerId/schedule", authenticate, updateWorkerSchedule)

// 특정 알바생의 근무지 목록 조회 (이대 상권 이벤트 추천 인력 경력 확인 등)
managerWorkerRouter.get("/worker/:workerId/workplaces", authenticate, getWorkerWorkplaces);


export default managerWorkerRouter;


/**
 * @swagger
 * tags:
 *   - name: Manager - Workers
 *     description: 매니저 알바생 관리
 */

/**
 * @swagger
 * /manager/store/{storeId}/workers/:
 *   get:
 *     summary: 매장 근무자 전체 조회
 *     description: storeId를 기반으로 매장에 등록된 근무자를 상태별로(pending, active, retired) 분류해서 조회합니다.
 *     tags:
 *       - Manager - Workers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 매장의 고유 ID
 *     responses:
 *       200:
 *         description: 근무자 목록을 상태별로 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     pending:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           workerId:
 *                             type: string
 *                             example: "uid_abc123"
 *                           name:
 *                             type: string
 *                             example: "김철수"
 *                     active:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           workerId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           date:
 *                             type: string
 *                             description: 근무 시작일 (YYYY.MM)
 *                             example: "2024.03"
 *                     retired:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           workerId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           date:
 *                             type: string
 *                             description: 근무 시작일 (YYYY.MM)
 *                           endDate:
 *                             type: string
 *                             description: 근무 종료일 (YYYY.MM)
 *       401:
 *         description: 인증 실패 (토큰 없음/유효하지 않음)
 *       500:
 *         description: 서버 내부 오류
 */

/**
 * @swagger
 * /manager/store/{storeId}/worker/{workerId}:
 *   get:
 *     summary: 알바생 정기 스케줄 조회
 *     description: 특정 매장의 특정 알바생(userId)의 근무정보를 반환합니다. 등록된 정기 스케줄이 없으면 빈 배열을 반환합니다.
 *     tags:
 *       - Manager - Workers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 매장 ID
 *       - in: path
 *         name: workerId
 *         required: true
 *         schema:
 *           type: string
 *         description: 알바생의 사용자 ID
 *     responses:
 *       200:
 *         description: 알바생 드래프트 정보 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "홍길동"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-07-28T09:20:13.000Z"
 *                     date:
 *                       type: string
 *                       description: 근무 시작일 (YYYY.MM)
 *                       example: "2024.03"
 *                     endDate:
 *                       type: string
 *                       nullable: true
 *                       description: 근무 종료일 (YYYY.MM), 없으면 null
 *                       example: ""
 *                     isPrevious:
 *                       type: boolean
 *                       description: 과거 근무자인 경우 true
 *                       example: false
 *                     schedules:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 0
 *                           workingTime:
 *                             type: object
 *                             properties:
 *                               start:
 *                                 type: string
 *                                 example: "오전 9:00"
 *                               end:
 *                                 type: string
 *                                 example: "오후 6:00"
 *                           daysOfWeek:
 *                             type: array
 *                             items:
 *                               type: integer
 *                             example: [1, 3, 5]
 *       404:
 *         description: 알바생 드래프트 정보 없음
 *       500:
 *         description: 서버 내부 오류
 */

/**
 * @swagger
 * /manager/store/{storeId}/draft/{workerId}/approve:
 *   post:
 *     summary: 알바 근무자 스케줄 승인
 *     description: 승인 대기 중인 알바 근무자의 스케줄을 확정 등록합니다. 기존 draft 데이터를 삭제하고 새로 스케줄을 등록합니다.
 *     tags:
 *       - Manager - Workers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 매장 ID
 *       - in: path
 *         name: workerId
 *         required: true
 *         schema:
 *           type: string
 *         description: 알바 유저의 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 description: 근무 시작일 (YYYYMM)
 *                 example: "2024.07"
 *               endDate:
 *                 type: string
 *                 description: 근무 종료일 (YYYYMM)
 *                 example: ""
 *               isPrevious:
 *                 type: boolean
 *                 description: 과거 근무 여부
 *                 example: false
 *               schedules:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     workingTime:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           example: "오전 10:00"
 * 
 *                         end:
 *                           type: integer
 *                           example: "오전 11:00"
 *                     daysOfWeek:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [1, 3, 5]
 *     responses:
 *       200:
 *         description: 스케줄 등록 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 근무자 스케줄 등록완료
 *       400:
 *         description: 유효하지 않은 요청 또는 이미 등록됨
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /manager/store/{storeId}/draft/{workerId}/reject:
 *   delete:
 *     summary: 알바 근무자 스케줄 거절 및 삭제
 *     description: 승인 대기 중인 알바의 draft, 스케줄, 연결된 정보 전부 삭제합니다.
 *     tags:
 *       - Manager - Workers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 매장 ID
 *       - in: path
 *         name: workerId
 *         required: true
 *         schema:
 *           type: string
 *         description: 알바 유저의 ID
 *     responses:
 *       200:
 *         description: 삭제 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: 알바생 스케줄 초안이 삭제되었습니다.
 *       404:
 *         description: draft 문서 또는 worker 문서 없음
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /manager/store/{storeId}/worker/{workerId}/expires:
 *   post:
 *     tags:
 *       - Manager - Workers
 *     summary: 변경 또는 퇴사에 따른 만료 스케줄 조회
 *     description: 
 *       기존 스케줄과 새로운 스케줄을 비교하여 만료 대상 스케줄을 반환합니다. 만약 `retire: true`일 경우, 기존 전체 스케줄을 만료 대상으로 간주하여 예외 스케줄을 반환합니다.
 *     parameters:
 *       - name: storeId
 *         in: path
 *         required: true
 *         description: 스토어 ID
 *         schema:
 *           type: string
 *       - name: workerId
 *         in: path
 *         required: true
 *         description: 알바생 UID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 description: 고용 시작일 또는 기준 월 (yyyy.mm)
 *                 example: "2025.08"
 *               schedules:
 *                 type: array
 *                 description: 새로 등록할 요일별 스케줄 목록 (retire가 false일 경우 필요)
 *                 items:
 *                   type: object
 *                   properties:
 *                     dayOfWeek:
 *                       type: number
 *                       description: 요일 (0=일요일, 6=토요일)
 *                       example: 1
 *                     workingTime:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           example: "오전 09:00"
 *                         end:
 *                           type: string
 *                           example: "오후 06:00"
 *               retire:
 *                 type: boolean
 *                 description: true일 경우 전체 스케줄 만료 처리
 *                 example: true
 *     responses:
 *       200:
 *         description: 만료 대상 스케줄들의 예외 스케줄 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 toExpire:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       scheduleId:
 *                         type: string
 *                       date:
 *                         type: string
 *                         example: "08/05"
 *                       workingTime:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                           end:
 *                             type: string
 *                       status:
 *                         type: string
 *                         example: "matched"
 *                       workerId:
 *                         type: string
 *                       workerName:
 *                         type: string
 *                       matchedWorkerId:
 *                         type: string
 *                       matchedName:
 *                         type: string
 *                       shiftRequestId:
 *                         type: string
 *       400:
 *         description: 잘못된 입력 또는 작업자가 아님
 *       401:
 *         description: 인증 실패
 */

/**
 * @swagger
 * /manager/store/{storeId}/worker/{workerId}/retire:
 *   delete:
 *     tags:
 *       - Manager - Workers
 *     summary: 알바생 근무 퇴사 처리 
 *     description: 해당 알바생의 모든 스케줄을 비활성화하고, 스토어에서 퇴사 처리합니다.
 *     parameters:
 *       - name: storeId
 *         in: path
 *         required: true
 *         description: 스토어 ID
 *         schema:
 *           type: string
 *       - name: workerId
 *         in: path
 *         required: true
 *         description: 퇴사 처리할 알바생 UID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 근무 종료 완료
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "근무 이력을 성공적으로 비활성화했습니다."
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증되지 않음
 *       404:
 *         description: 사용자 또는 스토어 정보를 찾을 수 없음
 */

/**
 * @swagger
 * /manager/store/{storeId}/worker/{workerId}/schedule:
 *   patch:
 *     tags:
 *       - Manager - Workers
 *     summary: 알바생 스케줄 수정 
 *     description: 알바생의 입사일, 퇴사일 또는 요일별 근무 스케줄을 업데이트합니다.
 *     parameters:
 *       - name: storeId
 *         in: path
 *         required: true
 *         description: 스토어 ID
 *         schema:
 *           type: string
 *       - name: workerId
 *         in: path
 *         required: true
 *         description: 알바생 UID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 example: "2025.08"
 *                 description: 입사일 (yyyy.MM)
 *               endDate:
 *                 type: string
 *                 example: "2025.10"
 *                 description: 퇴사일 (yyyy.MM)
 *               schedules:
 *                 type: array
 *                 description: 새로운 요일별 근무 스케줄
 *                 items:
 *                   type: object
 *                   properties:
 *                     dayOfWeek:
 *                       type: array
 *                       example: [1, 2]
 *                       description: 요일 (0=일, 6=토)
 *                     workingTime:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           example: "오전 09:00"
 *                         end:
 *                           type: string
 *                           example: "오후 06:00"
 *     responses:
 *       200:
 *         description: 스케줄 업데이트 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "스케줄이 성공적으로 업데이트 되었습니다."
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증되지 않음
 *       404:
 *         description: 알바생 또는 스토어 정보를 찾을 수 없음
 */
