import {
    BadGatewayResponseError,
    BadRequestResponseError,
    ConflictResponseError,
    ConnectionError,
    EdgeNetworkTimeoutResponseError,
    ForbiddenResponseError,
    HTTPClientError,
    InternalServerResponseError,
    InvalidRequestError,
    NotFoundResponseError,
    OpenRouterDefaultError,
    OpenRouterError,
    PayloadTooLargeResponseError,
    PaymentRequiredResponseError,
    ProviderOverloadedResponseError,
    RequestAbortedError,
    RequestTimeoutError,
    RequestTimeoutResponseError,
    ResponseValidationError,
    SDKValidationError,
    ServiceUnavailableResponseError,
    TooManyRequestsResponseError,
    UnauthorizedResponseError,
    UnexpectedClientError,
    UnprocessableEntityResponseError,
} from "@openrouter/sdk/models/errors";
import {z, type ZodSafeParseResult} from "zod";
import {ImageGenerationResponse$inboundSchema} from "@openrouter/sdk/models";
import type {$ZodIssue} from "zod/v4/core";

// Every typed status error carries the same payload shape; this renders the shared part.
function statusDetails(e : OpenRouterError, payload : { code : number; message : string;
    metadata? : { [k : string] : any | null } | null | undefined }) : string {
    return [
        `${e.name} (HTTP ${e.statusCode})`,
        `server says: ${payload.message} (code ${payload.code})`,
        payload.metadata ? `metadata: ${JSON.stringify(payload.metadata)}` : "",
    ].filter(Boolean).join("\n");
}

export function formatError(e : unknown) : string {
    switch (true) {

        // ──── validation family: a response arrived but didn't match the SDK's schema ────

        case e instanceof ResponseValidationError:
            return `response failed schema validation (HTTP ${e.statusCode})\n${e.pretty()}`;

        case e instanceof SDKValidationError:
            return `value failed SDK schema validation\n${e.pretty()}`;

        // ──── typed HTTP statuses: identical payloads, per-status human hints ────

        case e instanceof BadRequestResponseError:
            return `${statusDetails(e, e.error)}\nhint: the request or an argument combination was rejected — read the server's message and adjust the parameters before retrying`;

        case e instanceof UnauthorizedResponseError:
            return `${statusDetails(e, e.error)}\nhint: API key missing, invalid, or revoked`;

        case e instanceof PaymentRequiredResponseError:
            return `${statusDetails(e, e.error)}\nhint: out of credits — top up the OpenRouter account`;

        case e instanceof ForbiddenResponseError:
            return `${statusDetails(e, e.error)}\nhint: key is valid but not allowed to do this (model access / moderation)`;

        case e instanceof NotFoundResponseError:
            return `${statusDetails(e, e.error)}\nhint: bad endpoint or unknown model id`;

        case e instanceof RequestTimeoutResponseError:
            return `${statusDetails(e, e.error)}\nhint: the server gave up waiting on the request (HTTP 408) — retryable`;

        case e instanceof ConflictResponseError:
            return `${statusDetails(e, e.error)}\nhint: resource conflict / concurrent modification`;

        case e instanceof PayloadTooLargeResponseError:
            return `${statusDetails(e, e.error)}\nhint: request body too large — likely a runaway message history`;

        case e instanceof UnprocessableEntityResponseError:
            return `${statusDetails(e, e.error)}\nhint: request parsed but was semantically invalid (bad params for this model?)`;

        case e instanceof TooManyRequestsResponseError:
            return `${statusDetails(e, e.error)}\nhint: rate limited — back off and retry`;

        case e instanceof InternalServerResponseError:
            return `${statusDetails(e, e.error)}\nhint: OpenRouter-side failure — retryable, not your fault`;

        case e instanceof BadGatewayResponseError:
            return `${statusDetails(e, e.error)}\nhint: upstream provider returned garbage to OpenRouter — retryable`;

        case e instanceof ServiceUnavailableResponseError:
            return `${statusDetails(e, e.error)}\nhint: service down or overloaded — retryable with backoff`;

        case e instanceof EdgeNetworkTimeoutResponseError:
            return `${statusDetails(e, e.error)}\nhint: OpenRouter's edge timed out — retryable`;

        case e instanceof ProviderOverloadedResponseError:
            return `${statusDetails(e, e.error)}\nhint: the underlying model provider is overloaded — retry or switch provider`;

        // ──── unmatched statuses: no parsed payload, only the raw base fields ────

        case e instanceof OpenRouterDefaultError:
        case e instanceof OpenRouterError:
            return `${e.name} (HTTP ${e.statusCode})\nraw body: ${e.body.slice(0, 500)}`;

        // ──── network family: the request never got a response ────

        case e instanceof ConnectionError:
        case e instanceof RequestAbortedError:
        case e instanceof RequestTimeoutError:
        case e instanceof InvalidRequestError:
        case e instanceof UnexpectedClientError:
        case e instanceof HTTPClientError: {
            let base = `${e.name}: ${e.message}`;
            return e.cause ? `${base}\ncause: ${String(e.cause)}` : base;
        }

        // ──── not from the SDK at all ────

        case e instanceof Error:
            return `${e.name}: ${e.message}`;

        default:
            return `non-Error thrown: ${String(e)}`;
    }
}

export function salvageFractionalInts<T> (parseError : ResponseValidationError, schema : z.ZodType<T> ) : SalvagedValue<T> | undefined {

    // re-parse the response to extract the Zod errors using the incoming response schema.
    //  The SDK itself validated through a json/sse union whose failure collapses to one
    //  pathless issue — the non-union schema yields issues with real field paths
    const zodParse = schema.safeParse(parseError.rawValue)
    // Failed for some other reason
    if (zodParse.success) return undefined
    // Store the list of errors
    const errorList : $ZodIssue[] = zodParse.error.issues

    // Only the known-benign case is salvaged: every issue is an integer usage field
    //  that arrived fractional. Anything else is a genuinely malformed response
    const allFractionalInts = errorList.every(issue =>
        issue.code === "invalid_type" && issue.expected === "int")
    if (!allFractionalInts) return undefined

    // Round exactly the fields the validator flagged — no hardcoded field list, so a
    //  new fractional counter next month gets the same treatment
    const repaired : any = structuredClone(parseError.rawValue)
    for (const issue of errorList) {
        let node : any = repaired
        for (const key of issue.path.slice(0, -1)) node = node[key]
        const leaf = issue.path[issue.path.length - 1]
        if (typeof node[leaf] === "number") node[leaf] = Math.round(node[leaf])
    }

    // The schema stays the final authority: if the repair missed, surface the ORIGINAL
    //  error rather than handing unvalidated data downstream
    const reparse = schema.safeParse(repaired)
    if (reparse.success) {
        return {
            data : reparse.data,
            salvageMessage : `WARNING : the provider returned fractional usage token counts \
(${errorList.map(issue => issue.path.map(key => String(key)).join(".")).join(", ")}) which the SDK's \
response schema rejects; the counts were rounded and the response salvaged. The generation \
SUCCEEDED and was billed — do not retry this call.`
        }
    }

    return undefined
}

export type SalvagedValue<T> = {
    data : T
    salvageMessage : string
}

