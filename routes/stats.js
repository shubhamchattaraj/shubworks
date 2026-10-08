const express = require("express");
const router = express.Router();

const pool = require("../db/database");


router.get("/", async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT

                COUNT(*) AS total_works,

                COUNT(*) FILTER (
                    WHERE type = 'poem'
                ) AS poems,

                COUNT(*) FILTER (
                    WHERE type = 'fable'
                ) AS fables,

                COUNT(*) FILTER (
                    WHERE type = 'novel'
                ) AS novels,

                COUNT(*) FILTER (
                    WHERE type = 'story'
                ) AS stories,

                COALESCE(
                    SUM(word_count),
                    0
                ) AS total_words,

                COALESCE(
                    SUM(reading_time),
                    0
                ) AS total_reading_minutes

            FROM works

            WHERE published = TRUE
        `);


        const series = await pool.query(`
            SELECT COUNT(*) AS total_series
            FROM series
        `);


        const stats = result.rows[0];


        res.json({
            success: true,

            stats: {
                totalWorks: Number(stats.total_works),

                poems: Number(stats.poems),

                fables: Number(stats.fables),

                novels: Number(stats.novels),

                stories: Number(stats.stories),

                totalWords: Number(stats.total_words),

                readingMinutes:
                    Number(stats.total_reading_minutes),

                totalSeries:
                    Number(series.rows[0].total_series)
            }
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: "Failed to calculate statistics"
        });
    }
});


module.exports = router;