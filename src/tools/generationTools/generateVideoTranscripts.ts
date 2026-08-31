// FIXME: Implement audio transcription tool
import { createReadStream } from "fs";
import { DeepgramClient } from "@deepgram/sdk";

const client : DeepgramClient = new DeepgramClient();

client.listen.v1.


const response = await client.listen.v1.media.transcribeFile(
    createReadStream("audio.wav"),
    { model: "nova-3" }
);
console.log(response.results.channels[0].alternatives[0].transcript);