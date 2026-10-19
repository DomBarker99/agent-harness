import {getOpenRouterOptions} from "../../config.ts";
import type {GetVideosRequest} from "@openrouter/sdk/models/operations";
import {z} from "zod";
import type {ChatContentItems, VideoGenerationRequest} from "@openrouter/sdk/models";
import type {Tool, ToolFunction} from "../toolRegistry.ts";
import type {SessionInfo} from "../../eventPipeline.ts";
import {
    ContentPartImageType,
    FrameImageType,
    FrameType,
    VideoGenerationRequestAspectRatio,
    VideoGenerationRequestResolution,
} from "@openrouter/sdk/models";
import {generateAssets, type GenerateAssetsParams} from "./generateAssets.ts";
import {open, unlink, rename, readFile} from "node:fs/promises";
import {getMediaExtension, mediaTypeFromExtension} from "./mediaAnalysis.ts";

/*
    generateVideo tool: validates LLM-produced args for OpenRouter video generation.

    References:
      notes: docs/notes/zod.md
      ADRs:  002 (zod at trust boundaries), 013 (video returned as base64)
 */

/*
    TODO:
        1. Implement Tool
        2. Collect Bytes on accumulation
        3. Store a partial response and handle stream failures
        4. Upon a stream failure, handle re-querrying
 */

/*
    generate() : submits the initial request for the video and returns the id, initial status, and pollingID
    getGeneration() : takes an object containing the job id alongside other fields and returns the same info as generate,
        with the most useful being status to know when to fetch the stream

 */

// ════ FUNCTIONS ════
const generateVideoFunction : ToolFunction = async (args : GenerateVideoArgsType, session : SessionInfo) => {

    const generateAssetParams : GenerateAssetsParams = {
        toolName : GENERATE_VIDEO_TOOL_NAME,
        session : session,
        args : args,
        referenceArrays : [args.frameImages ?? [], args.inputReferences ?? []],
        initialModelURL : `${getOpenRouterOptions().serverURL}/videos/models`,
        run : async (client) => {
            const {storageLocation, ...imageGenerationRequest} = args
            const videoArray : ChatContentItems[] = []

            let job = await client.videoGeneration.generate({
                videoGenerationRequest : imageGenerationRequest
            })

            while (job.status != "completed") {
                job = await client.videoGeneration.getGeneration({jobId : job.id})
            }

            // Iterate over the list of urls returned once they fully arrive
            if (job.unsignedUrls) {
                // keys() not entries(): jobId + index fully addresses the content endpoint, and the
                //  URL string itself is never used now that the bytes go back as a data URL
                for (const index of job.unsignedUrls.keys()) {
                    // For now, hold off on retrying. Will add in functionality if corruption starts to occur.
                    //  Model may be able to re-render the video deterministically but that is wasteful to redo
                    let stream = await client.videoGeneration.getVideoContent({
                        jobId : job.id,
                        index : index
                    })

                    // Create a temporary filename, file extension will be determined after video is downloaded
                    const fileName = `video_${session.toolCallCount(GENERATE_VIDEO_TOOL_NAME)}.${index + 1}`
                    const pathNoExtension = `${args.storageLocation}${args.storageLocation.endsWith("/") ? fileName : "/" + fileName}`
                    const tempPath = pathNoExtension + ".temp"
                    // open path to the file
                    const handle = await open(tempPath, "w")
                    let bytesWritten = 0

                    try {
                        // Iterate over the stream of chunks and write to the file
                        for await (const chunk of stream) {
                            const result = await handle.write(chunk)
                            bytesWritten += result.bytesWritten
                        }
                    } catch (e) {
                        // Close the file handler
                        await handle.close().catch(() => {})
                        // Unlink the file so that a corrupted version doesn't stay on disk
                        await unlink(tempPath).catch(() => {})
                        // Throw the error
                        throw e
                    }

                    // Get the actual file extension and re name the temp file
                    const actualFileExtension = await getMediaExtension(tempPath)
                    const finalFileName = actualFileExtension ? `${fileName}.${actualFileExtension}` : `${fileName}.unknown`
                    const finalPath =  `${args.storageLocation}${args.storageLocation.endsWith("/") ? finalFileName : "/" + finalFileName}`
                    await rename(tempPath,finalPath)

                    // Clean up
                    await handle.close()
                    const mib = bytesWritten / 1024 / 1024

                    // At this point files are on disk, package up ChatContentItemsArray
                    videoArray.push({
                        type : "text",
                        text : `${finalFileName} ${mib}mib ${args.prompt}`
                    })

                    if (session.modelAcceptsVideoInput()){
                        // Base64 rather than the job.unsignedUrls entry, and the memory cost that
                        //  buys — see docs/decisions/013
                        const bytes = await readFile(finalPath)
                        videoArray.push({
                            type : "video_url",
                            videoUrl : {
                                // mp4 assumed, matching the extension picked for `path` above
                                url : `data:video/mp4;base64,${bytes.toString("base64")}`
                            }
                        })
                    }

                    // NOTE: Do not over complicate this, video generation is single shot so uniform
                    //  sampling works.
                    if (session.modelAcceptsImageInput()){
                        // FIXME : Strip image frames
                        const bytes = await readFile(finalPath)
                    }
                }
            }
            return videoArray
        }
    }

    return generateAssets(generateAssetParams)
}

