/**
 * Error codes for Still With You API
 * Based on backend-contract-v0.9.md
 */

export const ErrorCode = {
  // 400 Bad Request
  STORY_REQUIRED: 'STORY_REQUIRED',
  CONFIRM_TEXT_MISMATCH: 'CONFIRM_TEXT_MISMATCH',
  MIXED_ORIGIN_EVENTS: 'MIXED_ORIGIN_EVENTS',
  FILE_TYPE_NOT_ALLOWED: 'FILE_TYPE_NOT_ALLOWED',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  TOO_MANY_PHOTOS: 'TOO_MANY_PHOTOS',
  INVALID_INPUT: 'INVALID_INPUT',
  ANSWER_REQUIRED: 'ANSWER_REQUIRED',
  NAME_REQUIRED: 'NAME_REQUIRED',
  INVALID_BIRTH_DATE: 'INVALID_BIRTH_DATE',
  INVALID_DEATH_DATE: 'INVALID_DEATH_DATE',
  INVALID_RELATIONSHIP: 'INVALID_RELATIONSHIP',
  UPLOAD_MISMATCH: 'UPLOAD_MISMATCH',
  MEDIA_NOT_READY: 'MEDIA_NOT_READY',

  // 422 Unprocessable
  TOO_MANY_FOCUS: 'TOO_MANY_FOCUS',

  // 401 Unauthorized
  UNAUTHENTICATED: 'UNAUTHENTICATED',

  // 403 Forbidden
  FORBIDDEN: 'FORBIDDEN',
  ADMIN_REQUIRED: 'ADMIN_REQUIRED',
  NOT_YET_DELETABLE: 'NOT_YET_DELETABLE',

  // 409 Conflict
  LAST_ADMIN: 'LAST_ADMIN',
  ALREADY_ANSWERED: 'ALREADY_ANSWERED',
  RELATIONSHIP_EXISTS: 'RELATIONSHIP_EXISTS',
  PERSON_LINKED: 'PERSON_LINKED',
  PERSON_ALREADY_LINKED: 'PERSON_ALREADY_LINKED',

  // 410 Gone
  INVITE_INVALID: 'INVITE_INVALID',

  // 404 Not Found
  NOT_FOUND: 'NOT_FOUND',

  EVENT_NOT_ACTIVE: 'EVENT_NOT_ACTIVE',
  EVENT_NOT_ARCHIVED: 'EVENT_NOT_ARCHIVED',
  EVENT_EDIT_CONFLICT: 'EVENT_EDIT_CONFLICT',
  SOURCE_ARCHIVED: 'SOURCE_ARCHIVED',
  SOURCE_NOT_DELETED: 'SOURCE_NOT_DELETED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',

  // 413 Payload Too Large
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',

  // 429 Too Many Requests
  RATE_LIMITED: 'RATE_LIMITED',

  // 500 Internal Server Error
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    field?: string;
    details?: Record<string, unknown>;
  };
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public field?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.field && { field: this.field }),
        ...(this.details && { details: this.details }),
      },
    };
  }
}

export const errorMessages: Record<ErrorCode, string> = {
  STORY_REQUIRED: 'Story text is required and cannot be empty',
  CONFIRM_TEXT_MISMATCH: 'Confirmation text does not match',
  MIXED_ORIGIN_EVENTS: 'Cannot create event from contributions with different origin events',
  FILE_TYPE_NOT_ALLOWED: 'File type is not allowed',
  UNSUPPORTED_TYPE: 'File type is not allowed',
  TOO_MANY_PHOTOS: 'Too many photos attached',
  TOO_MANY_FOCUS: 'Too many focus people',
  INVALID_INPUT: 'Invalid input provided',
  ANSWER_REQUIRED: 'Answer text is required',
  NAME_REQUIRED: 'Display name is required',
  INVALID_BIRTH_DATE: 'Birth date cannot be in the future',
  INVALID_DEATH_DATE: 'Death date is invalid',
  INVALID_RELATIONSHIP: 'This relationship is not allowed',
  UPLOAD_MISMATCH: 'Uploaded object does not match the declared type or size',
  MEDIA_NOT_READY: 'One or more photos are not ready to attach',
  UNAUTHENTICATED: 'Authentication required',
  FORBIDDEN: 'You do not have permission to perform this action',
  ADMIN_REQUIRED: 'This action requires admin role',
  NOT_YET_DELETABLE: 'Event is not yet permanently deletable',
  LAST_ADMIN: 'Cannot remove or demote the last admin when other members exist',
  ALREADY_ANSWERED: 'You have already answered this question for this person',
  RELATIONSHIP_EXISTS: 'This relationship already exists',
  PERSON_LINKED: 'A linked person cannot be deleted',
  PERSON_ALREADY_LINKED: 'This person is already linked to an account',
  INVITE_INVALID: 'This invite is no longer valid',
  NOT_FOUND: 'Resource not found',
  EVENT_NOT_ACTIVE: 'Event must be active for this operation',
  EVENT_NOT_ARCHIVED: 'Event must be archived before deletion',
  EVENT_EDIT_CONFLICT: 'Event was modified by another edit',
  SOURCE_ARCHIVED: 'Cannot restore contribution when origin event is archived',
  SOURCE_NOT_DELETED: 'Cannot create event from contributions whose origin event is not deleted',
  VERSION_CONFLICT: 'Resource was modified by another user',
  FILE_TOO_LARGE: 'File size exceeds the maximum allowed',
  RATE_LIMITED: 'Too many requests, please try again later',
  INTERNAL_ERROR: 'An internal error occurred',
};
