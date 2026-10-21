import {fileTypeFromFile} from "file-type";
import {readdir, stat} from "node:fs/promises";

/*
    Maps between a file's media type, its extension, and its real container.
    The first two directions are pure string mapping; the third reads the file.
 */

// b64Json is the entire encoded file, so the extension is derived from the media type alone

export function extensionFromMediaType (mediaType : string | undefined) : string {
    switch (mediaType) {
        case "image/jpeg" : return "jpg"
        case "image/webp" : return "webp"
        case "image/svg+xml" : return "svg"
        default : return "png"
    }
}

// Inverse of the above, for local-file references where only the path is known
export function mediaTypeFromExtension (filePath : string) : string {
    if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg"
    if (filePath.endsWith(".webp")) return "image/webp"
    if (filePath.endsWith(".svg")) return "image/svg+xml"
    return "image/png"
}

/*
    Reads the file's leading magic bytes and reports the container it actually is,
    ignoring whatever the path claims.

    Two limits come with that. It sees the container and not the streams inside, so an
    audio-only .mp4 reports "mp4"; ask ffprobe (ffprobe-schema.ts) if you need to know
    what streams are present. And it covers binary formats only, so SVG and other text
    formats return undefined — those come in through extensionFromMediaType instead.
 */
export async function getMediaExtension (filePath : string) : Promise<string | undefined> {
    const detected = await fileTypeFromFile(filePath)
    return detected?.ext
}

// NOTE : This is not perfect, checking only the mime type has a lot of holes. For example, a lot
//  of webm formats incorrectly claim video as well as Matroska formats. For now, this is just a
//  simple parse out obviously not video files
export async function isVideo(filePath : string) : Promise<boolean> {

    const checkFile = await stat(filePath)

    // 1. Verify it is a file
    if (checkFile.isFile()) {
        // 2. Verify its mime type contains "video" — the MIME ("video/mp4") carries
        //    it; the extension ("mp4") never does, which silently rejected every file
        const detected = await fileTypeFromFile(filePath)
        if (detected && detected.mime.indexOf("video") != -1) return true
    }

    return false
}
