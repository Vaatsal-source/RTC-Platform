import { Router } from "express";
import Workspace from "../models/Workspace.js";
import { redisClient } from "../config/redis.js";
import { cacheMiddleware } from "../middleware/cache.js";

const router = Router();

// Create Workspace
router.post("/create", async (req, res) => {
    try {
        const { name, description, ownerId } = req.body;
        const workspace = new Workspace({ name, description, ownerId });
        await workspace.save();

        // Invalidate all workspaces cache
        await redisClient.del("workspaces:all");

        res.status(201).json({ success: true, workspace });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Workspace creation failed" });
    }
});

// Get All Workspaces
router.get(
    "/",
    cacheMiddleware(() => "workspaces:all"),
    async (req, res) => {
        try {
            const workspaces = await Workspace.find();
            res.json({ success: true, workspaces });
        } catch (err) {
            console.log(err);
            res.status(500).json({ success: false });
        }
    }
);

// Add Member
router.post("/add-member", async (req, res) => {
    try {
        const { workspaceId, userId } = req.body;
        const workspace = await Workspace.findById(workspaceId);

        if (!workspace) {
            return res.status(404).json({ success: false, message: "Workspace not found" });
        }

        workspace.members.push({ userId, role: "member" });
        await workspace.save();

        // Invalidate this workspace's caches
        await redisClient.del(`workspace:${workspaceId}`);
        await redisClient.del(`workspace:${workspaceId}:members`);

        res.json({ success: true, workspace });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false });
    }
});

// Get Members of Workspace
router.get(
    "/:workspaceId/members",
    cacheMiddleware((req) => `workspace:${req.params.workspaceId}:members`),
    async (req, res) => {
        try {
            const { workspaceId } = req.params;
            const workspace = await Workspace.findById(workspaceId).populate("members.userId", "name email");
            res.json({ success: true, workspace });
        } catch (err) {
            console.log(err);
            res.status(500).json({ success: false });
        }
    }
);

// Get Workspace By ID
router.get(
    "/:id",
    cacheMiddleware((req) => `workspace:${req.params.id}`),
    async (req, res) => {
        try {
            const workspace = await Workspace.findById(req.params.id);
            if (!workspace) {
                return res.status(404).json({ success: false, message: "Workspace not found" });
            }
            res.json({ success: true, workspace });
        } catch (err) {
            console.log(err);
            res.status(500).json({ success: false });
        }
    }
);

// Delete Workspace
router.delete("/:id", async (req, res) => {
    try {
        await Workspace.findByIdAndDelete(req.params.id);

        await redisClient.del(`workspace:${req.params.id}`);
        await redisClient.del(`workspace:${req.params.id}:members`);
        await redisClient.del("workspaces:all");

        res.json({ success: true, message: "Workspace deleted" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false });
    }
});

export default router;
