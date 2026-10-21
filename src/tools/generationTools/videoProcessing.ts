import {mkdir, readdir, writeFile} from "node:fs/promises";
import {join, parse} from "node:path";
import {z} from "zod";
import {promisify} from "node:util";
import {execFile} from "node:child_process";
import {isVideo} from "./mediaAnalysis.ts";
import {type Probe, probeSchema} from "./ffprobe-schema.ts";

/*
    Processes a folder of videos into per-video workspaces: a .workspace directory with
    one folder per video, each holding a manifest (probe facts, decode flags, boundary
    events, shots, extracted-frame index) plus the frames themselves. Pipeline per video:

      probe → decode flags → measure (2 decode passes) → boundaries (cuts + soft)
      → shots → frame timestamps → extract through correctness prefix → manifest

    Design decisions (reasons are given where each one is applied):
      - decode flags describe the principal video stream and stay false without a
        positive claim from the probe
      - rotation is left to ffmpeg's autorotate, not a filter fragment
      - tonemapping runs through the keg-only ffmpeg@7 binary, which has zscale
      - boundaries come from two measurement passes with per-file MAD thresholds
      - measurement runs at 360p without the correctness prefix
      - boundaries are evidence-first; "soft" is an honest catch-all label
      - frames-per-shot is a placeholder until it is measured
 */

// ════ TYPES AND SCHEMAS ════
// Each schema sits with the type inferred from it, reading order = data order:
// flags → measurement rows → boundaries → shots → frames → manifest → workspace

// One flag per correctness repair this file's frames need before pixels can be
//  trusted. Each is determined from probe facts in decodeFlagsFromProbe (the
//  numbered steps there show each determination) and consumed by ffmpegPrefixFromFlags
export const decodeFlagsSchema = z.object({
    // container indexes of every audio stream ffprobe could name a codec for —
    //  the future audio timeline addresses these as [0:index] filter labels
    audioStreamIndexes : z.array(z.int()),
    // NOTE : For now, we are going to ignore VFR / CFR differentiation because the signaling
    //  is not clear. The only thing the differentiation achieves is CFR optimizations which aren't important
    // isVfr : z.boolean(),
    // frames are two interleaved half-pictures (field_order says interlaced) → yadif
    needsDeinterlace : z.boolean(),
    // pixel values ride an HDR brightness curve (PQ/HLG transfer) → tonemap to SDR
    needsTonemap : z.boolean(),
    // display matrix says the stored picture is turned (rotation not a multiple of 360)
    needsRotation : z.boolean(),
    // pixels aren't square (SAR ≠ 1:1) → rescale width or frames come out stretched
    needsSarCorrection : z.boolean(),
});
type DecodeFlags = z.infer<typeof decodeFlagsSchema>;

// lavfi measurement rows arrive as strings (ffprobe JSON stringifies numbers);
// parsing to numbers happens after the nan-guard in measureFrames
const lavfiFramesSchema = z.object({
    frames : z.array(z.object({
        pts_time : z.string().optional(),
        tags : z.record(z.string(), z.string()).optional(),
    })),
})

// One measurement taken from one frame: which moment, and what the measuring
// filter reported there. Deliberately signal-agnostic — YDIF and scene scores
// both ride this shape, which is what lets one threshold/merge mechanism serve
// every signal the pipeline will ever harvest
type FrameMeasurement = {timestampSeconds : number, value : number};

// Evidence-first: every boundary keeps the signal value that produced it, and
// "soft" is an honest label (dissolve OR fade OR weak cut OR fast camera move —
// the known FP class)
const boundaryEventSchema = z.object({
    kind : z.enum(["cut", "soft"]),
    timestampSeconds : z.number(),
    signalValue : z.number(),
})
type BoundaryEvent = z.infer<typeof boundaryEventSchema>;

const shotSchema = z.object({
    startSeconds : z.number(),
    endSeconds : z.number(),
})
type Shot = z.infer<typeof shotSchema>;

