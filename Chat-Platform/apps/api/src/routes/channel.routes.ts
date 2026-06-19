import { Router } from "express";
import Channel from "../models/Channel.js";

const router = Router();

router.post("/create", async (req, res) => {

    try {

        const {
            name,
            workspaceId,
            isPrivate
        } = req.body;

        const channel =
            new Channel({
                name,
                workspaceId,
                isPrivate
            });

        await channel.save();

        res.status(201).json({
            success: true,
            channel
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false,
            message: "Channel creation failed"
        });

    }

});

router.get(
    "/workspace/:workspaceId",
    async (req, res) => {

        try {

            const { workspaceId } =
                req.params;

            const channels =
                await Channel.find({
                    workspaceId
                });

            res.json({
                success: true,
                channels
            });

        } catch (err) {

            console.log(err);

            res.status(500).json({
                success: false
            });

        }

    }
);

router.delete("/:id", async (req, res) => {

    try {

        await Channel.findByIdAndDelete(
            req.params.id
        );

        res.json({
            success: true,
            message: "Channel deleted"
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false
        });

    }

});

export default router;