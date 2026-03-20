// 파이어베이스 설정 파일
import admin from "firebase-admin";
import { cert, initializeApp } from "firebase-admin/app";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();


const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const projectId = process.env.GOOGLE_PROJECT_ID;

if (!privateKey || !clientEmail || !projectId) {
  throw new Error("Missing Firebase environment variables");
}

initializeApp({
  credential: cert({
    projectId,
    clientEmail,
    privateKey,
  }),
});


const db = admin.firestore();
const auth = admin.auth();
const Timestamp = admin.firestore.Timestamp;
const FieldValue = admin.firestore.FieldValue;

export { db, auth, admin, Timestamp, FieldValue };
