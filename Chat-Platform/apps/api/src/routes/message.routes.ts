import { Router } from "express";
import Message from "../models/Message.js";

const router = Router();

// Send Message
router.post("/send", async (req, res) => {

    try {

        const {
            senderId,
            channelId,
            content
        } = req.body;

        const message = new Message({
            senderId,
            channelId,
            content
        });

        await message.save();

        res.status(201).json({
            success: true,
            message
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false,
            message: "Message sending failed"
        });

    }

});

// Get Messages of a Channel
router.get("/channel/:channelId", async (req, res) => {

    try {

        const { channelId } = req.params;

        const messages =
        await Message.find({
        channelId
        }).populate(
           "senderId",
           "name email"
        );

        res.json({
            success: true,
            messages
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false
        });

    }

});

router.delete("/:id", async (req, res) => {

    try {

        await Message.findByIdAndDelete(
            req.params.id
        );

        res.json({
            success: true,
            message: "Message deleted"
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false
        });

    }

});

router.put("/:id", async (req, res) => {

    try {

        const { content } = req.body;

        const message =
            await Message.findByIdAndUpdate(
                req.params.id,
                {
                    content,
                    edited: true
                },
                { new: true }
            );

        res.json({
            success: true,
            message
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false
        });

    }

});

export default router;