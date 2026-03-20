import * as db from "@/firebase/db";

export const getStoreName = async (storeId: string): Promise<string> => {
  try {
    if (!storeId) return "";
    const storeRef = db.doc(`stores/${storeId}`);
    const storeSnap = await storeRef.get();
    if (!storeSnap.exists) {
      console.warn(`⚠️ storeId ${storeId} not found.`);
      return "";
    }
    return storeSnap.get("place_name") || "";
  } catch (err) {
    console.error(`❌ getStoreName error:`, err);
    return "";
  }
};