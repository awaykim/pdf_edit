import express from "express";
import userRouter from "./user";
import testRouter from "./test"
import albaRouter from "./alba/index"
import managerRouter from "./manager/index";
import dashboardRouter from "./dashboard";

const router = express.Router();

router.use("/v1/user", userRouter);
router.use("/v1/group", albaRouter);
router.use("/v1/manager", managerRouter)
router.use("/v1/dashboard", dashboardRouter);
router.use("/v1/test", testRouter);

export default router;

