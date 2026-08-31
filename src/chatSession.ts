/*
    ChatSession represents a single chat that multiple listeners can be attached to.
    A turn can be invoked with a single message in plain text (for now) and all
    listeners are notified when an event occurs through the Event emmiter inner class

    For a session to be created, it requires a ...
        1. client (inference server, api keys)
        3. system prompt
        4. model
        5. reasoning
        6. provider (Open Router specific)
        7. tools
*/
import {EventEmitter} from "node:events";
import {runChatTurn, type RunChatTurnParams} from "./turnRunners.ts";
import {EventPipeline, type TurnEventEmitter, type TurnEventMap} from "./eventPipeline.ts";
import {OpenRouter} from "@openrouter/sdk";
import type {ChatRequest, ChatUserMessage, Model, ModelResponse} from "@openrouter/sdk/models";

/*
    FIXME : ChatSession only supports retrieving response from the /chat/completions end point. Different Variants of
        ChatSession will need to be created to handle embeddings, images, videos, rerank, and TTS / STT endpoints.
        Each endpoint requires the use of a different client specific method which takes in different variants of
        the ChatRequest class.

    FIXME : Given the wide variety of models that are exposed via the chat/completions end point, some sort of
        compatability checking needs to be done when instantiating ChatSession. /chat/completions/models provides an
        array of fields that are accepted in a ChatRequest and needs to be checked against whatever is passed to
        the constructor. A strict mode can be enabled which throws an error when the session is created at runtime
        or the default behavior would simply log that certain configs were dropped. This would also force defaults
        to be inffered from the model card and also added in at run time. Default configs may need to be removed
        due to complexity of inffering what a model accepts outside of maybe the injection of a basic system prompt.

    FIXME : Despite /chat/completions having support for a few models with [text, image] output modalities, the
        ChatStreamChunk class that represents a part of a stream doesnt even contain a field to hold the final image.
        Given that ChatSession (Sessions for /chat/completions) is by default streaming, each delta would need to be
        casted if image models are supported. Models with image output modalities should be rejected and only used
        with a non-streaming response which does properly return images fields correctly.

    NOTE : Upon a brief inspection, OpenRouter may not be correctly translating the reasoning fields set with the OpenAI
        style of effort correctly to the reasoning style for Anthropic. This needs a deepere analysis but any session
        instantiated with an Anthropic model may need to have a warning thrown that its reasoning params are not compatable
 */
export class ChatSession {

    readonly queue : ChatUserMessage[]
    private busy : boolean
    readonly eventPipeline : EventPipeline
    readonly eventEmitter : TurnEventEmitter
    private model : Model | undefined

    // FIXME : Look into defensive copying
    constructor(readonly client : OpenRouter,
                readonly chatRequest : ChatRequest) {
        this.getModelFromChatRequest(chatRequest).then((m) => this.model = m)
        this.eventEmitter = new EventEmitter<TurnEventMap>()
        this.eventPipeline = new EventPipeline(this.chatRequest.messages, this.eventEmitter, this.model)
        this.queue = []
        this.busy = false
    }

    submit = async (userMessage : ChatUserMessage) => {
        this.queue.push(userMessage) // Queue up the userMessage

        if (!this.busy) {
            this.busy = true // Mark the session as currently processing requests

            let prompt: ChatUserMessage | undefined

            // Given the array is being drained, an iterator cannot be used for the looping
            //  mechanism as the shifting will cause elements to be skipped
            while ((prompt = this.queue.shift()) !== undefined) {
                const runChatTurnParams : RunChatTurnParams = {
                    chatRequest: this.chatRequest,
                    client: this.client,
                    eventPipeline: this.eventPipeline,
                    userPrompt: prompt
                }

                await runChatTurn(runChatTurnParams)
            }
            this.busy = false // Mark the session as having fully processed all requests
        }
     }

     static submitOnce = async (userMessage : ChatUserMessage,
                                                                    eventEmitter : TurnEventEmitter,
                                                                    client : OpenRouter,
                                                                    chatRequest : ChatRequest) => {

        const eventPipeline = new EventPipeline(chatRequest.messages, eventEmitter)

         const runChatTurnParams : RunChatTurnParams = {
             chatRequest: chatRequest,
             client: client,
             eventPipeline: eventPipeline,
             userPrompt: userMessage
         }

         await runChatTurn(runChatTurnParams)
     }

     getModelFromChatRequest = async (request : ChatRequest) : Promise<Model | undefined> => {

         const modelName : string = request.model ?? "";
         const client : OpenRouter = new OpenRouter()
         let response : ModelResponse | undefined = undefined

         try {
             response  = await client.models.get({
                 author : modelName.split("/")[0],
                 slug : modelName.split("/")[1]
             })
         } catch (e) { }

         return response?.data ?? undefined
    }
}