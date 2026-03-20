import { Request, Response, NextFunction } from "express";
import { admin, FieldValue, Timestamp } from "@/firebase/config";
import * as db from "@/firebase/db";
import { AppError } from "@/utils/errorParser";

export const registerManagerStore = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.uid;
    if (!userId) throw new AppError("USER.NOT_AUTHENTICATED");

    const { map, ownerName, contact } = req.body;
    if (!map?.id) throw new AppError("SYSTEM.INVALID_INPUT");

    const mapId = map.id;
    const storeId = db.collection("stores").doc().id;
    const newStoreRef = db.doc(`stores/${storeId}`);

    const existingStoreQuery = db.collection("stores")
      .where("mapId", "==", mapId)
      .where("isActive", "==", true);

    const existingStoreSnap = await existingStoreQuery.get();

    if (existingStoreSnap.size > 2) throw new AppError("STORE.MANAGER_ALREADY_EXISTS");

    const hasManager = existingStoreSnap.docs.some(doc => !!doc.data().managerId);
    if (hasManager) throw new AppError("STORE.MANAGER_ALREADY_EXISTS");

    await db.runTransaction(async (tx) => {
      existingStoreSnap.forEach((doc) => {
        tx.update(doc.ref, {
          isClosed: true,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      tx.set(newStoreRef, {
        ...map,
        name: map.place_name,
        mapId,
        ownerName,
        contact,
        managerId: userId,
        isActive: true,
        isClosed: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    console.log(`✅ [registerManagerStore] 매장 등록 완료: ${storeId}`);
    return res.success({ storeId });
  } catch (error) {
    console.error("❌[registerManagerStore] 오류:", error);
    return next(error);
  }
};

export const getManagerStores = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.uid) {
      throw new AppError("USER.NOT_AUTHENTICATED");
    }

    const { uid: userId } = req.user;

    const storeQuerySnap = await db
      .collection("stores")
      .where("managerId", "==", userId)
      .where("isActive", "==", true)
      .get();

    const stores = storeQuerySnap.docs.map((doc) => ({
      storeId: doc.id,
      storeName: doc.get("name") || doc.get("place_name"), 
    }));

    return res.success({ stores });
  } catch (error) {
    console.error("❌[getManagerStores] 에러:", error);
    next(error);
  }
};

export const getStoreInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.params;
    if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT");
    if (!req.user || !req.user.uid) throw new AppError("USER.NOT_AUTHENTICATED");

    const storeSnap = await db.doc(`stores/${storeId}`).get();
    const stroeData = storeSnap.data();

    return res.success(stroeData);
  } catch (error) {
    console.error("❌[getManagerStores] 에러:", error);
    next(error);
  }
};

export const updateStoreInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.uid) {
      throw new AppError("USER.NOT_AUTHENTICATED");
    }

    const { storeId } = req.params;
    if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT");

    const { ownerName, contact } = req.body;

    const updateData: Record<string, any> = {
      ...(ownerName !== undefined && { ownerName }),
      ...(contact !== undefined && { contact }),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (Object.keys(updateData).length === 1) { // updatedAt만 있는 경우
      throw new AppError("SYSTEM.INVALID_INPUT");
    }

    await db.collection("stores").doc(storeId).update(updateData);

    res.success({ message: "가게 정보가 수정되었습니다." });
  } catch (error) {
    console.error("❌[getManagerStores] 에러:", error);
    next(error);
  }
};

export const getStoreManagerInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user?.uid;
    if (!uid) throw new AppError("USER.NOT_AUTHENTICATED");

    const { storeId } = req.params;
    if (!storeId) throw new AppError("SYSTEM.INVALID_INPUT");

    const storeSnap = await db.doc(`stores/${storeId}`).get();
    if (!storeSnap.exists) throw new AppError("STORE.NOT_FOUND");

    const storeData = storeSnap.data();
    const managerId = storeData?.managerId || "";
    if (!managerId) {
      return res.success({
        managerId: "",
        name: "",
        contact: "",
      });
    }

    const managerSnap = await db.doc(`users/${managerId}`).get();
    const managerData = managerSnap.data();

    return res.success({
      managerId,
      name: managerData?.name || "",
      contact: managerData?.contact || "",
    });
  } catch (error) {
    console.error("❌[getStoreManagerInfo] 에러:", error);
    next(error);
  }
};
