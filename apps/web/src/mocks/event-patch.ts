import {
  ErrorCode,
  errorMessages,
  eventEditConflictErrorSchema,
  eventResponseSchema,
  type EventEditConflictError,
  type EventResponse,
  type UpdateEvent,
} from '@still-with-you/contracts';

export type MockPatchEventResult =
  | { ok: true; event: EventResponse }
  | { ok: false; status: 409; body: EventEditConflictError };

/** In-memory PATCH /v1/events/{id}: CAS when `version` is sent, last-write-wins when omitted. */
export function mockPatchEvent(event: EventResponse, body: UpdateEvent): MockPatchEventResult {
  if (body.version !== undefined && body.version !== event.version) {
    return {
      ok: false,
      status: 409,
      body: eventEditConflictErrorSchema.parse({
        error: {
          code: ErrorCode.EVENT_EDIT_CONFLICT,
          message: errorMessages[ErrorCode.EVENT_EDIT_CONFLICT],
          details: { current_version: event.version },
        },
      }),
    };
  }

  return {
    ok: true,
    event: eventResponseSchema.parse({
      ...event,
      title: body.title !== undefined ? body.title : event.title,
      description: body.description !== undefined ? body.description : event.description,
      occurred_from: body.occurred_from !== undefined ? body.occurred_from : event.occurred_from,
      occurred_to: body.occurred_to !== undefined ? body.occurred_to : event.occurred_to,
      date_precision: body.date_precision !== undefined ? body.date_precision : event.date_precision,
      location: body.location !== undefined ? body.location : event.location,
      updated_at: new Date().toISOString(),
      version: event.version + 1,
    }),
  };
}
