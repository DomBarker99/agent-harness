import {
    type ChatContentImage,
    type ChatContentItems,
    ContentPartImageType,
    type ImageGenerationRequest,
    type ImageGenerationResponse
} from "@openrouter/sdk/models";
import {
    ImageGenerationRequestAspectRatio,
    ImageGenerationRequestBackground,
    ImageGenerationRequestOutputFormat,
    ImageGenerationRequestQuality,
    ImageGenerationRequestResolution,
} from "@openrouter/sdk/models";
import {z} from "zod";
import type {Tool, ToolFunction} from "../toolRegistry.ts";
import {OpenRouter} from "@openrouter/sdk";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import type {SessionInfo} from "../../eventPipeline.ts";
import {salvageFractionalInts, formatError} from "../../errorHandler.ts";
import {ResponseValidationError} from "@openrouter/sdk/models/errors";
import {ImageGenerationResponse$inboundSchema} from "@openrouter/sdk/models";
import type {$ZodIssue} from "zod/v4/core";
import {
    extensionFromMediaType,
    generateAssets,
    type GenerateAssetsParams,
    mediaTypeFromExtension
} from "./generateAssets.ts";

/*
    generateImage tool: validates LLM-produced args for OpenRouter image generation.

    References:
      notes: docs/notes/zod.md
      ADRs:  002 (zod at trust boundaries), 011 (salvage fractional-usage responses)
 */

// ════ CONSTANTS AND OBJECTS ════

export const GENERATE_IMAGE_TOOL_NAME = "generate_image"

// z.enum over the SDK's const objects gives closed sets — stricter than the SDK's
// OpenEnum types (which admit unrecognized strings), so hallucinated values fail
// here instead of becoming a 400 from OpenRouter.
// provider is omitted for now: it is optional, so the satisfies check still holds.
// NOTE : Streaming is disabled in tool calling
// FIXME : the provider field takes in an object of provider specific configs which can be
//  found at the endpoint for a specific image model called allowed_passthrough_paramers.
//  What is difficult is that only the names are provided but the actual types of the
//  pass through parameters is specified in each providers docs and not easily scrapable.
//  For now, they will not be implemented or type checked and are deferred until needed
export const generateImageArgs = z.object({
    prompt : z.string(),
    model : z.string(),
    aspectRatio : z.enum(ImageGenerationRequestAspectRatio).optional(),
    background : z.enum(ImageGenerationRequestBackground).optional(),
    outputFormat : z.enum(ImageGenerationRequestOutputFormat).optional(),
    quality : z.enum(ImageGenerationRequestQuality).optional(),
    resolution : z.enum(ImageGenerationRequestResolution).optional(),
    n : z.int().min(1).max(10).optional(),
    outputCompression : z.int().min(0).max(100).optional(),
    seed : z.int().optional(),
    size : z.string().optional(),
    stream : z.literal(false).default(false),
    inputReferences : z.array(z.object({
        type : z.literal(ContentPartImageType.ImageUrl),
        imageUrl : z.object({ url : z.string() })
    })).optional(),
    storageLocation : z.string().optional()
}) satisfies z.ZodType<ImageGenerationRequest & {storageLocation? : string}>

export type GenerateImageArgsType = z.infer<typeof generateImageArgs>

// NOTE: The model will be forced to fetch available models prior to calling this, at long context, the original call,
//  may be lost. Analyze behavior and see if a stand alone model fetching tool needs to be implemented
const generateImageFunction : ToolFunction = async (args : GenerateImageArgsType, session : SessionInfo) => {

    const generateAssetParams: GenerateAssetsParams = {
        toolName: GENERATE_IMAGE_TOOL_NAME,
        session: session,
        args: args,
        referenceArrays: [args.inputReferences ?? []],
        initialModelURL : "https://openrouter.ai/api/v1/images/models",
        run: async (client) => {

            const {storageLocation, ...imageGenerationRequest} = args
            let imageResult: ImageGenerationResponse
            const toolCallCount = session.toolCallCount(GENERATE_IMAGE_TOOL_NAME)
            let usageSalvageWarning: string = ""
            const saveFailures: string[] = []
            const imageArray: ChatContentItems[] = []

            // Get the model response
            try {
                imageResult = await client.images.generate({imageGenerationRequest})
            } catch (e) {

                // Eliminate down to only validation errors on an HTTP 200 — the response arrived
                //  and the generation was billed; only the SDK's parse of it failed
                if (!(e instanceof ResponseValidationError) || e.statusCode !== 200) throw e

                // Address sdk issue where some providers return valid floats but zod only accepts ints
                const salvaged = salvageFractionalInts(e, ImageGenerationResponse$inboundSchema)
                if (!salvaged) throw e

                imageResult = salvaged.data
                usageSalvageWarning = salvaged.salvageMessage
            }

            for (const [index, image] of imageResult.data.entries()) {
                // Both 1 based indexing for the tool call number and the image number
                // Ex: img_3.5 is the result of the 3rd tool call and the 5th image from that tool call
                const image_name = `img_${toolCallCount}.${index + 1}`
                const image_resolution = args.resolution ?? ""
                const image_prompt = args.prompt ?? ""

                // Push the image descriptor for the model to reference
                imageArray.push({
                    type: "text",
                    text: `${image_name} ${image_resolution} ${image_prompt}`
                })

                if (session.modelAcceptsVideoInput()) {
                    // Push the actual image
                    imageArray.push({
                        type: "image_url",
                        imageUrl: {
                            url: `data:${image.mediaType ?? "image/png"};base64,${image.b64Json}`,
                        },
                    })
                }

                // Persist to disk when requested; a failed write never discards the paid-for
                //  image from the tool result
                if (args.storageLocation) {
                    const fileName = `${image_name}.${extensionFromMediaType(image.mediaType)}`
                    try {
                        await writeFile(`${args.storageLocation}/${fileName}`, Buffer.from(image.b64Json, "base64"))
                    } catch (e) {
                        saveFailures.push(`${fileName}: ${formatError(e)}`)
                    }
                }
            }

            // Notify model the save failures occurred
            if (saveFailures.length) {
                imageArray.push({
                    type: "text",
                    text: `WARNING : the images were generated and returned, but saving to \
                     "${args.storageLocation}" failed for: ${saveFailures.join("; ")}`
                })
            }

            // Appended after the loop for the same reason as saveFailures
            if (usageSalvageWarning) {
                imageArray.push({
                    type: "text",
                    text: usageSalvageWarning
                })
            }

            return imageArray
        }
    }

    return generateAssets(generateAssetParams)
}

