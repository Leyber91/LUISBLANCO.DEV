import type { Json } from './types.js';
import type { Store } from './store.js';
export declare const RECORDING_KEY = "recording";
export interface RecordingState {
    readonly on: boolean;
    /** when the visitor last switched it; null while it has never been switched */
    readonly t: number | null;
}
export declare const RECORDING_DEFAULT: RecordingState;
export declare function readRecording(raw: Json | undefined): RecordingState;
export declare function loadRecording(store: Store): Promise<RecordingState>;
export declare function saveRecording(store: Store, on: boolean, t: number): Promise<RecordingState>;
