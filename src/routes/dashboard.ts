import express from "express";
import { downloadUserWorkingInfoCSV, downloadStoreManagingInfoCSV, downloadStoreShiftInfoCSV } from "@/controllers/dashboard";


const dashboardRouter = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Dashboard
 *     description: 대시보드 CSV 다운로드 API
 */

/**
 * @swagger
 * /dashboard/csv/user:
 *   get:
 *     summary: 사용자의 근무 정보를 CSV로 다운로드
 *     description: 특정 사용자 또는 모든 사용자의 근무 정보를 CSV 형식으로 다운로드합니다. userId를 지정하면 특정 사용자, 미지정하면 모든 사용자의 정보를 받습니다.
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: 사용자 ID (선택사항, 없으면 전체)
 *       - in: query
 *         name: password
 *         required: true
 *         schema:
 *           type: string
 *         description: 대시보드 접근 비밀번호
 *     responses:
 *       200:
 *         description: CSV 파일 다운로드 성공
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         description: 비밀번호가 잘못되었음
 *       500:
 *         description: 서버 오류
 */
dashboardRouter.get("/csv/user", downloadUserWorkingInfoCSV);

/**
 * @swagger
 * /dashboard/csv/store:
 *   get:
 *     summary: 가게의 근무자 정보를 CSV로 다운로드
 *     description: 특정 가게 또는 모든 가게의 근무자 정보를 CSV 형식으로 다운로드합니다. storeId를 지정하면 특정 가게, 미지정하면 모든 가게의 정보를 받습니다.
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: false
 *         schema:
 *           type: string
 *         description: 가게 ID (선택사항, 없으면 전체)
 *       - in: query
 *         name: password
 *         required: true
 *         schema:
 *           type: string
 *         description: 대시보드 접근 비밀번호
 *     responses:
 *       200:
 *         description: CSV 파일 다운로드 성공
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         description: 비밀번호가 잘못되었음
 *       500:
 *         description: 서버 오류
 */
dashboardRouter.get("/csv/store", downloadStoreManagingInfoCSV);

/**
 * @swagger
 * /dashboard/csv/shift:
 *   get:
 *     summary: 가게의 시프트 요청 정보를 CSV로 다운로드
 *     description: 특정 가게 또는 모든 가게의 시프트 요청 정보를 CSV 형식으로 다운로드합니다. storeId를 지정하면 특정 가게, 미지정하면 모든 가게의 정보를 받습니다.
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: storeId
 *         required: false
 *         schema:
 *           type: string
 *         description: 가게 ID (선택사항, 없으면 전체)
 *       - in: query
 *         name: password
 *         required: true
 *         schema:
 *           type: string
 *         description: 대시보드 접근 비밀번호
 *     responses:
 *       200:
 *         description: CSV 파일 다운로드 성공
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         description: 비밀번호가 잘못되었음
 *       500:
 *         description: 서버 오류
 */
dashboardRouter.get("/csv/shift", downloadStoreShiftInfoCSV);

export default dashboardRouter;
