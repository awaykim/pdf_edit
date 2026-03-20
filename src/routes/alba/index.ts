import express from "express";
import albaScheduleRouter from "./schedule";
import albaRequestRouter from "./request";
import albaWorkspaceRouter from "./workspace";

const albaRouter = express.Router();

albaRouter.use(albaScheduleRouter);
albaRouter.use(albaRequestRouter);
albaRouter.use(albaWorkspaceRouter);

export default albaRouter;