const selectFrameSchema = z.object({
    timestampSeconds : z.number(),
    shotIndex : z.int(),
    framePath : z.string(),
    description : z.string(),
})
type SelectFrame = z.infer<typeof selectFrameSchema>;

const videoManifestSchema = z.object({
    probeParse : probeSchema,
    decodeFlags : decodeFlagsSchema,
    boundaries : z.array(boundaryEventSchema),
    shots : z.array(shotSchema),
    selectFrames : z.array(selectFrameSchema),
    // single-shot vs multi-shot is the only load-bearing classification; on
    // footage KNOWN to be unedited a "multi-shot" verdict means motion
    // structure, not edits — that reading happens at interpretation time
    editorialState : z.enum(["single-shot", "multi-shot"]),
    description : z.string().optional(),
})
type VideoManifest = z.infer<typeof videoManifestSchema>;

const videoWorkspaceEntry = z.object({
    videoFilePath : z.string(),      // the video itself (a file)
    workspaceFolderPath : z.string() // its .workspace/<name>/ directory
})
type VideoWorkspaceEntry = z.infer<typeof videoWorkspaceEntry>;

// ════ FUNCTIONS ════

export async function processVideoFolder(folderPath : string) {
    // 1. Initialize video workspace and store the list of videos and their workspaces
    const organizedVideos : VideoWorkspaceEntry[] = await initializeVideoWorkspace(folderPath)

    for (const video of organizedVideos) {
        // 2. Probe → decode-correctness flags
        const probeParse = await probeVideo(video.videoFilePath)
        const decodeFlags = decodeFlagsFromProbe(probeParse)

        // 3. Two measurement passes → boundary events → shots
        const perFrameYdif = await measureYdifPerFrame(video.videoFilePath)
        const halfSecondSceneScores = await measureSceneScorePerHalfSecond(video.videoFilePath)
        const boundaries = detectBoundaries(perFrameYdif, halfSecondSceneScores)
        const duration = probeParse.format?.duration ?? lastTimestampSeconds(perFrameYdif)
        const shots = shotsFromBoundaries(boundaries, duration)

        // 4. Extract frames through the correctness prefix
        const selectFrames = await extractFrames(video, decodeFlags, shots)

        const manifest : VideoManifest = {
            probeParse, decodeFlags, boundaries, shots, selectFrames,
            // Zero boundary events is a first-class outcome, not a failure: the
            // detectors self-calibrate per file and are allowed to find nothing
            editorialState : shots.length > 1 ? "multi-shot" : "single-shot",
        }
        // Store that manifest in the videos' workspace. Be careful of the context bloat adding the spacing might incur
        await writeFile(join(video.workspaceFolderPath, "manifest.json"), JSON.stringify(manifest, null, 1))
    }
}

/*
    FUNCTION ASSUMPTIONS
    1. All files in the folder are video files, fully downloaded, and not corrupted
    2. The file path is assumed to be present and absolute
    3. All files in the folder are at the root and there are no nested directories
    4. There are NO duplicate names in the folder
 */
async function initializeVideoWorkspace(folderPath : string): Promise<VideoWorkspaceEntry[]> {
    const workspaceEntries : VideoWorkspaceEntry[] = []
    // 1. create a working directory
    const workspaceRootPath = join(folderPath, ".workspace")
    await mkdir(workspaceRootPath, {recursive : true})

    // 2. For each file in the folder, create a directory with its name
    const files = await readdir(folderPath, {withFileTypes : true})
    for (const file of files) {

        if (await isVideo(join(folderPath,file.name))) {
            // Create the folder without the extension name (frames/ inside it
            // receives extractFrames output)
            const workspaceFolder = join(workspaceRootPath, parse(file.name).name)
            await mkdir(join(workspaceFolder, "frames"), {recursive : true})
            // 3. Create the JSON object to store the information.
            workspaceEntries.push({
                videoFilePath : join(folderPath,file.name),
                workspaceFolderPath: workspaceFolder
            })
        }
    }

    return workspaceEntries
}

