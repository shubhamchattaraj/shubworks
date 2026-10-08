const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
require("dotenv").config();

const pool = require("./db/database");
const worksRoutes = require("./routes/works");
const statsRoutes = require("./routes/stats");

const app = express();

// -------------------------
// Middleware
// -------------------------

const allowedOrigins = [
    "http://localhost:5000",
    "http://127.0.0.1:5000"
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no Origin header
        // (for example, direct server-to-server requests)
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("CORS policy: Origin not allowed"));
    },
    methods: ["GET"],
    allowedHeaders: ["Content-Type", "Accept"]
}));

app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(express.json());

// Serve frontend files
app.use(express.static(path.join(__dirname, "frontend")));

// -------------------------
// Homepage
// -------------------------

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "frontend", "index.html")
    );
});

// -------------------------
// Database Test
// -------------------------

if (process.env.NODE_ENV !== "production") {
    app.get("/api/test-db", async (req, res) => {
        try {
            const result = await pool.query("SELECT NOW()");

            res.json({
                success: true,
                time: result.rows[0].now
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                success: false,
                error: "Database connection failed"
            });
        }
    });
}

// -------------------------
// API Routes
// -------------------------

app.use("/api/works", worksRoutes);
app.use("/api/stats", statsRoutes);

// -------------------------
// Start Server
// -------------------------

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});