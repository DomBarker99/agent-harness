import type {ChatContentItems, ImageGenerationResponse, InputReference} from "@openrouter/sdk/models";
import {GENERATE_VIDEO_TOOL_NAME, generateVideoArgs, type GenerateVideoArgsType} from "./generateVideo.ts";
import {GENERATE_IMAGE_TOOL_NAME, generateImageArgs, type GenerateImageArgsType} from "./generateImage.ts";
import type {SessionInfo} from "../../eventPipeline.ts";
import {OpenRouter} from "@openrouter/sdk";
import {getOpenRouterOptions} from "../../config.ts";
import {mkdir, readFile} from "node:fs/promises";
import {z} from "zod";
import {formatError} from "../../errorHandler.ts";
import {isAvailableTool} from "../toolRegistry.ts";
import {mediaTypeFromExtension} from "./mediaAnalysis.ts";

export async function generateAssets(params : GenerateAssetsParams) : Promise<ChatContentItems[]> {

    const malformedReferenceAssets : string[] = []
    let assetArray : ChatContentItems[] = []

    const toolCallCount = params.session.toolCallCount(params.toolName)

    if (toolCallCount) {
        // set up the client
        const client : OpenRouter = new OpenRouter(getOpenRouterOptions());

        // Validate the storage location
        if (params.args.storageLocation) {
            try {
                await mkdir(params.args.storageLocation, {recursive : true})
            } catch (e) {
                return [{
                    type : "text",
                    text : `ERROR : storageLocation "${params.args.storageLocation}" is not a usable directory \
                    (${formatError(e)}). Generation was not run; resend with a valid directory path or omit storageLocation.`
                }]
            }
        }

        // Swap all image references with actual base64 encodings
        await swapAssetReferences(params.referenceArrays, malformedReferenceAssets, params.session)

        // Check to see if there were any malformed or invalid image references to previous tool calls
        //  or file paths
        if (malformedReferenceAssets.length) {
            return [{
                type : "text",
                text : getMalformedReferenceError(malformedReferenceAssets)
            }]
        }

        // No toolName check needed: run already carries its own args
        assetArray = await params.run(client)

    } else {
        // If the tool has been called yet, fetch the list of assets generations models to use
        try {
            // Await for the server to connect
            const response = await fetch(params.initialModelURL)

            assetArray.push({
                type : "text",
                text : await response.text()
            })

        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e)

            assetArray.push({
                type : "text",
                text : reason
            })
        }
    }

    return assetArray
}

async function swapAssetReferences(referenceArrays : InputReference[][], malformedReferenceAssets : string[], session : SessionInfo) {
    for (const referenceArray of referenceArrays) {
        for (const reference of referenceArray) {
            // FIXME : Video and Audio references are expected to be in proper
            //  format and cannot be referenced by tool call or file path, bad!
            if (reference.type != "image_url") continue
            const url = reference.imageUrl.url
            // url is already in the valid format
            if (url.startsWith("http") || url.startsWith("data")) continue
            // Parse for img
            if (url.startsWith("img_")) {

                const toolCallImage = session.getImageFromName(url.split(" ")[0])
                if (toolCallImage) reference.imageUrl.url = toolCallImage.imageUrl.url
                else malformedReferenceAssets.push(url)

            } else if (url.startsWith("/")) {
                // Parse for path
                try {
                    const bytes = await readFile(url)
                    reference.imageUrl.url = `data:${mediaTypeFromExtension(url)};base64,${bytes.toString("base64")}`
                } catch (e) {
                    malformedReferenceAssets.push(`${url} (${formatError(e)})`)
                }
            }
        }
    }
}

function getMalformedReferenceError (malformedReferenceAssets : string[]) : string {
    return `ERROR : reference(s) [${malformedReferenceAssets.join(", ")}] do not resolve to \
any generated image. Generated images are named img_<call>.<image>, both 1-based: <call> is \
which generate_image call produced the image, <image> is its position within that call. \
Example: img_2.3 is the third image returned by the second generating call. Every image's \
exact name is in the text entry immediately preceding it in that call's tool result — copy \
it from there rather than guessing. Generation was not run; resend with corrected references.`
}

// One params type for both tools rather than a discriminated union — run takes no args and
//  closes over its own at the call site
// args is only read for the fields both schemas share (storageLocation, prompt, model,
//  resolution, seed, size); anything tool-specific belongs inside run
// referenceArrays is in/out — swapAssetReferences mutates the caller's arrays in place, so
//  run sees the resolved urls without anything being handed back
export type GenerateAssetsParams = {
    toolName : typeof GENERATE_IMAGE_TOOL_NAME | typeof GENERATE_VIDEO_TOOL_NAME
    initialModelURL : string
    session : SessionInfo
    args : GenerateImageArgsType | GenerateVideoArgsType
    referenceArrays : InputReference[][]
    run : (client : OpenRouter) => Promise<ChatContentItems[]>
}