import express from "express";

const router = express.Router();

router.get("/", (_req, res) => {
    res.json({
        registrationEnabled: process.env.DISABLE_REGISTRATION !== "true"
    });
});

export default router;
