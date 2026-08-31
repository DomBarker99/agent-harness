/**
 * Zod schemas for the `streams` and `format` sections of ffprobe JSON output.
 *
 * Field lists and the required/optional split come from the shipped XSD:
 *   /opt/homebrew/share/ffmpeg/ffprobe.xsd   (streamType, formatType,
 *                                             streamDispositionType)
 * Read one type with:
 *   sed -n '/complexType name="streamType"/,/<\/xsd:complexType>/p' <xsd>
 *
 * Produce matching output with:
 *   ffprobe -v error -show_format -show_streams -of json <file>
 *
 * Verified against ffmpeg 8.0.1 / zod 4.4.3 in five configurations: plain,
 * with -show_data_hash/-count_frames/-count_packets, with
 * -show_optional_fields always, a file carrying a display matrix, and
 * -show_chapters against a 71-chapter file.
 */

import { z } from "zod";

/* ── coercion helpers ──────────────────────────────────────────────────
   ffprobe emits numerics as JSON numbers or JSON strings depending on the
   field, and -show_optional_fields always fills gaps with "N/A"/"unknown".
   Strip the sentinels, then coerce. */

const SENTINELS = new Set(["N/A", "unknown", ""]);

const clean = (v: unknown) =>
  typeof v === "string" && SENTINELS.has(v) ? undefined : v;

/* .optional() must live INSIDE the preprocess. If it wraps the outside,
   ZodOptional only short-circuits on input that is already undefined —
   a sentinel becomes undefined too late and Number(undefined) is NaN. */
const num = z.preprocess(clean, z.coerce.number());
const int = z.preprocess(clean, z.coerce.number().int());

const numOpt = z.preprocess(clean, z.coerce.number().optional());
const intOpt = z.preprocess(clean, z.coerce.number().int().optional());
const strOpt = z.preprocess(clean, z.string().optional());

/**
 * ffprobe writes disposition flags as the numbers 0 and 1. Turn them into
 * real booleans, and let a missing value stay missing.
 *
 * The last line is an allowlist, not a truthiness check: it asks "is this
 * exactly 1, "1", or true?" and answers false for everything else. Boolean(v)
 * would be wrong here, because every non-empty string is truthy in JS — so
 * Boolean("0") is true, the opposite of what ffprobe meant.
 */
const toFlag = (v: unknown) => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string" && SENTINELS.has(v)) return undefined;
  return v === 1 || v === "1" || v === true;
};

const flag = z.preprocess(toFlag, z.boolean());
const flagOpt = z.preprocess(toFlag, z.boolean().optional());

/** "24/1", "30000/1001", or "0/0" meaning none. */
const rational = z.string().regex(/^\d+\/\d+$/);

/* ── child sections ─────────────────────────────────────────────────── */

/** streamDispositionType — all 19 flags per the XSD, catchall for new ones. */
export const dispositionSchema = z
  .object({
    default: flag,
    dub: flag,
    original: flag,
    comment: flag,
    lyrics: flag,
    karaoke: flag,
    forced: flag,
    hearing_impaired: flag,
    visual_impaired: flag,
    clean_effects: flag,
    attached_pic: flag,
    timed_thumbnails: flag,
    non_diegetic: flag,
    captions: flag,
    descriptions: flag,
    metadata: flag,
    dependent: flag,
    still_image: flag,
    multilayer: flag,
  })
  .partial()
  .catchall(flagOpt);

/** tagsType is flagged V in `ffprobe -sections` — variable keys. */
export const tagsSchema = z.record(z.string(), z.string());

/**
 * Each entry names its kind, then carries kind-specific keys.
 * Rotation lives here, NOT in width/height — a 1920x1080 stream with a
 * 90 degree display matrix is actually portrait.
 */
export const sideDataSchema = z.looseObject({
  side_data_type: z.string(),
  rotation: numOpt,
  displaymatrix: z.string().optional(),
});

/* ── streamType ─────────────────────────────────────────────────────── */

