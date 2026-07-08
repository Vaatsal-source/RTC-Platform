import { Router } from "express";
import Channel from "../models/Channel.js";
import { redisClient } from "../config/redis.js";
import { cacheMiddleware } from "../middleware/cache.js";

const router = Router();

router.post("/create", async (req, res) => {
    try {
        const { name, workspaceId, isPrivate } = req.body;
        const channel = new Channel({ name, workspaceId, isPrivate });
        await channel.save();

        // Invalidate channels list for this workspace
        await redisClient.del(`channels:workspace:${workspaceId}`);

        res.status(201).json({ success: true, channel });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Channel creation failed" });
    }
});

router.get(
    "/workspace/:workspaceId",
    cacheMiddleware((req) => `channels:workspace:${req.params.workspaceId}`),
    async (req, res) => {
        try {
            const { workspaceId } = req.params;
            const channels = await Channel.find({ workspaceId });
            res.json({ success: true, channels });
        } catch (err) {
            console.log(err);
            res.status(500).json({ success: false });
        }
    }
);

router.delete("/:id", async (req, res) => {
    try {
        const channel = await Channel.findByIdAndDelete(req.params.id);

        if (channel) {
            await redisClient.del(`channels:workspace:${channel.workspaceId}`);
        }

        res.json({ success: true, message: "Channel deleted" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false });
    }
});

export default router;