async function probeVideo(videoFilePath : string) : Promise<Probe> {
    // header read only — milliseconds, no decode
    const {stdout} = await execFileAsync("ffprobe", [
        "-v", "error", "-show_format", "-show_streams", "-show_chapters", "-of", "json", videoFilePath
    ])
    return probeSchema.parse(JSON.parse(stdout))
}

// Flags describe the principal video stream, not the file; every flag defaults
// false unless the probe makes an explicit positive claim
function decodeFlagsFromProbe(probe : Probe) : DecodeFlags {
    const streams = probe.streams ?? []

    // 1. Collect decodable audio streams. codec_name missing means ffmpeg cannot
    //    name (so cannot decode) the stream — it stays out of the analyzable list
    const audioStreamIndexes = streams
        .filter(s => s.codec_type === "audio" && s.codec_name !== undefined)
        .map(s => s.index) // absolute container indexes — filter labels must use the [0:index] form

    // 2. Pick the principal video stream: cover art poses as a video stream
    //    (disposition attached_pic), so filter it out and take the first survivor
    const video = streams.filter(
        s => s.codec_type === "video" && !s.disposition?.attached_pic
    )[0]

    // ffprobe pre-computes rotation degrees from the display-matrix side data
    const rotation = video?.side_data_list
        ?.find(sd => sd.rotation !== undefined)
        ?.rotation

    return {
        audioStreamIndexes,

        // 3. Deinterlace — "unknown" was already stripped to undefined by the
        //    probe schema's sentinel handling; this negation is only safe post-probeSchema
        needsDeinterlace : video?.field_order !== undefined
            && video.field_order !== "progressive",

        // 4. Tonemap — pixel values on an HDR brightness curve need converting
        //    before any brightness/color measurement means anything
        needsTonemap : video?.color_transfer !== undefined
            && HDR_TRANSFERS.has(video.color_transfer),

        // 5. Rotation — 0 and ±360 are stored no-ops some encoders write anyway
        needsRotation : rotation !== undefined
            && rotation % 360 !== 0,

        // 6. SAR — "0:1" is ffprobe's in-band "unset", a normal-looking string
        //    the sentinel stripping does not catch; treat it like absent
        needsSarCorrection : video?.sample_aspect_ratio !== undefined
            && video.sample_aspect_ratio !== "1:1"
            && video.sample_aspect_ratio !== "0:1",
    }
}

/*
    Builds the correctness fragments that open EVERY video filter chain built for
    this file — frame extraction now, the measurement pass later. Placement in the
    eventual command:

        -vf "<this prefix>,<frame picker>,<output scale>"

    i.e. callers do [...ffmpegPrefixFromFlags(flags), picker, scale].join(",").
    The prefix always comes FIRST: every filter after it must receive frames that
    are already un-woven, on the SDR curve, and square-pixeled. Fragment order
    inside the prefix is fixed — reasons at each step.

    needsRotation deliberately produces no fragment: ffmpeg applies display-matrix
    rotation itself before the filter chain runs.

    The tonemap fragment uses zscale, which only exists in the keg-only ffmpeg@7
    binary (FFMPEG_BIN below) — commands built from this prefix must run through
    that binary, not the PATH ffmpeg.

    The measurement passes deliberately DON'T use this prefix.
*/
function ffmpegPrefixFromFlags(decode : DecodeFlags) : string[] {
    const fragments : string[] = []

    // 1. Un-weave FIRST — yadif must see the original untouched rows. Any scaling
    //    (including the SAR fix below) blends neighboring rows, smearing the two
    //    interlaced half-pictures together irreversibly.
    if (decode.needsDeinterlace) fragments.push("yadif")

    // 2. HDR → SDR before anything reads pixel values — JPEG frames and the
    //    brightness detectors assume the SDR curve. linearize → compress
    //    highlights (hable) → convert to bt709 → back to a JPEG-safe pixel
    //    format (tonemap works in float; format ends the float excursion).
    if (decode.needsTonemap) fragments.push(
        "zscale=t=linear:npl=100,tonemap=hable,zscale=p=bt709:t=bt709:m=bt709,format=yuv420p"
    )

    // 3. Geometry LAST — resample width by SAR so pixels come out square. This is
    //    itself a scaling op, which is exactly why it sits after yadif (see 1).
    if (decode.needsSarCorrection) fragments.push("scale=iw*sar:ih,setsar=1")

    return fragments
}

