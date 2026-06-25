import { Router } from "express";
import Message from "../models/Message.js";
import { redisClient } from "../config/redis.js";
import { cacheMiddleware } from "../middleware/cache.js";

const router = Router();

const MESSAGE_LIMIT = 50;

router.post("/send", async (req, res) => {
    try {
        const { senderId, channelId, content } = req.body;
        const message = new Message({ senderId, channelId, content });
        await message.save();
        await redisClient.del(`messages:channel:${channelId}`);
        res.status(201).json({ success: true, message });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Message sending failed" });
    }
});

router.get(
    "/channel/:channelId",
    cacheMiddleware((req) => `messages:channel:${req.params.channelId}`),
    async (req, res) => {
        try {
            const { channelId } = req.params;
            const messages = await Message.find({ channelId })
                .populate("senderId", "name email")
                .sort({ createdAt: -1 })
                .limit(MESSAGE_LIMIT);
            res.json({ success: true, messages });
        } catch (err) {
            console.log(err);
            res.status(500).json({ success: false });
        }
    }
);

router.delete("/:id", async (req, res) => {
    try {
        const message = await Message.findByIdAndDelete(req.params.id);
        if (message) {
            await redisClient.del(`messages:channel:${message.channelId}`);
        }
        res.json({ success: true, message: "Message deleted" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const { content } = req.body;
        const message = await Message.findByIdAndUpdate(
            req.params.id,
            { content, edited: true },
            { new: true }
        );
        if (message) {
            await redisClient.del(`messages:channel:${message.channelId}`);
        }
        res.json({ success: true, message });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false });
    }
});

export default router;
