const express = require("express");
const app = express();
const ejsMate = require("ejs-mate");
const path = require("path");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config();
require("dotenv").config({ path: path.join(__dirname, ".env") });

const isProduction = process.env.NODE_ENV === "production";

app.set("view engine", "ejs");
app.engine("ejs", ejsMate);
app.set("views", path.join(__dirname, "views"));
if (isProduction) {
    app.set("trust proxy", 1);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());

const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/navix_travel_db";
const jwtSecret = process.env.JWT_SECRET || "navix-dev-secret";
mongoose
    .connect(mongoUri)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error("MongoDB connection error:", err.message));

app.use((req, res, next) => {
    res.locals.req = req;
    let guestId = req.cookies.guestId;
    if (!guestId) {
        guestId = crypto.randomUUID();
        res.cookie("guestId", guestId, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 365
        });
    }

    const token = req.cookies.authToken;
    if (token) {
        try {
            const decoded = jwt.verify(token, jwtSecret);
            req.user = {
                id: String(decoded.userId),
                name: decoded.name,
                email: decoded.email
            };
            req.identity = {
                ownerType: "user",
                ownerId: String(decoded.userId)
            };
            res.locals.currentUser = req.user;
            return next();
        } catch (_) {
            res.clearCookie("authToken");
        }
    }

    req.user = null;
    req.identity = { ownerType: "guest", ownerId: guestId };
    res.locals.currentUser = null;
    next();
});

// API Routes
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "ok",
        database: mongoose.connection.readyState
    });
});

// Page Routes
app.get("/",        (req, res) => res.render("parts/home.ejs"));
app.get("/login",   (req, res) => res.render("parts/login.ejs"));
app.get("/signup",  (req, res) => res.render("parts/signup.ejs"));
app.get("/about",   (req, res) => res.render("parts/about.ejs"));
app.get("/plan",    (req, res) => res.render("parts/plan.ejs"));
app.get("/result",  (req, res) => res.render("parts/result.ejs"));
app.get("/noroute", (req, res) => res.render("parts/noroute.ejs"));
app.get("/error",   (req, res) => res.render("parts/error.ejs"));
app.get("/contact", (req, res) => res.render("parts/contact.ejs"));
app.get("/history", (req, res) => res.render("parts/history.ejs"));

// Error page
app.use((req, res) => res.status(404).render("parts/error.ejs"));

const port = process.env.PORT || 8080;
const server = app.listen(port, () => {
    console.log("Server is running at port ", port);
});

function shutdown(signal) {
    console.log(`${signal} received. Closing server...`);
    server.close(() => {
        mongoose.connection.close(false).finally(() => process.exit(0));
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = app;