// Returns every frame's YDIF as [{timestampSeconds, value}] — nothing more.
// YDIF (from signalstats): average per-pixel brightness change vs the previous
// frame, 0–255. Near-zero inside a shot; jumps an order of magnitude at a hard
// cut — madThreshold finds those jumps downstream.
// Measured at 360p without the correctness prefix
async function measureYdifPerFrame(videoFilePath : string) : Promise<FrameMeasurement[]> {
    return measureFrames(videoFilePath,
        "scale=-2:360,signalstats",
        "lavfi.signalstats.YDIF")
}

// Returns the scene score of frames sampled 2 per second, as
// [{timestampSeconds, value}] — "how different is the picture from the one
// HALF A SECOND ago", 0–1. fps=2 sits BEFORE the scorer, and that widened
// stride is the whole point: a 1s dissolve is invisible frame-to-frame but
// spans ~2 half-second comparisons, each carrying ~half the change.
// select=gte(scene,0) keeps every frame — it exists only
// because ffmpeg computes the scene score lazily, when an expression mentions
// it. The first second is dropped: the head-of-stream comparison spikes
// spuriously on nearly every file.
async function measureSceneScorePerHalfSecond(videoFilePath : string) : Promise<FrameMeasurement[]> {
    const measurements = await measureFrames(videoFilePath,
        "fps=2,scale=-2:360,select=gte(scene\\,0)",
        "lavfi.scene_score")
    return measurements.filter(m => m.timestampSeconds >= 1.0)
}

// Decodes the ENTIRE video through a chain of measuring filters and returns one
// FrameMeasurement per surviving frame — the shared engine under both
// measurement passes; only the filters and the tag differ between them.
//
// How: -f lavfi makes ffprobe's "input file" the OUTPUT of the filter chain
// (movie= loads the real file into the chain). Measuring filters pass frames
// through untouched but attach per-frame metadata tags; -show_entries
// frame_tags=<key> prints the one we want per frame, as JSON — no stderr
// scraping (the reason this is ffprobe, not ffmpeg).
//
// Parsing constraints: ffprobe JSON stringifies all numbers (parseFloat both
// fields), and a filter that can't compute a value may omit the tag or emit
// nan — such frames are DROPPED, never coerced to 0, because one NaN poisons
// the median math downstream.
//
// If decode cost ever bites (4K/60 sources), the same chains run through
// `ffmpeg -hwaccel videotoolbox … metadata=print:file=-` at ~5× speed, at the
// cost of hand-parsing stdout.
async function measureFrames(videoFilePath : string, measuringFilterChain : string, frameTagKeyToRead : string) : Promise<FrameMeasurement[]> {
    // maxBuffer raises Node's cap on captured stdout (default ~1 MiB) — the
    //  per-frame JSON runs to tens of MiB on long videos, and hitting the cap
    //  kills the child mid-run
    const {stdout} = await execFileAsync("ffprobe", [
        "-v", "error", "-f", "lavfi",
        "-i", `movie=${videoFilePath},${measuringFilterChain}`,
        "-show_entries", `frame=pts_time:frame_tags=${frameTagKeyToRead}`,
        "-of", "json",
    ], {maxBuffer : 256 * 1024 * 1024})
    const parsed = lavfiFramesSchema.parse(JSON.parse(stdout))
    const measurements : FrameMeasurement[] = []
    for (const frame of parsed.frames) {
        const value = Number.parseFloat(frame.tags?.[frameTagKeyToRead] ?? "")
        const timestampSeconds = Number.parseFloat(frame.pts_time ?? "")
        // nan-guard: absent/nan metadata must drop the measurement, never coerce to 0
        if (Number.isFinite(value) && Number.isFinite(timestampSeconds)) {
            measurements.push({timestampSeconds, value})
        }
    }
    return measurements
}