// Enum lists derive from the same SDK consts the Zod validator uses, so the schema
//  the model sees and the validator that checks its output cannot drift apart.
// NOTE : The description is deliberately functionality-only while the tool is in testing —
//  no behavioral guidance (cost warnings, parameter discipline) so model behavior can be
//  observed unsteered. Revisit once real usage patterns are known.
export const generateImageTool : Tool = {
    schema : {
        type : "function",
        function : {
            name : "generate_image",
            description : `Generate one or more images from a text prompt using an \
image model. Generated images are returned as image content in the tool result, so they \
become part of the chat history. The very first call does not generate: it returns the \
list of valid image model ids instead. Call at first with model set to "UNKNOWN" and a dummy prompt, then once the list is received \
again with a model id chosen from that list to generate. Only prompt and model are required. \
Previously generated images can be reused as reference inputs WITHOUT re-sending any \
image data: pass the image's name (img_<call>.<image>, printed in the text entry \
directly before each generated image) as the url in inputReferences — e.g. \
{"type": "image_url", "imageUrl": {"url": "img_2.3"}}. This is the preferred way to \
iterate on, edit, or combine earlier generations.`,
            parameters : {
                type : "object",
                additionalProperties : false,
                properties : {
                    prompt : {
                        type : "string",
                        description : "Text description of the desired image"
                    },
                    model : {
                        type : "string",
                        description : `OpenRouter image model id, author/slug format, \
e.g. "google/gemini-2.5-flash-image"`
                    },
                    aspectRatio : {
                        type : "string",
                        enum : Object.values(ImageGenerationRequestAspectRatio),
                        description : "Aspect ratio of the generated image; providers clamp to their supported subset"
                    },
                    background : {
                        type : "string",
                        enum : Object.values(ImageGenerationRequestBackground),
                        description : `Background treatment; "transparent" requires outputFormat png or webp`
                    },
                    outputFormat : {
                        type : "string",
                        enum : Object.values(ImageGenerationRequestOutputFormat),
                        description : "Encoding of the returned image; svg only works on vectorization models"
                    },
                    quality : {
                        type : "string",
                        enum : Object.values(ImageGenerationRequestQuality),
                        description : "Rendering quality; ignored by providers without a quality knob"
                    },
                    resolution : {
                        type : "string",
                        enum : Object.values(ImageGenerationRequestResolution),
                        description : "Resolution tier; exact pixel dimensions are derived per provider"
                    },
                    n : {
                        type : "integer",
                        minimum : 1,
                        maximum : 10,
                        description : "Number of images to generate; single-image providers reject n > 1"
                    },
                    outputCompression : {
                        type : "integer",
                        minimum : 0,
                        maximum : 100,
                        description : "Compression level for jpeg/webp output ONLY — omit for other formats; providers reject the combination"
                    },
                    seed : {
                        type : "integer",
                        description : "Sampling seed for reproducible output; determinism not guaranteed by all providers"
                    },
                    size : {
                        type : "string",
                        description : `Shorthand for output dimensions: a tier ("2K") or exact \
pixels ("2048x1152"). Exact pixels are authoritative — do not combine with resolution or aspectRatio`
                    },
                    inputReferences : {
                        type : "array",
                        description : `Reference images guiding image-to-image generation. \
Accepts names of previously generated images (e.g. "img_2.3") — the cheapest way to \
iterate on an earlier result — as well as HTTP(S) URLs and base64 data URLs`,
                        items : {
                            type : "object",
                            additionalProperties : false,
                            properties : {
                                type : {
                                    type : "string",
                                    enum : ["image_url"]
                                },
                                imageUrl : {
                                    type : "object",
                                    additionalProperties : false,
                                    properties : {
                                        url : {
                                            type : "string",
                                            description : `HTTP(S) URL, base64 data URL, the name of an image \
previously generated in this conversation (img_<call>.<image>, e.g. "img_2.3"), or an absolute \
local file path (e.g. "/Users/me/photo.jpg"). Names and file paths are resolved to image data \
automatically — never re-send base64 for an image this tool already created or a file on disk`
                                        }
                                    },
                                    required : ["url"]
                                }
                            },
                            required : ["type", "imageUrl"]
                        }
                    },
                    storageLocation : {
                        type : "string",
                        description : `Optional absolute path of a directory to also save the \
generated images into, one file per image named after its in-context name (e.g. \
"img_2.1.jpg"). The directory is created if it does not exist. Images are returned in the \
tool result either way — only pass this when the user wants files on disk`
                    }
                },
                required : ["prompt", "model"]
            },
        }
    },
    args : generateImageArgs,
    run : generateImageFunction
}