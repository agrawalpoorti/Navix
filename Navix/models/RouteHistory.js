const mongoose = require("mongoose");

const routeHistorySchema = new mongoose.Schema(
    {
        ownerType: {
            type: String,
            enum: ["guest", "user"],
            default: "guest",
            required: true
        },
        ownerId: {
            type: String,
            required: true,
            index: true
        },
        source: { type: String, required: true },
        destination: { type: String, required: true },
        preference: {
            type: String,
            enum: ["distance", "time", "cost"],
            required: true
        },
        totalDistance: { type: Number, default: 0 },
        totalTime: { type: Number, default: 0 },
        totalCost: { type: Number, default: 0 },
        stops: { type: Number, default: 0 },
        path: { type: [String], default: [] },
        liveData: { type: Boolean, default: false }
    },
    { timestamps: true }
);

routeHistorySchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });

module.exports = mongoose.model("RouteHistory", routeHistorySchema);
