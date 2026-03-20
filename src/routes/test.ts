
import express from "express";
import { signupWithServer } from "../controllers/user";

const testRouter = express.Router();

/**
 * @swagger
 * /test/signup:
 *   post:
 *     summary: 이걸로 간편하게 회원가입 ㄱ 
 *     tags: [Test]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: start0101 이거 치면 됨 ㅇ
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 example: test@test.com
 *               password:
 *                 type: string
 *                 example: test1234
 *               name:
 *                 type: string
 *                 example: 홍길동
 *               role:
 *                 type: string
 */

testRouter.post("/signup", signupWithServer);

// ⚠️ 테스트용 — AI 파이프라인 검증 후 삭제
testRouter.post("/force-500", (_req, _res, next) => {
  const err = new Error("🧪 [Test] AI 파이프라인 테스트용 강제 500 에러");
  (err as any).name = "TestError";
  next(err);
});

export default testRouter;


// /**
//  * @swagger
//  * /test/me:
//  *   get:
//  *     summary: Get current user information
//  *     description: Returns all information about the currently logged in user
//  *     tags: [Test]
//  *     security:
//  *       - bearerAuth: []
//  *     responses:
//  *       200:
//  *         description: User information retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 payload:
//  *                   type: object
//  *                   description: User information from the request
//  *       401:
//  *         description: User not authenticated
//  */
// router.get("/me", authenticate, (req, res) => {
//   return res.success({
//     user: req.user,
//     headers: req.headers,
//   });
// });


// /**
//  * @swagger
//  * /test/all-uids:
//  *   get:
//  *     summary: Get all user UIDs
//  *     description: Fetches all user UIDs from the Firestore "users" collection
//  *     tags: [Test]
//  *     responses:
//  *       200:
//  *         description: Successfully retrieved all user UIDs
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 uids:
//  *                   type: array
//  *                   items:
//  *                     type: string
//  *                   example: ["uid1", "uid2", "uid3"]
//  *       500:
//  *         description: Failed to fetch UIDs
//  */
// router.get("/all-uids", async (req, res) => {
//   try {
//     const usersCollection = db.collection("users");
//     const snapshot = await usersCollection.get();

//     const uids = snapshot.docs.map(doc => doc.id);

//     return res.status(200).json({ success: true, uids });
//   } catch (error) {
//     console.error("❌ Failed to fetch UIDs:", error);
//     return res.status(500).json({ success: false, message: "Failed to fetch UIDs", error });
//   }
// });

// router.get("/", async (req, res) => {
//   try {
//     const docRef = db.collection("test").doc("hello");
//     await docRef.set({ message: "Firestore 연결 성공!" });

//     const snapshot = await docRef.get();
//     const data = snapshot.exists ? snapshot.data() : null;

//     return res.status(200).json({ success: true, data });
//   } catch (error) {
//     console.error("❌ Firestore 테스트 실패:", error);
//     return res.status(500).json({ success: false, message: "Firestore 연결 실패", error });
//   }
// });

