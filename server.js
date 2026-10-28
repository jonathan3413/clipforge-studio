
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const OUTPUT_DIR = path.join(ROOT, "outputs");

for (const dir of [PUBLIC_DIR, UPLOAD_DIR, OUTPUT_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
}

app.use(express.static(PUBLIC_DIR));

const TEMPLATES = {
    classic: {
        font: "Arial",
        size: 24,
        color: "&H00FFFFFF",
        outline: "&H00000000",
        outlineWidth: 2,
        shadow: 1,
        bold: 0,
        box: 0
    },
    viral: {
        font: "Impact",
        size: 29,
        color: "&H0000FFFF",
        outline: "&H00000000",
        outlineWidth: 3,
        shadow: 1,
        bold: 1,
        box: 0
    },
    neon: {
        font: "Arial",
        size: 25,
        color: "&H0000FF80",
        outline: "&H00101010",
        outlineWidth: 2,
        shadow: 2,
        bold: 1,
        box: 0
    },
    minimal: {
        font: "Arial",
        size: 23,
        color: "&H00FFFFFF",
        outline: "&H00000000",
        outlineWidth: 0,
        shadow: 0,
        bold: 0,
        box: 1
    },
    cinematic: {
        font: "Georgia",
        size: 24,
        color: "&H00E8F0FF",
        outline: "&H00101010",
        outlineWidth: 1,
        shadow: 1,
        bold: 0,
        box: 0
    }
};

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `${crypto.randomUUID()}${ext}`);
        }
    }),
    limits: {
        fileSize: 1024 * 1024 * 1024,
        fieldSize: Infinity,
        fields: 10,
        files: 2
    },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();

        if (file.fieldname === "video" && ext === ".mp4") {
            return cb(null, true);
        }

        if (file.fieldname === "transcriptFile" && ext === ".txt") {
            return cb(null, true);
        }

        cb(new Error("Gunakan video MP4 dan file subtitle TXT."));
    }
});

function runProcess(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"]
        });

        let stderr = "";
        child.stderr.on("data", data => {
            stderr += data.toString();

            // Hindari menyimpan log FFmpeg tanpa batas.
            if (stderr.length > 30000) {
                stderr = stderr.slice(-30000);
            }
        });

        child.on("error", error => {
            if (error.code === "ENOENT") {
                reject(
                    new Error(
                        `${command} tidak ditemukan. Pastikan FFmpeg dan FFprobe sudah terpasang dan masuk PATH.`
                    )
                );
                return;
            }

            reject(error);
        });

        child.on("close", code => {
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        `Proses ${command} gagal.\n${stderr.slice(-5000)}`
                    )
                );
            }
        });
    });
}

function parseTime(value) {
    const input = String(value ?? "").trim();

    if (!input) {
        throw new Error("Waktu mulai dan selesai wajib diisi.");
    }

    // Format angka dalam detik, misalnya 90 atau 90.5.
    if (/^\d+(?:\.\d+)?$/.test(input)) {
        const seconds = Number(input);

        if (!Number.isFinite(seconds) || seconds < 0) {
            throw new Error(`Waktu tidak valid: ${input}`);
        }

        return seconds;
    }

    // Format MM:SS, HH:MM:SS, dan pecahan detik.
    const match = input.match(
        /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/
    );

    if (!match) {
        throw new Error(
            `Format waktu "${input}" tidak valid. Gunakan HH:MM:SS atau detik.`
        );
    }

    const hours = Number(match[1] || 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const fraction = Number(`0.${match[4] || "0"}`);

    if (minutes > 59 || seconds > 59) {
        throw new Error(`Format waktu "${input}" tidak valid.`);
    }

    return hours * 3600 + minutes * 60 + seconds + fraction;
}

function formatSrtTime(seconds) {
    const ms = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;

    return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(secs).padStart(2, "0")
    ].join(":") + "," + String(millis).padStart(3, "0");
}

