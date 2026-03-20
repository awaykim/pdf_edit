import { Request, Response, NextFunction } from "express";
import { generateUserWorkingInfoCSV, generateStoreManagingInfoCSV, generateAllUserWorkingInfoCSV, generateAllStoreManagingInfoCSV, generateStoreShiftInfoCSV, generateAllStoreShiftInfoCSV } from "@/services/dashboard";
import { AppError } from "@/utils/errorParser";

const DASHBOARD_PASSWORD = "start0101";

export const downloadUserWorkingInfoCSV = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, password } = req.query;

    // 비밀번호 검증
    if (!password || password !== DASHBOARD_PASSWORD) {
      return res.error(400, "SYSTEM.INVALID_PASSWORD", "비밀번호가 잘못되었습니다.");
    }

    // 오늘 날짜 (YYYY-MM-DD 형식)
    const today = new Date();
    const dateString = today.toISOString().split('T')[0];

    let csv: string;
    let filename: string;

    if (userId) {
      // 특정 사용자의 정보
      csv = await generateUserWorkingInfoCSV(userId as string);
      filename = `${dateString}-user-working-info.csv`;
    } else {
      // 모든 사용자의 정보
      csv = await generateAllUserWorkingInfoCSV();
      filename = `${dateString}-user-working-info-all.csv`;
    }

    // CSV 파일로 응답
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("❌ [downloadUserWorkingInfoCSV] 오류:", error);
    next(error);
  }
};

export const downloadStoreManagingInfoCSV = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, password } = req.query;

    // 비밀번호 검증
    if (!password || password !== DASHBOARD_PASSWORD) {
      return res.error(400, "SYSTEM.INVALID_PASSWORD", "비밀번호가 잘못되었습니다.");
    }

    // 오늘 날짜 (YYYY-MM-DD 형식)
    const today = new Date();
    const dateString = today.toISOString().split('T')[0];

    let csv: string;
    let filename: string;

    if (storeId) {
      // 특정 가게의 정보
      csv = await generateStoreManagingInfoCSV(storeId as string);
      filename = `${dateString}-store-managing-info.csv`;
    } else {
      // 모든 가게의 정보
      csv = await generateAllStoreManagingInfoCSV();
      filename = `${dateString}-store-managing-info-all.csv`;
    }

    // CSV 파일로 응답
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("❌ [downloadStoreManagingInfoCSV] 오류:", error);
    next(error);
  }
};

export const downloadStoreShiftInfoCSV = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, password } = req.query;

    // 비밀번호 검증
    if (!password || password !== DASHBOARD_PASSWORD) {
      return res.error(400, "SYSTEM.INVALID_PASSWORD", "비밀번호가 잘못되었습니다.");
    }

    // 오늘 날짜 (YYYY-MM-DD 형식)
    const today = new Date();
    const dateString = today.toISOString().split('T')[0];

    let csv: string;
    let filename: string;

    if (storeId) {
      // 특정 가게의 시프트 정보
      csv = await generateStoreShiftInfoCSV(storeId as string);
      filename = `${dateString}-store-shift-info.csv`;
    } else {
      // 모든 가게의 시프트 정보
      csv = await generateAllStoreShiftInfoCSV();
      filename = `${dateString}-store-shift-info-all.csv`;
    }

    // CSV 파일로 응답
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("❌ [downloadStoreShiftInfoCSV] 오류:", error);
    next(error);
  }
};


