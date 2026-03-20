import express from "express";
import { optionalAuth, authenticate } from "@/middlewares/auth";
import { registerToStore, deleteStore, getCoworkerInfo, getManagerInfo, getMyWorks, getStoreInfo, getStoreWorkers, retireStore, convertToManagedStore } from "@/controllers/alba/workspace";


const albaWorkspaceRouter = express.Router(); 

albaWorkspaceRouter.post("/store/register", authenticate, registerToStore);
albaWorkspaceRouter.get("/store/info", optionalAuth, getStoreInfo);
albaWorkspaceRouter.get("/store/manager", authenticate, getManagerInfo);
albaWorkspaceRouter.get("/store/workers", authenticate, getStoreWorkers);
albaWorkspaceRouter.get("/store/worker", authenticate, getCoworkerInfo);
albaWorkspaceRouter.get("/alba/works", authenticate, getMyWorks);
albaWorkspaceRouter.delete("/alba/store/:storeId", authenticate, deleteStore);
albaWorkspaceRouter.delete("/alba/store/:storeId/retire", authenticate, retireStore);
albaWorkspaceRouter.get("/store/:storeId/convert", authenticate, convertToManagedStore);

export default albaWorkspaceRouter;


/**
 * @swagger
 * tags:
 *   - name: Alba - Workspace
 *     description: 알바 근무지 관리
 */


/**
 * @swagger
 * /group/store/register:
 *   post:
 *     summary: 알바생의 근무지 등록
 *     description: 지도 기반 매장 정보를 바탕으로 알바생의 근무지를 등록하고, 이전 근무자인지 여부에 따라 스케줄을 함께 등록합니다.
 *     tags: [Alba - Workspace]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isPrevious
 *               - date
 *             properties:
 *               map:
 *                 type: object
 *                 required:
 *                   - id
 *                   - place_name
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: Kakao 지도에서 제공하는 장소 ID
 *                     example: "10452794"
 *                   place_name:
 *                     type: string
 *                     example: "불밥"
 *                   address_name:
 *                     type: string
 *                     example: "서울 서대문구 대현동 60-51"
 *                   road_address_name:
 *                     type: string
 *                     example: "서울 서대문구 이화여대8길 11"
 *                   category_group_code:
 *                     type: string
 *                     example: "FD6"
 *                   category_group_name:
 *                     type: string
 *                     example: "음식점"
 *                   category_name:
 *                     type: string
 *                     example: "음식점 > 한식"
 *                   phone:
 *                     type: string
 *                     example: "02-362-9833"
 *                   place_url:
 *                     type: string
 *                     example: "http://place.map.kakao.com/10452794"
 *                   x:
 *                     type: string
 *                     example: "126.94640545973554"
 *                   y:
 *                     type: string
 *                     example: "37.558840149596726"
 *               date:
 *                 type: string
 *                 description: 근무 시작일 (월)
 *                 example: "2025.03"
 *               isPrevious:
 *                 type: boolean
 *                 description: 이전 근무자 여부
 *                 example: false
 *               endDate:
 *                 type: string
 *                 nullable: true
 *                 description: 근무 종료일 (월)
 *                 example: ""
 *               storeId:
 *                 type: string
 *                 description: 스토어 ID (알 경우)
 *                 example: "알고 있을 때만 적으면 됨 (있으면 map 정보 없어도 됨ㅇ)"
 *               schedules:
 *                 type: array
 *                 description: 현재 근무자일 경우 등록할 반복 스케줄
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                       example: 0
 *                     daysOfWeek:
 *                       type: array
 *                       items:
 *                         type: number
 *                         example: 1
 *                     workingTime:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           description: 시작 시간 (ex. 오전 09:00)
 *                           example: "오전 09:00"
 *                         end:
 *                           type: string
 *                           description: 종료 시간 (ex. 오후 06:00)
 *                           example: "오후 6:00"
 *     responses:
 *       200:
 *         description: 등록 성공
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
 *                     storeId:
 *                       type: string
 *                       description: 등록된 매장의 ID
 *                       example: "store_123"
 *       400:
 *         description: 잘못된 요청 (필드 누락 등)
 *       401:
 *         description: 인증되지 않은 사용자
 *       409:
 *         description: 이미 등록된 근무자
 *       500:
 *         description: 서버 오류
 */


