import express from "express";
import { optionalAuth, authenticate } from "@/middlewares/auth";
import { registerManagerStore, getManagerStores, getStoreInfo, updateStoreInfo, getStoreManagerInfo } from "@/controllers/manager/store";

const managerStoreRouter = express.Router(); 

managerStoreRouter.post("/store/register", authenticate, registerManagerStore);
managerStoreRouter.get("/stores", authenticate, getManagerStores);
managerStoreRouter.get("/store/:storeId", authenticate, getStoreInfo);
managerStoreRouter.get("/store/:storeId/manager", authenticate, getStoreManagerInfo);
managerStoreRouter.patch("/store/:storeId", authenticate, updateStoreInfo);


export default managerStoreRouter;

/**
 * @swagger
 * tags:
 *   - name: Manager - Store
 *     description: 매니저 매장 관리
 */

/**
 * @swagger
 * /manager/store/register:
 *   post:
 *     summary: 매장 등록
 *     description: Kakao Map Data, Owner Name, Contact POST
 *     tags: [Manager - Store]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - map
 *               - ownerName
 *               - contact
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
 *               ownerName:
 *                 type: string
 *                 description: 대표자 이름
 *                 example: "김사장"
 *               contact:
 *                 type: string
 *                 description: 연락처
 *                 example: "010-7777-0000"
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
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /manager/stores:
 *   get:
 *     summary: 매니저가 가진 모든 매장.
 *     description: Fetches a list of all workers in a specific store, ordered by their active status.
 *     tags: [Manager - Store]
 *     security:
 *       - bearerAuth: []
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
 *                       storeNmae:
 *                         type: string
 *                         example: "가게가게가게"
 *                       storeId:
 *                         type: string
 *                         example: "store123142356"
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
 * /manager/store/{storeId}:
 *   get:
 *     summary: 한 매장의 정보 불러오기.
 *     tags: [Manager - Store]
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 스토어 id
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
 *                     ownerName:
 *                        type: string
 *                        example: "김사장"
 *                     contact:
 *                        type: string
 *                        example: "010-..."
 *                     storeName:
 *                        type: string
 *                        example: "어느가게.."
 *       401:
 *         description: 인증되지 않은 사용자
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /manager/store/{storeId}/manager:
 *   get:
 *     summary: 매장 사장님 정보 조회
 *     tags: [Manager - Store]
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 스토어 id
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: 인증되지 않은 사용자
 *       500:
 *         description: 서버 오류
 */

/**
 * @swagger
 * /manager/store/{storeId}:
 *   patch:
 *     summary: 매장 정보 수정
 *     description: Kakao Map Data, Owner Name, Contact Patch
 *     tags: [Manager - Store]
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 스토어 id
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ownerName:
 *                 type: string
 *                 description: 대표자 이름
 *                 example: "김사장"
 *               contact:
 *                 type: string
 *                 description: 연락처
 *                 example: "010-7777-0000"
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
 *       500:
 *         description: 서버 오류
 */
