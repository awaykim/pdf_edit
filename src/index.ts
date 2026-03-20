import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import { Request, Response, NextFunction } from "express";

import router from "@/routes/index";
import { optionalAuth } from "@/middlewares/auth";
import { groupSwaggerSpec } from "@/swaggers/kkaeal-group.config";
import { errorHandler } from "@/middlewares/error";

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || "8080", 10);
const apiUrl = process.env.API_URL || "http://localhost";

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(optionalAuth);

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.originalUrl === "/favicon.ico") return next();

  const ip = req.headers['x-forwarded-for'] || req.ip || "";
  const method = req.method.toUpperCase();
  const url = req.originalUrl || "";
  const uid = (req as any).user?.uid || "anonymous"; // 타입 문제 있으면 any로 우선
  const query = JSON.stringify(req.query || {});
  const body = JSON.stringify(req.body || {});

  console.log(`${ip} [${method}] ${url} - UID: ${uid} - Query: ${query} - Body: ${body}`);
  next();
});


app.use((req: Request, res: Response, next: NextFunction) => {
  res.success = (data: any) => {
    res.json({
      success: true,
      payload: data,
    });
  };

  res.error = (status = 500, code = "E999", message = "Unhandled Server") => {
    const response = {
      success: false,
      code,
      message,
    };

    res.status(status).json(response);
  };

  next();
});


app.use(router);

// 기본 GET 요청 핸들러
app.get("/", (req: Request, res: Response) => { res.send("Kkeaal API Server") });

// Swagger 설정
app.use("/swagger", swaggerUi.serve, swaggerUi.setup(groupSwaggerSpec));

// error middleware 
app.use(errorHandler as (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => void);

// 서버 실행
app.listen(port, () => {
  console.log(`[${process.env.NODE_ENV}] 서버 실행 중: ${apiUrl}:${port}`);
});


