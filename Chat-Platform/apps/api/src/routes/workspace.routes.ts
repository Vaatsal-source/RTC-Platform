import { Router } from "express";
import Workspace from "../models/Workspace.js";
import User from "../models/User.js";
import { redisClient } from "../config/redis.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate, createWorkspaceSchema, addMemberSchema } from "../middleware/validate.js";
import { enqueueAudit, enqueueEmail, enqueueNotification } from "../lib/queues.js";

const router: Router = Router();

router.post("/create", requireAuth, validate(createWorkspaceSchema), async (req: AuthRequest, res) => {
    try {
        const { name, description } = req.body;
        const ownerId = req.user!.userId;

        const workspace = new Workspace({ name, description, ownerId });
        await workspace.save();
        await redisClient.del("workspaces:all");
        void enqueueAudit("workspace_created", ownerId, {
            workspaceId: workspace._id.toString(),
            name,
        });

        res.status(201).json({ success: true, workspace });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Workspace creation failed" });
    }
});

router.get("/", requireAuth, cacheMiddleware(() => "workspaces:all"), async (req, res) => {
    try {
        const workspaces = await Workspace.find();
        res.json({ success: true, workspaces });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

router.post("/add-member", requireAuth, validate(addMemberSchema), async (req: AuthRequest, res) => {
    try {
        const { workspaceId, userId } = req.body;

        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) {
            return res.status(404).json({ success: false, message: "Workspace not found" });
        }

        const requesterId = req.user!.userId;
        const isOwner = workspace.ownerId.toString() === requesterId;
        const isAdmin = workspace.members.some(
            (m: any) => m.userId.toString() === requesterId && m.role === 'admin'
        );

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: "Only workspace owner or admin can add members" });
        }

        const alreadyMember = workspace.members.some((m: any) => m.userId.toString() === userId);
        if (alreadyMember) {
            return res.status(409).json({ success: false, message: "User is already a member" });
        }

        workspace.members.push({ userId, role: "member" });
        await workspace.save();

        await redisClient.del(`workspace:${workspaceId}`);
        await redisClient.del(`workspace:${workspaceId}:members`);

        const invitedUser = await User.findById(userId).select("name email");
        if (invitedUser) {
            void enqueueNotification("workspace_invite", {
                userId,
                message: `You were added to workspace ${workspace.name}`,
                type: "invite",
                senderId: requesterId,
            });

            void enqueueEmail("workspace_invite_email", {
                to: invitedUser.email,
                subject: `You were added to ${workspace.name}`,
                body: `Hi ${invitedUser.name}, you were added to the workspace ${workspace.name}.`,
                userId,
            });
        }

        void enqueueAudit("workspace_member_added", requesterId, {
            workspaceId,
            invitedUserId: userId,
        });

        res.json({ success: true, workspace });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

router.get("/:workspaceId/members", requireAuth, cacheMiddleware((req) => `workspace:${req.params.workspaceId}:members`), async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.workspaceId).populate("members.userId", "name email");
        if (!workspace) {
            return res.status(404).json({ success: false, message: "Workspace not found" });
        }
        res.json({ success: true, workspace });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

router.get("/:id", requireAuth, cacheMiddleware((req) => `workspace:${req.params.id}`), async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);
        if (!workspace) {
            return res.status(404).json({ success: false, message: "Workspace not found" });
        }
        res.json({ success: true, workspace });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);
        if (!workspace) {
            return res.status(404).json({ success: false, message: "Workspace not found" });
        }

        if (workspace.ownerId.toString() !== req.user!.userId) {
            return res.status(403).json({ success: false, message: "Only workspace owner can delete it" });
        }

        await Workspace.findByIdAndDelete(req.params.id);
        await redisClient.del(`workspace:${req.params.id}`);
        await redisClient.del(`workspace:${req.params.id}:members`);
        await redisClient.del("workspaces:all");
        void enqueueAudit("workspace_deleted", req.user!.userId, {
            workspaceId: req.params.id,
            name: workspace.name,
        });

        res.json({ success: true, message: "Workspace deleted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

export default router;
