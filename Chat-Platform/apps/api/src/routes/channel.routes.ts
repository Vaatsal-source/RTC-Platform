import { Router } from "express";
import Channel from "../models/Channel.js";
import Workspace from "../models/Workspace.js";
import { redisClient } from "../config/redis.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate, createChannelSchema } from "../middleware/validate.js";
import { enqueueAudit } from "../lib/queues.js";

const router: Router = Router();

router.post("/create", requireAuth, validate(createChannelSchema), async (req: AuthRequest, res) => {
    try {
        const { name, workspaceId, isPrivate } = req.body;

        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) {
            return res.status(404).json({ success: false, message: "Workspace not found" });
        }

        const requesterId = req.user!.userId;
        const isMember = workspace.members.some((m: any) => m.userId.toString() === requesterId);
        const isOwner = workspace.ownerId.toString() === requesterId;

        if (!isOwner && !isMember) {
            return res.status(403).json({ success: false, message: "You are not a member of this workspace" });
        }

        const channel = new Channel({ name, workspaceId, isPrivate });
        await channel.save();
        await redisClient.del(`channels:workspace:${workspaceId}`);
        void enqueueAudit("channel_created", requesterId, {
            workspaceId,
            channelId: channel._id.toString(),
            name,
            isPrivate: Boolean(isPrivate),
        });

        res.status(201).json({ success: true, channel });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Channel creation failed" });
    }
});

router.get("/workspace/:workspaceId", requireAuth, cacheMiddleware((req) => `channels:workspace:${req.params.workspaceId}`), async (req, res) => {
    try {
        const channels = await Channel.find({ workspaceId: req.params.workspaceId });
        res.json({ success: true, channels });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
        const channel = await Channel.findById(req.params.id);
        if (!channel) {
            return res.status(404).json({ success: false, message: "Channel not found" });
        }

        const workspace = await Workspace.findById(channel.workspaceId);
        if (!workspace) {
            return res.status(404).json({ success: false, message: "Workspace not found" });
        }

        const requesterId = req.user!.userId;
        const isOwner = workspace.ownerId.toString() === requesterId;
        const isAdmin = workspace.members.some(
            (m: any) => m.userId.toString() === requesterId && m.role === 'admin'
        );

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: "Only workspace owner or admin can delete channels" });
        }

        await Channel.findByIdAndDelete(req.params.id);
        await redisClient.del(`channels:workspace:${channel.workspaceId}`);
        void enqueueAudit("channel_deleted", requesterId, {
            workspaceId: channel.workspaceId.toString(),
            channelId: req.params.id,
            name: channel.name,
        });

        res.json({ success: true, message: "Channel deleted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

export default router;
