const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RouteHistory = require("../models/RouteHistory");

const router = express.Router();
const jwtSecret = process.env.JWT_SECRET || "navix-dev-secret";
const isProduction = process.env.NODE_ENV === "production";

function setAuthCookie(res, user) {
    const token = jwt.sign(
        {
            userId: String(user._id),
            name: user.name,
            email: user.email
        },
        jwtSecret,
        { expiresIn: "7d" }
    );

    res.cookie("authToken", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: 1000 * 60 * 60 * 24 * 7
    });
}

async function moveGuestHistoryToUser(guestId, userId) {
    if (!guestId || !userId) return;

    await RouteHistory.updateMany(
        { ownerType: "guest", ownerId: String(guestId) },
        { $set: { ownerType: "user", ownerId: String(userId) } }
    );
}

router.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.redirect("/signup?error=Please%20fill%20all%20fields");
        }
        if (String(password).length < 6) {
            return res.redirect("/signup?error=Password%20must%20be%20at%20least%206%20characters");
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res.redirect("/signup?error=Email%20already%20registered");
        }

        const passwordHash = await bcrypt.hash(String(password), 10);
        const user = await User.create({
            name: String(name).trim(),
            email: normalizedEmail,
            passwordHash
        });

        setAuthCookie(res, user);
        await moveGuestHistoryToUser(req.cookies.guestId, user._id);
        return res.redirect("/history");
    } catch (_) {
        return res.redirect("/signup?error=Signup%20failed");
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.redirect("/login?error=Please%20enter%20email%20and%20password");
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.redirect("/login?error=Invalid%20email%20or%20password");
        }

        const validPassword = await bcrypt.compare(String(password), user.passwordHash);
        if (!validPassword) {
            return res.redirect("/login?error=Invalid%20email%20or%20password");
        }

        setAuthCookie(res, user);
        await moveGuestHistoryToUser(req.cookies.guestId, user._id);
        return res.redirect("/history");
    } catch (_) {
        return res.redirect("/login?error=Login%20failed");
    }
});

router.post("/logout", (req, res) => {
    res.clearCookie("authToken");
    return res.redirect("/");
});

module.exports = router;