/**
 * @swagger
 * /group/store/info:
 *   get:
 *     summary: 매장 정보 조회 (Kakao Map ID 기반)
 *     description: Kakao Map ID (`mapId`)를 query parameter로 받아, 해당 매장의 정보(관리자 유무, 근무자 수, 현재 유저의 근무 여부, 매장 ID)를 조회합니다.
 *     tags: [Alba - Workspace]
 *     parameters:
 *       - in: query
 *         name: mapId
 *         required: true
 *         schema:
 *           type: string
 *         description: Kakao 지도에서 제공하는 매장 고유 ID
 *     responses:
 *       200:
 *         description: 매장 정보 조회 성공 (매장이 없을 경우에도 200, storeId는 빈 문자열)
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
 *                     storeId:
 *                       type: string
 *                       description: 매장 문서 ID (없으면 빈 문자열)
 *                       example: "store_abc123"
 *                     hasManager:
 *                       type: boolean
 *                       description: 해당 매장에 매니저가 등록되어 있는지 여부
 *                       example: true
 *                     workerCount:
 *                       type: number
 *                       description: 현재 매장의 근무자 수
 *                       example: 3
 *                     isWorker:
 *                       type: boolean
 *                       description: 현재 요청한 사용자가 이 매장에서 근무 중인지 여부
 *                       example: false
 *       400:
 *         description: 잘못된 요청 (mapId 누락 등)
 *       500:
 *         description: 서버 내부 오류
 */

/**
 * @swagger
 * /group/store/workers:
 *   get:
 *     summary: 해당 스토어의 모든 알바생들의 정보를 불러옵니다.
 *     description: Fetches a list of all workers in a specific store, ordered by their active status.
 *     tags: [Alba - Workspace]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: true
 *         description: The ID of the store to retrieve workers from.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of workers in the store.
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
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "홍길동"
 *                       workerId:
 *                         type: string
 *                         example: "user_abc123"
 *       400:
 *         description: Invalid input or missing parameters.
 *       401:
 *         description: Unauthorized access.
 *       404:
 *         description: Worker not found or user is not part of the store.
 *       500:
 *         description: Internal server error.
 */