function parseTranscript(content) {
    const lines = String(content ?? "")
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/);

    const entries = [];

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index].trim();

        if (!line) continue;

        // Contoh yang didukung:
        // 00:00:02 Halo semuanya
        // [00:00:02] Halo semuanya
        // 00:00:02 | Halo semuanya
        // 00:00:02.500 - Halo semuanya
        const match = line.match(
            /^\[?((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s*(?:\||->|[-:])?\s+(.+)$/
        );

        if (!match) {
            throw new Error(
                `Baris ${index + 1} tidak valid: "${line}". Gunakan format 00:00:02 Teks subtitle.`
            );
        }

        const time = parseTime(match[1]);
        const text = match[2].trim();

        if (!text) {
            throw new Error(`Teks subtitle pada baris ${index + 1} kosong.`);
        }

        entries.push({ time, text });
    }

    if (entries.length === 0) {
        throw new Error("Transkrip belum berisi subtitle bertimestamp.");
    }

    entries.sort((a, b) => a.time - b.time);

    for (let i = 1; i < entries.length; i++) {
        if (entries[i].time === entries[i - 1].time) {
            throw new Error(
                `Timestamp duplikat pada ${formatSrtTime(entries[i].time)}.`
            );
        }
    }

    return entries;
}

function buildSrt(entries, clipStart, clipEnd) {
    const selected = entries.filter(
        entry => entry.time >= clipStart && entry.time < clipEnd
    );

    if (selected.length === 0) {
        throw new Error(
            "Tidak ada subtitle di rentang klip ini. Periksa timestamp transkrip dan waktu potong."
        );
    }

    const result = [];

    selected.forEach((entry, index) => {
        const nextEntry = selected[index + 1];

        // Subtitle terakhir ditampilkan selama 3 detik.
        const naturalEnd = nextEntry
            ? nextEntry.time
            : entry.time + 3;

        const absoluteEnd = Math.min(naturalEnd, clipEnd);

        if (absoluteEnd <= entry.time) return;

        const relativeStart = entry.time - clipStart;
        const relativeEnd = absoluteEnd - clipStart;

        // Escape karakter HTML tidak diperlukan untuk SRT.
        // Baris teks tetap dipertahankan apa adanya.
        result.push(
            `${result.length + 1}\n` +
            `${formatSrtTime(relativeStart)} --> ${formatSrtTime(relativeEnd)}\n` +
            `${entry.text}\n`
        );
    });

    if (result.length === 0) {
        throw new Error("Tidak ada subtitle yang bisa dirender.");
    }

    return result.join("\n");
}

function escapeFilterPath(filePath) {
    return filePath
        .replace(/\\/g, "/")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'");
}

function buildSubtitleFilter(srtPath, templateName, position, margin) {
    const template = TEMPLATES[templateName] || TEMPLATES.classic;

    // ASS Alignment:
    // 8 = atas, 5 = tengah, 2 = bawah.
    const alignmentMap = {
        top: 8,
        middle: 5,
        bottom: 2
    };

    const alignment = alignmentMap[position] || 2;
    const safeMargin = Math.max(0, Math.min(500, Number(margin) || 40));

    const style = [
        `FontName=${template.font}`,
        `FontSize=${template.size}`,
        `PrimaryColour=${template.color}`,
        `OutlineColour=${template.outline}`,
        `Outline=${template.outlineWidth}`,
        `Shadow=${template.shadow}`,
        `Bold=${template.bold}`,
        `BorderStyle=${template.box ? 3 : 1}`,
        `BackColour=&H99000000`,
        `Alignment=${alignment}`,
        `MarginV=${safeMargin}`
    ].join(",");

    const escapedSrt = escapeFilterPath(srtPath);

    return `subtitles='${escapedSrt}':force_style='${style}'`;
}

async function getVideoDuration(filePath) {
    const output = await new Promise((resolve, reject) => {
        const child = spawn("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            filePath
        ], {
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", data => stdout += data.toString());
        child.stderr.on("data", data => stderr += data.toString());

        child.on("error", error => {
            if (error.code === "ENOENT") {
                reject(new Error("FFprobe tidak ditemukan. Periksa instalasi FFmpeg."));
            } else {
                reject(error);
            }
        });

        child.on("close", code => {
            if (code !== 0) {
                reject(new Error(`FFprobe gagal: ${stderr.slice(-2000)}`));
            } else {
                resolve(stdout.trim());
            }
        });
    });

    const duration = Number(output);

    if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error("Durasi video tidak dapat dibaca.");
    }

    return duration;
}

function safeOutputPath(filename) {
    if (!/^[a-f0-9-]+\.mp4$/i.test(filename)) {
        return null;
    }

    return path.join(OUTPUT_DIR, filename);
}

app.post(
    "/api/clip",
    upload.fields([
        { name: "video", maxCount: 1 },
        { name: "transcriptFile", maxCount: 1 }
    ]),
    async (req, res) => {
        const files = req.files || {};
        const video = files.video?.[0];
        const transcriptFile = files.transcriptFile?.[0];

        let srtPath = null;

        try {
            if (!video) {
                throw new Error("Pilih video MP4 terlebih dahulu.");
            }

            const pastedText = String(req.body.transcriptText || "");
            let transcriptText = pastedText;

            // Teks yang ditempel langsung diprioritaskan.
            if (!transcriptText.trim() && transcriptFile) {
                transcriptText = fs.readFileSync(
                    transcriptFile.path,
                    "utf8"
                );
            }

            if (!transcriptText.trim()) {
                throw new Error(
                    "Masukkan transkrip langsung atau pilih file TXT."
                );
            }

            const clipStart = parseTime(req.body.start);
            const clipEnd = parseTime(req.body.end);

            if (clipEnd <= clipStart) {
                throw new Error("Waktu selesai harus lebih besar dari waktu mulai.");
            }

            const duration = await getVideoDuration(video.path);

            if (clipStart >= duration || clipEnd > duration + 0.05) {
                throw new Error(
                    `Rentang klip melewati durasi video (${duration.toFixed(2)} detik).`
                );
            }

            const templateName = String(req.body.template || "classic");

            if (!TEMPLATES[templateName]) {
                throw new Error("Template subtitle tidak dikenal.");
            }

            const position = String(req.body.position || "bottom");

            if (!["top", "middle", "bottom"].includes(position)) {
                throw new Error("Posisi subtitle tidak valid.");
            }

            const margin = Number(req.body.margin ?? 40);

            if (!Number.isFinite(margin) || margin < 0 || margin > 500) {
                throw new Error("Jarak subtitle harus antara 0 dan 500.");
            }

            const entries = parseTranscript(transcriptText);
            const srtContent = buildSrt(entries, clipStart, clipEnd);

            srtPath = path.join(
                os.tmpdir(),
                `clipforge-${crypto.randomUUID()}.srt`
            );

            fs.writeFileSync(srtPath, "\uFEFF" + srtContent, "utf8");

            const outputName = `${crypto.randomUUID()}.mp4`;
            const outputPath = path.join(OUTPUT_DIR, outputName);

            const subtitleFilter = buildSubtitleFilter(
                srtPath,
                templateName,
                position,
                margin
            );

            const args = [
                "-hide_banner",
                "-y",
                "-ss", String(clipStart),
                "-i", video.path,
                "-t", String(clipEnd - clipStart),
                "-vf", subtitleFilter,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                outputPath
            ];

            await runProcess("ffmpeg", args);

            if (!fs.existsSync(outputPath)) {
                throw new Error("FFmpeg selesai tetapi file output tidak ditemukan.");
            }

            res.json({
                success: true,
                filename: outputName,
                previewUrl: `/api/preview/${outputName}`,
                downloadUrl: `/api/download/${outputName}`,
                duration: Number((clipEnd - clipStart).toFixed(2)),
                template: templateName,
                position,
                margin
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message || "Terjadi kesalahan saat memproses video."
            });
        } finally {
            for (const file of [video, transcriptFile]) {
                if (file?.path) {
                    fs.promises.unlink(file.path).catch(() => {});
                }
            }

            if (srtPath) {
                fs.promises.unlink(srtPath).catch(() => {});
            }
        }
    }
);

function sendOutput(req, res, disposition) {
    const filename = path.basename(req.params.filename);
    const filePath = safeOutputPath(filename);

    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({
            error: "Video hasil render tidak ditemukan."
        });
    }

    res.setHeader("Content-Type", "video/mp4");

    if (disposition === "attachment") {
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="clipforge-${filename}"`
        );
    }

    res.sendFile(filePath);
}

app.get("/api/preview/:filename", (req, res) => {
    sendOutput(req, res, "inline");
});

app.get("/api/download/:filename", (req, res) => {
    sendOutput(req, res, "attachment");
});

app.get("/api/health", (_req, res) => {
    res.json({ success: true, app: "ClipForge Studio" });
});

app.use((error, _req, res, _next) => {
    console.error(error);

    res.status(400).json({
        success: false,
        error: error.message || "Permintaan tidak dapat diproses."
    });
});

app.listen(PORT, () => {
    console.log(`ClipForge Studio berjalan di http://localhost:${PORT}`);
});
