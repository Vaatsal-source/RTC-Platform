import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

const router = Router();

router.post("/register", async (req, res) => {

    try {

        const { name, email, password } = req.body;

        const hashedPassword =
            await bcrypt.hash(password, 10);

        const user = new User({
            name,
            email,
            password: hashedPassword
        });

        await user.save();

        res.status(201).json({
            success: true,
            user
        });

    } catch (err) {
    res.status(500).json({
        success: false,
        message: "Registration failed"
    });
}

});

router.post("/login", async (req, res) => {

    try {

        const { email, password } = req.body;

        const user = await User.findOne({
            email: email
        });

        if (!user) {

            return res.status(404).json({
                success: false,
                message: "User not found"
            });

        }

        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isMatch) {

            return res.status(401).json({
                success: false,
                message: "Invalid Password"
            });

        }

        res.json({
            success: true,
            message: "Login Successful"
        });

    }
    catch (err) {

        console.log(err);

        res.status(500).json({
            success: false,
            message: "Login Failed"
        });

    }

});

export default router;