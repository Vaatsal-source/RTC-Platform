import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { redisClient } from "../config/redis.js";
import { validate, registerSchema, loginSchema } from "../middleware/validate.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_prod';
const JWT_EXPIRES_IN = '7d';

router.post("/register", validate(registerSchema), async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ success: false, message: "Email already registered" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword });
        await user.save();
        const token = jwt.sign(
            { userId: user._id.toString(), email: user.email },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        res.status(201).json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Registration failed" });
    }
});

router.post("/login", validate(loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid password" });
        }
        const token = jwt.sign(
            { userId: user._id.toString(), email: user.email },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        res.json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Login failed" });
    }
});

router.post("/logout", requireAuth, async (req: AuthRequest, res) => {
    try {
        const authHeader = req.headers.authorization!;
        const token = authHeader.split(' ')[1];
        const decoded = jwt.decode(token) as { exp: number } | null;
        const now = Math.floor(Date.now() / 1000);
        const ttl = decoded?.exp ? decoded.exp - now : 60 * 60 * 24 * 7;
        if (ttl > 0) {
            await redisClient.setex(`blacklist:${token}`, ttl, '1');
        }
        res.json({ success: true, message: "Logged out successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Logout failed" });
    }
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
    try {
        const user = await User.findById(req.user!.userId).select("-password");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.json({ success: true, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

export default router;