/**
 * @swagger
 * /group/store/manager:
 *   get:
 *     summary: storeId로 매장 사장님 정보 조회
 *     tags: [Alba - Workspace]
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
 *         description: 사장님 정보 조회 성공
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
 *                     managerId:
 *                       type: string
 *                       example: "manager_test_com"
 *                     name:
 *                       type: string
 *                       example: "김사장"
 *                     contact:
 *                       type: string
 *                       example: "010-1234-5678"
 *                     email:
 *                       type: string
 *                       example: "owner@example.com"
 *       400:
 *         description: storeId 누락 등 잘못된 요청
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /group/alba/works:
 *   get:
 *     summary: 현재 로그인한 알바생의 소속 매장 목록을 조회합니다.
 *     description: 현재 로그인한 알바생의 소속 매장 목록을 조회합니다.
 *     tags: [Alba - Workspace]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 매장 목록 조회 성공
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
 *                     active:
 *                       type: array
 *                       description: 현재 근무지 리스트
 *                       items:
 *                         type: object
 *                         properties:
 *                           storeId:
 *                             type: string
 *                             example: "abc123"
 *                           storeName:
 *                             type: string
 *                             example: "불밥"
 *                           hasManager:  
 *                             type: boolean
 *                             example: false
 *                           isClosed:
 *                             type: boolean
 *                             example: false
 *                           date:
 *                             type: string
 *                             example: "2025.01"
 *                           endDate:
 *                             type: string
 *                             nullable: true
 *                             example: null
 *                     inactive:
 *                       type: array
 *                       description: 과거 근무지 리스트
 *                       items:
 *                         type: object
 *                         properties:
 *                           storeId:
 *                             type: string
 *                             example: "xyz987"
 *                           storeName:
 *                             type: string
 *                             example: "밥불"
 *                           hasManager:  
 *                             type: boolean
 *                             example: false
 *                           isClosed:
 *                             type: boolean
 *                             example: false
 *                           date:
 *                             type: string
 *                             example: "2025.01"
 *                           address:
 *                             type: string
 *                             example: "서울 서대문구 이화여대8길 11"
 *                           endDate:
 *                             type: string
 *                             nullable: true
 *                             example: "2025.04"
 *       401:
 *         description: 인증되지 않은 사용자
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /group/alba/store/{storeId}/retire:
 *   delete:
 *     summary: 매장 퇴사 처리
 *     description: 알바생이 특정 매장에서 퇴사할 때 관련 스케줄과 정보를 비활성화합니다.
 *     tags: [Alba - Workspace]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 퇴사할 매장의 ID
 *     responses:
 *       200:
 *         description: 퇴사 처리 성공
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
 *                       example: "근무 이력을 성공적으로 비활성화했습니다."
 *       400:
 *         description: storeId 누락 등 잘못된 요청
 *       401:
 *         description: 인증되지 않은 사용자
 *       404:
 *         description: 워커 데이터 없음
 *       500:
 *         description: 서버 오류 또는 트랜잭션 충돌
 */

/**
 * @swagger
 * /group/alba/store/{storeId}:
 *   delete:
 *     summary: 사용자의 근무 이력 모두 삭제하기 
 *     description: 사용자가 특정 매장에서의 근무 이력을 완전히 삭제합니다.
 *     tags: [Alba - Workspace]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 삭제할 매장의 ID
 *     responses:
 *       200:
 *         description: 근무 이력 삭제 성공
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
 *                       example: "근무 이력 삭제 완료"
 *       400:
 *         description: storeId 누락 등 잘못된 요청 또는 활성 상태의 매장
 *       401:
 *         description: 인증되지 않은 사용자
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /group/store/worker:
 *   get:
 *     summary: 동료 알바생 정보 조회
 *     description: 매장 ID(storeId)와 알바생 ID(workerId)로 해당 알바생의 이름, 연락처, 근무 시작/종료일을 조회합니다.
 *     tags: [Alba - Workspace]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 매장 ID
 *       - in: query
 *         name: workerId
 *         required: true
 *         schema:
 *           type: string
 *         description: 조회할 알바생의 사용자 ID
 *     responses:
 *       200:
 *         description: 동료 알바생 정보 조회 성공
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
 *                     name:
 *                       type: string
 *                       example: "홍길동"
 *                     contact:
 *                       type: string
 *                       example: "010-1234-5678"
 *                     date:
 *                       type: string
 *                       example: "2025.01"
 *                     endDate:
 *                       type: string
 *                       example: "2025.02"
 *       400:
 *         description: storeId 또는 workerId 누락 등 잘못된 요청
 *       401:
 *         description: 인증되지 않은 사용자
 *       404:
 *         description: 알바생 정보 없음
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /group/store/{storeId}/convert:
 *   get:
 *     summary: 매니저 매장으로 전환
 *     description: 지정한 storeId의 매장을 매니저가 관리하는 매장으로 전환합니다.
 *     tags:
 *       - Alba - Workspace
 *     security:
 *       - bearerAuth: []  
 *     parameters:
 *       - name: storeId
 *         in: path
 *         required: true
 *         description: 전환할 매장의 ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 매장 전환 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 매장이 매니저 관리 매장으로 전환되었습니다.
 *       400:
 *         description: 잘못된 요청 
 *       401:
 *         description: 인증 실패
 *       404:
 *         description: 매장을 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */
