
const form = document.getElementById("clipForm");

const videoInput = document.getElementById("videoFile");
const transcriptFileInput = document.getElementById("transcriptFile");
const transcriptText = document.getElementById("transcriptText");

const videoName = document.getElementById("videoName");
const transcriptName = document.getElementById("transcriptName");

const sourcePreviewPanel = document.getElementById("sourcePreviewPanel");
const sourceVideo = document.getElementById("sourceVideo");
const sourceDuration = document.getElementById("sourceDuration");

const startTime = document.getElementById("startTime");
const endTime = document.getElementById("endTime");
const seekSlider = document.getElementById("seekSlider");
const currentTimeLabel = document.getElementById("currentTimeLabel");
const rangeEndLabel = document.getElementById("rangeEndLabel");

const characterCount = document.getElementById("characterCount");
const positionInput = document.getElementById("position");
const marginInput = document.getElementById("margin");
const marginValue = document.getElementById("marginValue");

const subtitleStage = document.getElementById("subtitleStage");
const subtitleDemo = document.getElementById("subtitleDemo");

const processButton = document.getElementById("processButton");
const buttonText = document.getElementById("buttonText");

const errorMessage = document.getElementById("errorMessage");
const progressPanel = document.getElementById("progressPanel");
const progressTitle = document.getElementById("progressTitle");
const progressMessage = document.getElementById("progressMessage");

const resultPanel = document.getElementById("resultPanel");
const resultVideo = document.getElementById("resultVideo");
const resultDetails = document.getElementById("resultDetails");
const downloadLink = document.getElementById("downloadLink");
const rerenderButton = document.getElementById("rerenderButton");

let sourceObjectUrl = null;
let currentRenderUrl = null;
let renderInProgress = false;

function parseTime(value) {
    const input = String(value ?? "").trim();

    if (!input) return NaN;

    if (/^\d+(?:\.\d+)?$/.test(input)) {
        return Number(input);
    }

    const match = input.match(
        /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/
    );

    if (!match) return NaN;

    const hours = Number(match[1] || 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const fraction = Number(`0.${match[4] || "0"}`);

    if (minutes > 59 || seconds > 59) return NaN;

    return hours * 3600 + minutes * 60 + seconds + fraction;
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "00:00:00";
    }

    const totalMs = Math.floor(seconds * 1000);
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);

    return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(secs).padStart(2, "0")
    ].join(":");
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
}

function clearError() {
    errorMessage.textContent = "";
    errorMessage.hidden = true;
}

function setRendering(isRendering) {
    renderInProgress = isRendering;
    processButton.disabled = isRendering;
    rerenderButton.disabled = isRendering;
    buttonText.textContent = isRendering
        ? "Sedang merender..."
        : "Render video ↗";

    progressPanel.hidden = !isRendering;

    if (isRendering) {
        progressTitle.textContent = "Sedang merender video...";
        progressMessage.textContent =
            "FFmpeg sedang memotong video dan menerapkan subtitle.";
    }
}

function getSelectedTemplate() {
    return document.querySelector('input[name="template"]:checked')?.value
        || "classic";
}

function updateSubtitleDemo() {
    const template = getSelectedTemplate();
    const position = positionInput.value;
    const margin = Number(marginInput.value) || 0;

    subtitleDemo.className = `subtitle-demo ${template}`;
    subtitleStage.className = `subtitle-stage pos-${position}`;

    subtitleStage.style.setProperty(
        "--preview-margin",
        `${Math.min(margin, 200)}px`
    );

    marginValue.textContent = `${margin} px`;
}

function updateCharacterCount() {
    const count = transcriptText.value.length;
    characterCount.textContent =
        `${count.toLocaleString("id-ID")} karakter`;
}

function getActiveTranscript() {
    if (transcriptText.value.trim()) {
        return transcriptText.value;
    }

    return "";
}

videoInput.addEventListener("change", () => {
    const file = videoInput.files?.[0];

    if (!file) {
        videoName.textContent = "Klik untuk memilih file dari komputer";
        sourcePreviewPanel.hidden = true;

        sourceVideo.pause();
        sourceVideo.removeAttribute("src");
        sourceVideo.load();

        if (sourceObjectUrl) {
            URL.revokeObjectURL(sourceObjectUrl);
            sourceObjectUrl = null;
        }

        return;
    }

    if (!file.name.toLowerCase().endsWith(".mp4")) {
        videoInput.value = "";
        showError("Pilih file video dengan ekstensi MP4.");
        return;
    }

    clearError();

    videoName.textContent = file.name;

    if (sourceObjectUrl) {
        URL.revokeObjectURL(sourceObjectUrl);
    }

    sourceObjectUrl = URL.createObjectURL(file);
    sourceVideo.src = sourceObjectUrl;
    sourcePreviewPanel.hidden = false;

    sourceVideo.load();
});

sourceVideo.addEventListener("loadedmetadata", () => {
    const duration = sourceVideo.duration;

    if (!Number.isFinite(duration)) return;

    sourceDuration.textContent = formatTime(duration);
    rangeEndLabel.textContent = formatTime(duration);

    seekSlider.min = "0";
    seekSlider.max = String(duration);
    seekSlider.step = "0.1";
    seekSlider.value = "0";

    startTime.value = "00:00:00";
    endTime.value = formatTime(duration);
    currentTimeLabel.textContent = "00:00:00";
});

