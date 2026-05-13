const mongoose = require("mongoose");
const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/navix";
const jwtSecret = process.env.JWT_SECRET || "navix-dev-secret";
const User = require("../models/User");
const Feedback = require("../models/Feedback");
const RouteHistory = require("../models/RouteHistory");
mongoose
    .connect(mongoUri)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error("MongoDB connection error:", err.message));

    const addUser = async() => {
        User.deleteMany({})
        .then(() => console.log("Existing users deleted"))
        .catch((err) => console.error("Error deleting users:", err.message));
        console.log("DataBase is empty now..");
    }
    addUser();
    const feedback = async() => {
        Feedback.deleteMany({})
        .then(() => console.log("Existing feedbacks deleted"))
        .catch((err) => console.error("Error deleting feedbacks:", err.message));
        console.log("DataBase is empty now..");
    }

    feedback();

    const past = async() => {
        RouteHistory.deleteMany({})
        .then(() => console.log("Existing history deleted"))
        .catch((err) => console.error("Error deleting history:", err.message));
        console.log("DataBase is empty now..");
    }
    past();
