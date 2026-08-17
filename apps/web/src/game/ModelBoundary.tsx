import { Component, type ReactNode } from "react";

/**
 * Catches a model that will not load, so one missing file cannot take the app.
 *
 * Every generated asset in this project is downloaded to storage and served from
 * there, and storage is not in the repository — it is four hundred megabytes of
 * GLB. So the state a fresh clone starts in is the state where every character,
 * boss and piece of scenery is a 404, and that is also the state a reviewer sees
 * first.
 *
 * The boss already survives it: BossModel asks whether each file exists before
 * loading it and falls back through rig, static mesh, and built geometry. The
 * champion did not. It requested its mesh unconditionally, and useGLTF signals a
 * failed load by throwing during render, which with no boundary anywhere in the
 * tree unmounts everything to a white page.
 *
 * A HEAD check per call site would have fixed that one path and left sixteen
 * others, and it only covers absence. A file can also be truncated from an
 * interrupted download, or be a signed URL that has expired, or be valid GLB
 * that the parser rejects. All of those throw in the same place, and all of them
 * should cost their own subtree and nothing more.
 *
 * Deliberately a boundary rather than a check, then. Suspense handles the wait,
 * this handles the failure, and the two are different questions.
 */
export class ModelBoundary extends Component<
  {
    children: ReactNode;
    /** Drawn in its place. Something built is better than a hole. */
    fallback?: ReactNode;
    /** What failed, for the console. Silence here is how this bug survived. */
    label?: string;
  },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    /*
     * Warned rather than swallowed. A fallback that appears silently is
     * indistinguishable from the real thing being ugly, and someone running this
     * for the first time should be told that assets are missing rather than left
     * to conclude the game looks like that.
     */
    console.warn(
      `[RelicForge] ${this.props.label ?? "A model"} could not be loaded, drawing the built stand-in instead.`,
      error,
    );
  }

  override render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