// ════ CONSTANTS AND OBJECTS ════

export const GENERATE_VIDEO_TOOL_NAME = "generate_video"

// Same shape as generateImageArgs: z.enum over the SDK's const objects gives closed sets,
// stricter than the SDK's OpenEnum types (which admit unrecognized strings), so hallucinated
// values fail here instead of becoming a 400 from OpenRouter.
// The satisfies target is VideoGenerationRequest, NOT VideoGenerationRequest$Outbound —
// $Outbound is the snake_case wire shape the SDK serializes to itself; the camelCase
// VideoGenerationRequest is what client.videoGeneration.generate() actually accepts, so
// validating against $Outbound would produce args the generate() call above rejects. Field
// set and semantics are identical either way.
// provider and callbackUrl are omitted: both are optional, so the satisfies check still
// holds. provider has the same unscrapable per-provider passthrough problem documented in
// generateImage.ts; callbackUrl is a harness-level concern the model has no business setting.
export const generateVideoArgs = z.object({
    prompt : z.string(),
    model : z.string(),
    aspectRatio : z.enum(VideoGenerationRequestAspectRatio).optional(),
    resolution : z.enum(VideoGenerationRequestResolution).optional(),
    duration : z.number().positive().optional(),
    generateAudio : z.boolean().optional(),
    seed : z.int().optional(),
    size : z.string().optional(),
    frameImages : z.array(z.object({
        type : z.literal(FrameImageType.ImageUrl),
        imageUrl : z.object({ url : z.string() }),
        frameType : z.enum(FrameType)
    })).optional(),
    // InputReference is a union over the three content-part kinds; the discriminator is the
    // shared `type` tag, so a wrong url field for the claimed kind fails here
    inputReferences : z.array(z.discriminatedUnion("type", [
        z.object({
            type : z.literal(ContentPartImageType.ImageUrl),
            imageUrl : z.object({ url : z.string() })
        }),
        z.object({
            type : z.literal("audio_url"),
            audioUrl : z.object({ url : z.string() })
        }),
        z.object({
            type : z.literal("video_url"),
            videoUrl : z.object({ url : z.string() })
        })
    ])).optional(),
    storageLocation : z.string()
}) satisfies z.ZodType<VideoGenerationRequest & {storageLocation : string}>

export type GenerateVideoArgsType = z.infer<typeof generateVideoArgs>

