import express from "express";
import managerStoreRouter from "./store";
import managerWorkerRouter from "./worker";
import managerShiftRouter from "./request";
import managerQuickRouter from "./quick";

const managerRouter = express.Router();

managerRouter.use(managerStoreRouter);
managerRouter.use(managerWorkerRouter);
managerRouter.use(managerShiftRouter);
managerRouter.use(managerQuickRouter);

export default managerRouter;