import express from "express";
import authRoutes from "./routes/auth.routes.js";
import workspaceRoutes from "./routes/workspace.routes.js";
import channelRoutes from "./routes/channel.routes.js";
import messageRoutes from "./routes/message.routes.js";

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/workspace", workspaceRoutes);
app.use("/channel", channelRoutes);
app.use("/message", messageRoutes);

// Test Route
app.get("/", (req, res) => {
    res.send("Backend Running");
});

export default app;