export interface SceneHandle {
    destroy(): void;
    pause?(): void;
    resume?(): void;
}
export interface SceneContext {
    readonly el: Element;
    readonly reducedMotion: boolean;
}
export type SceneFactory = (ctx: SceneContext) => SceneHandle;
export interface SceneOptions {
    readonly reducedMotion?: boolean;
    /** pause while off screen (default true) */
    readonly observe?: boolean;
}
export interface MountedScene {
    readonly el: Element;
    readonly running: boolean;
    readonly destroyed: boolean;
    /** hold the scene paused whatever the tab and viewport do */
    pause(): void;
    /** release a hold; the scene runs again if the tab is visible and it is on screen */
    resume(): void;
    destroy(): void;
}
export declare function mountScene(el: Element, factory: SceneFactory, opts?: SceneOptions): MountedScene;
/** How many scenes are mounted (for tests and the debug console). */
export declare const sceneCount: () => number;
