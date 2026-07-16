import { Router } from "express";
import Message from "../models/Message.js";
import { redisClient } from "../config/redis.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate, sendMessageSchema, editMessageSchema } from "../middleware/validate.js";

const router = Router();

const MESSAGE_LIMIT = 50;

router.post("/send", requireAuth, validate(sendMessageSchema), async (req: AuthRequest, res) => {
    try {
        const { channelId, content } = req.body;
        const senderId = req.user!.userId;

        const message = new Message({ senderId, channelId, content });
        await message.save();
        await redisClient.del(`messages:channel:${channelId}`);

        res.status(201).json({ success: true, message });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Message sending failed" });
    }
});

router.get("/channel/:channelId", requireAuth, cacheMiddleware((req) => `messages:channel:${req.params.channelId}`), async (req, res) => {
    try {
        const { channelId } = req.params;
        const messages = await Message.find({ channelId })
            .populate("senderId", "name email")
            .sort({ createdAt: -1 })
            .limit(MESSAGE_LIMIT);
        res.json({ success: true, messages: messages.reverse() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

router.put("/:id", requireAuth, validate(editMessageSchema), async (req: AuthRequest, res) => {
    try {
        const message = await Message.findById(req.params.id);
        if (!message) {
            return res.status(404).json({ success: false, message: "Message not found" });
        }

        if (message.senderId.toString() !== req.user!.userId) {
            return res.status(403).json({ success: false, message: "You can only edit your own messages" });
        }

        message.content = req.body.content;
        message.edited = true;
        await message.save();
        await redisClient.del(`messages:channel:${message.channelId}`);

        res.json({ success: true, message });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
        const message = await Message.findById(req.params.id);
        if (!message) {
            return res.status(404).json({ success: false, message: "Message not found" });
        }

        if (message.senderId.toString() !== req.user!.userId) {
            return res.status(403).json({ success: false, message: "You can only delete your own messages" });
        }

        await Message.findByIdAndDelete(req.params.id);
        await redisClient.del(`messages:channel:${message.channelId}`);

        res.json({ success: true, message: "Message deleted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

export default router;