// Draws this file's own "that's a spike" line: typicalValue plus madMultiplier
// usual-distances above it. typicalDeviation = the middle of "how far is each
// value from typical" — e.g. values 2,3,1,2,98,3,1,2,3 → typical 2, deviation 1,
// multiplier 12 → line at 14: the 98 towers over it, everything else stays under.
// Built from THIS file's numbers, so grainy film and clean CG both get correct
// lines untouched. Returns null when there is no
// deviation at all (a still image): callers turn that into zero events —
// a valid verdict, not an error.
function madThreshold(values : number[], madMultiplier : number) : number | null {
    // sort a copy, take the middle element
    const median = (vs : number[]) => [...vs].sort((a, b) => a - b)[Math.floor(vs.length / 2)]
    const typicalValue = median(values)
    // the typical distance-from-typical — the "MAD" (median absolute deviation) in the name
    const typicalDeviation = median(values.map(v => Math.abs(v - typicalValue)))
    // perfectly flat signal (a still image) — there is no line to draw
    if (typicalDeviation === 0) return null
    return typicalValue + madMultiplier * typicalDeviation
}

// Converts frames-that-crossed-the-line into events-that-happened. One physical
// cut pushes 2–3 CONSECUTIVE frames over the threshold (like one knock making
// rap-rap-rap) — so above-line frames within mergeWindowSeconds of each other
// count as ONE event, reported once at its tallest frame. Without this, every
// cut would be reported two or three times, a few hundredths of a second apart.
function eventsAboveThreshold(signal : FrameMeasurement[], threshold : number | null, mergeWindowSeconds : number) : FrameMeasurement[] {
    if (threshold === null) return []
    // endSeconds tracks each event's trailing edge while it grows — internal only
    const events : Array<FrameMeasurement & {endSeconds : number}> = []
    for (const measurement of signal) {
        // under the line: not part of any event
        if (measurement.value <= threshold) continue
        const last = events[events.length - 1]
        if (last && measurement.timestampSeconds - last.endSeconds <= mergeWindowSeconds) {
            // same knock: extend the event, keep its tallest frame as the timestamp
            last.endSeconds = measurement.timestampSeconds
            if (measurement.value > last.value) {
                last.timestampSeconds = measurement.timestampSeconds
                last.value = measurement.value
            }
        } else {
            // a gap wider than the window: this frame starts a new event
            events.push({timestampSeconds : measurement.timestampSeconds, endSeconds : measurement.timestampSeconds, value : measurement.value})
        }
    }
    // drop the internal endSeconds tracker before handing events back
    return events.map(e => ({timestampSeconds : e.timestampSeconds, value : e.value}))
}

// Finds the spike events in one signal, in two steps: draw the file's own
// threshold line (madThreshold), then group the frames that crossed it into
// distinct events (eventsAboveThreshold). Callers state what to detect —
// which signal, how strict, how close is "the same event" — and none of the
// plumbing.
function detectSpikes(signal : FrameMeasurement[], madMultiplier : number, mergeWindowSeconds : number) : FrameMeasurement[] {
    const threshold = madThreshold(signal.map(m => m.value), madMultiplier)
    return eventsAboveThreshold(signal, threshold, mergeWindowSeconds)
}