const streamBase = z.looseObject({
  // required in the XSD — note that codec_name and duration are NOT
  index: int,
  codec_tag: z.string(),
  codec_tag_string: z.string(),
  r_frame_rate: rational,
  avg_frame_rate: rational,
  time_base: z.string(),

  // identity
  codec_name: strOpt,
  codec_long_name: strOpt,
  profile: strOpt,
  codec_type: strOpt,
  id: strOpt,

  // extradata — only with -show_data / -show_data_hash
  extradata: strOpt,
  extradata_size: intOpt,
  extradata_hash: strOpt,

  // video
  width: intOpt,
  height: intOpt,
  coded_width: intOpt,
  coded_height: intOpt,
  closed_captions: flagOpt,
  film_grain: flagOpt,
  has_b_frames: intOpt,
  sample_aspect_ratio: strOpt,
  display_aspect_ratio: strOpt,
  pix_fmt: strOpt,
  level: intOpt,
  color_range: strOpt,
  color_space: strOpt,
  color_transfer: strOpt,
  color_primaries: strOpt,
  chroma_location: strOpt,
  field_order: strOpt,
  refs: intOpt,

  // audio
  sample_fmt: strOpt,
  sample_rate: intOpt,
  channels: intOpt,
  channel_layout: strOpt,
  bits_per_sample: intOpt,
  initial_padding: intOpt,

  // timing and size
  start_pts: intOpt,
  start_time: numOpt,
  duration_ts: intOpt,
  duration: numOpt,
  bit_rate: intOpt,
  max_bit_rate: intOpt,
  bits_per_raw_sample: intOpt,
  nb_frames: intOpt,
  nb_read_frames: intOpt, // needs -count_frames
  nb_read_packets: intOpt, // needs -count_packets

  // child sections
  disposition: dispositionSchema.optional(),
  tags: tagsSchema.optional(),
  side_data_list: z.array(sideDataSchema).optional(),
});

/** width/height are optional in the XSD; required here because a video
 *  stream without dimensions is not something a caller can use. */
const videoStream = streamBase.extend({
  codec_type: z.literal("video"),
  width: int,
  height: int,
});

const audioStream = streamBase.extend({
  codec_type: z.literal("audio"),
  sample_rate: int,
  channels: int,
});

/**
 * Ordered union, not discriminatedUnion: codec_type is optional in the XSD,
 * so the third member has no literal to discriminate on. It catches
 * subtitle, data and attachment streams, and anything new.
 */
export const streamSchema = z.union([videoStream, audioStream, streamBase]);

/* ── formatType ─────────────────────────────────────────────────────── */

export const formatSchema = z.looseObject({
  filename: z.string(),
  nb_streams: int,
  nb_programs: int,
  format_name: z.string(),

  nb_stream_groups: intOpt, // added in ffmpeg 7, absent on 6.x
  format_long_name: strOpt,
  start_time: numOpt,
  duration: numOpt,
  size: intOpt,
  bit_rate: intOpt,
  probe_score: intOpt,
  tags: tagsSchema.optional(),
});

/* ── chapterType ────────────────────────────────────────────────────── */

/** Appears only with -show_chapters. start/end are ticks in this chapter's
 *  own time_base — use start_time/end_time (seconds) for anything human. */
export const chapterSchema = z.looseObject({
  id: int,
  time_base: z.string(),
  start: int,
  start_time: numOpt, // the one optional attribute in the XSD
  end: int,
  end_time: num,
  tags: tagsSchema.optional(), // tags.title is the chapter name
});

/* ── the document ───────────────────────────────────────────────────── */

/** Which top-level keys appear is decided by the -show_* flags you pass,
 *  not by the file, so all of them are optional. */
export const probeSchema = z.looseObject({
  streams: z.array(streamSchema).optional(),
  format: formatSchema.optional(),
  chapters: z.array(chapterSchema).optional(),
  error: z.object({ code: int, string: z.string() }).optional(),
});

export type Disposition = z.infer<typeof dispositionSchema>;
export type SideData = z.infer<typeof sideDataSchema>;
export type Stream = z.infer<typeof streamSchema>;
export type Format = z.infer<typeof formatSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type Probe = z.infer<typeof probeSchema>;

/** "30000/1001" -> 29.97 · null for the "0/0" ffprobe uses on audio. */
export function rate(value: string): number | null {
  const [n, d] = value.split("/").map(Number);
  return d === 0 ? null : n / d;
}
