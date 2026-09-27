/**
 * Shared types for the `api` and front ends. One concept has one definition, so screen and API field or plan names cannot silently diverge until production. This package imports no database, HTTP, or React implementation.
 */
export * from './session.js';
export * from './eventos.js';
export * from './management-flow.js';
export * from './management-team.js';
export * from './management-registrations.js';
export * from './desk.js';
export * from './closure.js';
export * from './satisfaction-survey.js';
export * from './flow-functions.js';