// Turns the two measurement lists into one sorted timeline of boundary events.
// In:  per-frame YDIF (the cut signal) + half-second scene scores (the soft signal)
// Out: BoundaryEvents — kind "cut" or "soft", each carrying its signal value as evidence.
// The two passes are the same detector at two focal lengths: per-frame sees
// sharp changes (hard cuts), half-second sees slow ones — but the slow pass
// ALSO re-sights every hard cut, so its events only count as "soft" when no
// cut sits within SAME_EVENT_WINDOW_SECONDS. Soft is an honest label: dissolve
// OR fade OR weak cut OR fast camera move (the known false-positive class).
// Thresholds adapt to this file's own noise; an empty result is a valid
// verdict ("no structure found"), and no event is ever counted twice.
function detectBoundaries(perFrameYdif : FrameMeasurement[], halfSecondSceneScores : FrameMeasurement[]) : BoundaryEvent[] {
    // 1. Spike events on the per-frame pass (strict bar — CUT_MAD_MULTIPLIER)
    const hardCutEvents = detectSpikes(perFrameYdif, CUT_MAD_MULTIPLIER, CUT_MERGE_WINDOW_SECONDS)

    // 2. Spike events on the half-second pass — looser bar, wider merge window
    //    because its samples are already 0.5s apart
    const halfSecondChangeEvents = detectSpikes(halfSecondSceneScores, SOFT_MAD_MULTIPLIER, SOFT_MERGE_WINDOW_SECONDS)

    // 3. Most half-second events are just cuts re-sighted at the wider stride;
    //    keep only changes with NO cut nearby — those are the soft transitions
    const changesWithNoCutSpike = halfSecondChangeEvents.filter(change =>
        !hardCutEvents.some(cut =>
            Math.abs(cut.timestampSeconds - change.timestampSeconds) <= SAME_EVENT_WINDOW_SECONDS))

    // 4. Label both lists, keep each spike's height as evidence, merge into one
    //    sorted timeline
    return [
        ...hardCutEvents.map(c => ({kind : "cut" as const, timestampSeconds : round2(c.timestampSeconds), signalValue : round2(c.value)})),
        ...changesWithNoCutSpike.map(s => ({kind : "soft" as const, timestampSeconds : round2(s.timestampSeconds), signalValue : round2(s.value)})),
    ].sort((a, b) => a.timestampSeconds - b.timestampSeconds)
}

function shotsFromBoundaries(boundaries : BoundaryEvent[], duration : number) : Shot[] {
    // every place a shot edge can be: the boundaries plus the file's own ends
    const shotEdges = [0, ...boundaries.map(b => b.timestampSeconds), duration]
    const shots : Shot[] = []
    for (let i = 0; i < shotEdges.length - 1; i++) {
        // margins keep samples off the boundary frames themselves (a midpoint
        // never needs them, but grid points near shot edges can straddle a
        // boundary that is only accurate to the merge window)
        const start = shotEdges[i] + 0.15
        const end = shotEdges[i + 1] - 0.15
        if (end - start > 0.4) shots.push({startSeconds : round2(start), endSeconds : round2(end)})
    }
    // a video with no detected structure is ONE shot spanning the whole file
    if (shots.length === 0) shots.push({startSeconds : 0, endSeconds : round2(duration)})
    return shots
}

// POLICY PLACEHOLDER — how many frames a shot deserves is a claim about the
// DOWNSTREAM MODEL's behavior (linear? logarithmic? saturating?) which nothing
// has measured yet; fitting the real curve needs a dedicated experiment.
// Until then: linear density, one frame per ~16s, floor of one per shot.
// Steps are ±1 frame only. Swap the curve by editing ONLY frameCountForShot.
function frameCountForShot(shotLengthSeconds : number) : number {
    return Math.max(1, Math.round(shotLengthSeconds / PLACEHOLDER_SECONDS_PER_FRAME))
}

// Frame PLACEMENT is separate from count and evidence-backed: slice centers
// (midpoints are 98.7% defect-free, within-shot choice ties 75% of the time;
// centers sit farthest from boundary contamination)
function selectFrameTimes(shot : Shot) : number[] {
    const length = shot.endSeconds - shot.startSeconds
    const frameCount = frameCountForShot(length)

    // slice the shot into frameCount equal slices, one frame at each CENTER:
    //   |--x--|--x--|--x--|   (x = frame time), never a frame at a slice edge.
    // frameCount = 1 degenerates to the plain midpoint
    const sliceWidth = length / frameCount
    const frameTimes : number[] = []
    for (let frameTimeSeconds = shot.startSeconds + sliceWidth / 2; frameTimeSeconds < shot.endSeconds; frameTimeSeconds += sliceWidth) {
        frameTimes.push(frameTimeSeconds)
    }
    return frameTimes
}