// Enum lists derive from the same SDK consts the Zod validator uses, so the schema the model
//  sees and the validator that checks its output cannot drift apart.
// NOTE : description is functionality-only while the tool is in testing, matching
//  generate_image — no behavioral guidance (cost warnings, parameter discipline) so model
//  behavior can be observed unsteered.
// NOTE : if the run function adopts generate_image's "first call returns the model list"
//  convention, that paragraph has to be added here too — the model can only follow a
//  protocol it is told about.
export const generateVideoTool : Tool = {
    schema : {
        type : "function",
        function : {
            name : GENERATE_VIDEO_TOOL_NAME,
            description : `Generate a video from a text prompt using a video model. \
Generation is asynchronous: the request starts a job that is polled until it completes, so \
this call takes substantially longer than a text or image call. The video is written to \
disk, so storageLocation is required alongside prompt and \
model.`,
            parameters : {
                type : "object",
                additionalProperties : false,
                properties : {
                    prompt : {
                        type : "string",
                        description : "Text description of the desired video, including any camera and motion direction"
                    },
                    model : {
                        type : "string",
                        description : `OpenRouter video model id, author/slug format, \
e.g. "bytedance/seedance-1-5-pro"`
                    },
                    aspectRatio : {
                        type : "string",
                        enum : Object.values(VideoGenerationRequestAspectRatio),
                        description : "Aspect ratio of the generated video; providers clamp to their supported subset"
                    },
                    resolution : {
                        type : "string",
                        enum : Object.values(VideoGenerationRequestResolution),
                        description : "Resolution tier; exact pixel dimensions are derived per provider"
                    },
                    duration : {
                        type : "number",
                        description : `Length of the video in SECONDS. Providers accept only a \
small set of durations (commonly 5 or 10) and reject anything else`
                    },
                    generateAudio : {
                        type : "boolean",
                        description : `Whether to generate an audio track alongside the video. \
Defaults to the endpoint's own capability flag; models without audio support ignore or reject it`
                    },
                    seed : {
                        type : "integer",
                        description : "Sampling seed for reproducible output; determinism not guaranteed by all providers"
                    },
                    size : {
                        type : "string",
                        description : `Exact pixel dimensions as "WIDTHxHEIGHT" (e.g. "1280x720"). \
Interchangeable with resolution + aspectRatio — do not combine with them`
                    },
                    frameImages : {
                        type : "array",
                        description : `Images pinning the first and/or last frame of the video, \
so the generation starts and/or ends on a known image. At most one of each frameType`,
                        items : {
                            type : "object",
                            additionalProperties : false,
                            properties : {
                                type : {
                                    type : "string",
                                    enum : [ContentPartImageType.ImageUrl]
                                },
                                imageUrl : {
                                    type : "object",
                                    additionalProperties : false,
                                    properties : {
                                        // FIXME: Implement tool and file reference
                                        url : {
                                            type : "string",
                                            description : "HTTP(S) URL or base64 data URL of the frame image"
                                        }
                                    },
                                    required : ["url"]
                                },
                                frameType : {
                                    type : "string",
                                    enum : Object.values(FrameType),
                                    description : "Which end of the video this image pins"
                                }
                            },
                            required : ["type", "imageUrl", "frameType"]
                        }
                    },
                    inputReferences : {
                        type : "array",
                        description : `Reference assets guiding the generation — style, subject, \
or motion to imitate, as opposed to frameImages which pin exact frames. Image references \
work everywhere; audio and video references are only honored by providers that support \
them and are ignored elsewhere`,
                        items : {
                            type : "object",
                            additionalProperties : false,
                            properties : {
                                type : {
                                    type : "string",
                                    enum : ["image_url", "audio_url", "video_url"],
                                    description : "Kind of reference asset; selects which url field to send"
                                },
                                imageUrl : {
                                    type : "object",
                                    additionalProperties : false,
                                    properties : {
                                        url : {type : "string"}
                                    },
                                    required : ["url"],
                                    description : `Required when type is "image_url", omitted otherwise. \
HTTP(S) URL or base64 data URL`
                                },
                                audioUrl : {
                                    type : "object",
                                    additionalProperties : false,
                                    properties : {
                                        url : {type : "string"}
                                    },
                                    required : ["url"],
                                    description : `Required when type is "audio_url", omitted otherwise. \
HTTP(S) URL or base64 data URL`
                                },
                                videoUrl : {
                                    type : "object",
                                    additionalProperties : false,
                                    properties : {
                                        url : {type : "string"}
                                    },
                                    required : ["url"],
                                    description : `Required when type is "video_url", omitted otherwise. \
HTTP(S) URL or base64 data URL`
                                }
                            },
                            required : ["type"]
                        }
                    },
                    // Required here, optional in generate_image: almost no model reachable from
                    //  /chat/completions accepts video input, so a generated video cannot be put
                    //  back into chat history the way an image can — disk is the only destination
                    storageLocation : {
                        type : "string",
                        description : `Absolute path of a directory to save the generated \
video into, one file per video. The directory is created if it does not exist. This is \
REQUIRED: unlike generated images, the video is not returned as content in the tool result, \
so it is lost unless it is written here`
                    }
                },
                required : ["prompt", "model", "storageLocation"]
            }
        }
    },
    args : generateVideoArgs,
    run : generateVideoFunction
}


