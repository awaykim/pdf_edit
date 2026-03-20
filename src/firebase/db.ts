/**
 * 파이어베이스 데이터베이스 연결 파일
 * DEV, LOCAL 환경에서 > 테스트 DB 사용
 * PROD 환경에서 > 실제 DB 사용
*/
import { db } from "./config";

const devDB = db.collection("dev").doc("v0.9");
const isProd = process.env.NODE_ENV === "production";

const getBase = () => (isProd ? db : devDB);

// 🔹 DocumentReference 리턴 - 경로 기반
export function doc(path: string): FirebaseFirestore.DocumentReference;
export function doc(collectionName: string, docId: string): FirebaseFirestore.DocumentReference;
export function doc(arg1: string, arg2?: string): FirebaseFirestore.DocumentReference {
  const base = getBase();

  if (arg2) {
    return isProd
      ? db.collection(arg1).doc(arg2)
      : devDB.collection(arg1).doc(arg2);
  }

  const segments = arg1.split("/").filter(Boolean);
  let ref: FirebaseFirestore.Firestore | FirebaseFirestore.DocumentReference | FirebaseFirestore.CollectionReference = base;

  for (let i = 0; i < segments.length; i++) {
    ref = i % 2 === 0
      ? (ref as FirebaseFirestore.Firestore | FirebaseFirestore.DocumentReference).collection(segments[i])
      : (ref as FirebaseFirestore.CollectionReference).doc(segments[i]);
  }

  return ref as FirebaseFirestore.DocumentReference;
}

// 🔹 CollectionReference 리턴
export const collection = (path: string): FirebaseFirestore.CollectionReference => {
  const base = getBase();
  const segments = path.split("/").filter(Boolean);
  let ref: FirebaseFirestore.Firestore | FirebaseFirestore.DocumentReference | FirebaseFirestore.CollectionReference = base;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (i % 2 === 0) {
      // even index → collection
      ref = (ref as FirebaseFirestore.Firestore | FirebaseFirestore.DocumentReference).collection(segment);
    } else {
      // odd index → doc
      ref = (ref as FirebaseFirestore.CollectionReference).doc(segment);
    }
  }

  // 마지막은 반드시 collection이어야 함
  if ((segments.length - 1) % 2 !== 0) {
    throw new Error(`[collection] "${path}" 경로는 collection으로 끝나야 합니다.`);
  }

  return ref as FirebaseFirestore.CollectionReference;
};


type TransactionFunction<T> = (transaction: FirebaseFirestore.Transaction) => Promise<T>;

export const runTransaction = async <T>(
  updateFn: TransactionFunction<T>
): Promise<T> => {
  if (isProd) {
    return db.runTransaction(updateFn);
  }
  const fakeTx = {
    get: (ref: FirebaseFirestore.DocumentReference) => ref.get(),
    set: async (ref: FirebaseFirestore.DocumentReference, data: any, options?: any) =>
      await ref.set(data, options),
    update: async (ref: FirebaseFirestore.DocumentReference, data: any) =>
      await ref.update(data),
    delete: async (ref: FirebaseFirestore.DocumentReference) =>
      await ref.delete(),
  };

  return updateFn(fakeTx as unknown as FirebaseFirestore.Transaction);
};

export const batch = (): FirebaseFirestore.WriteBatch => {
  if (isProd) {
    return db.batch();
  }

  const fakeBatch: Partial<FirebaseFirestore.WriteBatch> = {};
  const ops: (() => Promise<any>)[] = [];

  fakeBatch.set = (
    ref: FirebaseFirestore.DocumentReference,
    data: any,
    options?: FirebaseFirestore.SetOptions
  ) => {
    ops.push(() =>
      options ? ref.set(data, options) : ref.set(data)
    );
    return fakeBatch as FirebaseFirestore.WriteBatch;
  };

  fakeBatch.update = (
    ref: FirebaseFirestore.DocumentReference,
    data: FirebaseFirestore.UpdateData<any>
  ) => {
    ops.push(() => ref.update(data));
    return fakeBatch as FirebaseFirestore.WriteBatch;
  };

  fakeBatch.delete = (
    ref: FirebaseFirestore.DocumentReference
  ) => {
    ops.push(() => ref.delete());
    return fakeBatch as FirebaseFirestore.WriteBatch;
  };

  fakeBatch.commit = async () => {
    console.log("[DEV] Fake batch committing...");
    const results = await Promise.all(ops.map((op) => op()));
    return results as FirebaseFirestore.WriteResult[];
  };

  return fakeBatch as FirebaseFirestore.WriteBatch;
};