async function extractFrames(workspace : VideoWorkspaceEntry, flags : DecodeFlags, shots : Shot[]) : Promise<SelectFrame[]> {
    const selectFrames : SelectFrame[] = []

    // one filter chain for the whole video: fix the picture (yadif/tonemap/SAR,
    // only the fragments this file's flags demand), then shrink to 360p output
    const extractionFilterChain = [...ffmpegPrefixFromFlags(flags), "scale=-2:360"].join(",")

    for (let shotIndex = 0; shotIndex < shots.length; shotIndex++) {
        // selectFrameTimes decides WHICH moments; this loop just photographs them
        for (const frameTimeSeconds of selectFrameTimes(shots[shotIndex])) {
            // shot index + timestamp live in the filename → a frames/ listing
            // reads as a timeline even without the manifest
            const frameName = `shot${String(shotIndex).padStart(2, "0")}_t${frameTimeSeconds.toFixed(1)}.jpg`
            const framePath = join(workspace.workspaceFolderPath, "frames", frameName)
            // Runs through FFMPEG_BIN — the prefix may contain zscale, which
            // PATH ffmpeg lacks. Single-frame outputs
            // make the tonemap chain affordable even on 4K sources.
            await execFileAsync(FFMPEG_BIN, [
                "-v", "error", "-y",
                "-ss", frameTimeSeconds.toFixed(3), // seek BEFORE -i = fast keyframe seek
                "-i", workspace.videoFilePath,
                "-frames:v", "1",                   // decode exactly one frame, then stop
                "-vf", extractionFilterChain,
                "-q:v", "3",                        // JPEG quality (2=best, 31=worst)
                framePath,
            ])
            selectFrames.push({
                timestampSeconds : round2(frameTimeSeconds), // joins the merged timeline later
                shotIndex,
                framePath,
                description : "", // filled by the future vision-model step
            })
        }
    }
    return selectFrames
}

function lastTimestampSeconds(signal : FrameMeasurement[]) : number {
    return signal.length ? signal[signal.length - 1].timestampSeconds : 0
}

function round2(n : number) : number {
    return Math.round(n * 100) / 100
}

// ════ CONSTANTS AND OBJECTS ════

const execFileAsync = promisify(execFile)

// The PATH ffmpeg (Homebrew core 8.x) is built without libzimg, so it has no
// zscale filter and cannot tonemap. Extraction commands run through the keg-only
// ffmpeg@7 binary instead
const FFMPEG_BIN = "/opt/homebrew/opt/ffmpeg@7/bin/ffmpeg"

// HDR transfer functions: PQ (smpte2084) and HLG (arib-std-b67).
// Anything else — bt709, absent, stripped sentinels — is SDR: no tonemap.
const HDR_TRANSFERS = new Set(["smpte2084", "arib-std-b67"])

// Detector tuning — every number here was fit against ground truth, not chosen.
// The multipliers are coupled to their signals: 12 was fit on per-frame YDIF
// (hard-cut F1 0.979 across 10 ground-truthed videos), 5 on half-second scene
// scores (9/10 synthetic dissolves clear it; 8 kept only 3). Swapping a signal
// without re-fitting its multiplier silently leaves the validated regime.
const CUT_MAD_MULTIPLIER = 12
const SOFT_MAD_MULTIPLIER = 5

// Frame-sampling density: UNVALIDATED placeholder (see frameCountForShot) —
// the number experiment 3 replaces. 16 ⇒ 90s shot → 6 frames, 1-hour take → 225
const PLACEHOLDER_SECONDS_PER_FRAME = 16

// Event geometry, all in seconds:
const CUT_MERGE_WINDOW_SECONDS = 0.5   // per-frame spikes closer than this = one cut
const SOFT_MERGE_WINDOW_SECONDS = 1.0  // wider: the samples are 0.5s apart to begin with
const SAME_EVENT_WINDOW_SECONDS = 0.75 // a half-second change this close to a cut is the
                                       // same physical event re-sighted, not a soft transition