sourceVideo.addEventListener("timeupdate", () => {
    seekSlider.value = String(sourceVideo.currentTime);
    currentTimeLabel.textContent = formatTime(sourceVideo.currentTime);
});

seekSlider.addEventListener("input", () => {
    const time = Number(seekSlider.value);

    sourceVideo.currentTime = time;
    currentTimeLabel.textContent = formatTime(time);
});

seekSlider.addEventListener("dblclick", () => {
    startTime.value = formatTime(sourceVideo.currentTime);
});

seekSlider.addEventListener("change", () => {
    // Klik kanan tidak diperlukan. Geser slider lalu gunakan tombol waktu
    // untuk menentukan titik mulai/akhir secara manual.
});

startTime.addEventListener("change", () => {
    const time = parseTime(startTime.value);

    if (Number.isFinite(time) && sourceVideo.duration) {
        sourceVideo.currentTime = Math.min(time, sourceVideo.duration);
    }
});

endTime.addEventListener("change", () => {
    const time = parseTime(endTime.value);

    if (Number.isFinite(time) && sourceVideo.duration) {
        sourceVideo.currentTime = Math.min(time, sourceVideo.duration);
    }
});

transcriptFileInput.addEventListener("change", () => {
    const file = transcriptFileInput.files?.[0];

    transcriptName.textContent = file
        ? file.name
        : "Belum ada file";

    if (file && !file.name.toLowerCase().endsWith(".txt")) {
        transcriptFileInput.value = "";
        transcriptName.textContent = "Belum ada file";
        showError("Pilih file transkrip dengan ekstensi TXT.");
    } else {
        clearError();
    }
});

transcriptText.addEventListener("input", updateCharacterCount);

document.querySelectorAll('input[name="template"]').forEach(input => {
    input.addEventListener("change", updateSubtitleDemo);
});

positionInput.addEventListener("change", updateSubtitleDemo);
marginInput.addEventListener("input", updateSubtitleDemo);

function validateForm() {
    const video = videoInput.files?.[0];
    const transcript = getActiveTranscript();
    const transcriptFile = transcriptFileInput.files?.[0];

    if (!video) {
        throw new Error("Pilih video MP4 terlebih dahulu.");
    }

    if (!transcript.trim() && !transcriptFile) {
        throw new Error(
            "Tempelkan transkrip ke kotak teks atau pilih file TXT."
        );
    }

    const start = parseTime(startTime.value);
    const end = parseTime(endTime.value);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error(
            "Format waktu tidak valid. Gunakan HH:MM:SS, MM:SS, atau detik."
        );
    }

    if (start < 0 || end <= start) {
        throw new Error("Waktu selesai harus lebih besar dari waktu mulai.");
    }

    if (Number.isFinite(sourceVideo.duration) && end > sourceVideo.duration + 0.05) {
        throw new Error("Waktu akhir melewati durasi video.");
    }
}

function addDetailChip(label, value) {
    const chip = document.createElement("span");
    chip.className = "detail-chip";
    chip.textContent = `${label}: ${value}`;
    resultDetails.appendChild(chip);
}

function showResult(data) {
    if (currentRenderUrl) {
        resultVideo.pause();
    }

    currentRenderUrl = data.previewUrl;

    // URL unik setiap render sehingga browser tidak memakai video lama.
    resultVideo.src = `${data.previewUrl}?v=${Date.now()}`;
    resultVideo.load();

    downloadLink.href = data.downloadUrl;

    resultDetails.replaceChildren();

    addDetailChip("Durasi", `${data.duration} detik`);
    addDetailChip("Template", data.template);
    addDetailChip("Posisi", data.position);
    addDetailChip("Jarak", `${data.margin} px`);

    resultPanel.hidden = false;

    resultPanel.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

async function renderVideo() {
    if (renderInProgress) return;

    clearError();

    try {
        validateForm();
    } catch (error) {
        showError(error.message);
        return;
    }

    const formData = new FormData();

    formData.append("video", videoInput.files[0]);

    if (transcriptFileInput.files?.[0]) {
        formData.append("transcriptFile", transcriptFileInput.files[0]);
    }

    formData.append("transcriptText", transcriptText.value);
    formData.append("start", startTime.value.trim());
    formData.append("end", endTime.value.trim());
    formData.append("template", getSelectedTemplate());
    formData.append("position", positionInput.value);
    formData.append("margin", marginInput.value);

    setRendering(true);

    try {
        const response = await fetch("/api/clip", {
            method: "POST",
            body: formData
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Render gagal. Periksa konfigurasi FFmpeg.");
        }

        showResult(data);
    } catch (error) {
        showError(error.message || "Tidak dapat menghubungi server.");
    } finally {
        setRendering(false);
    }
}

form.addEventListener("submit", async event => {
    event.preventDefault();
    await renderVideo();
});

rerenderButton.addEventListener("click", async () => {
    await renderVideo();
});

updateCharacterCount();
updateSubtitleDemo();
