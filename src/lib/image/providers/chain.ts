import "server-only";
import {
  ImageProviderError,
  type ImageEditRequest,
  type ImageGenerationRequest,
  type ImageProvider,
} from "../types";

/**
 * Tries several engines in order and returns the first picture that works.
 *
 * If one configured service fails, another real service can get a turn.
 * Do not silently substitute a fake offline image for a failed AI request.
 */
export function createFallbackImageProvider(providers: ImageProvider[]): ImageProvider {
  if (providers.length === 0) {
    throw new ImageProviderError("No image engine is configured", "unavailable");
  }

  const id = providers.map((provider) => provider.id).join(">");
  const label = providers.map((provider) => provider.label).join(" → ");

  const attempt = async <T>(
    step: string,
    candidates: ImageProvider[],
    run: (provider: ImageProvider) => Promise<T>,
  ): Promise<T> => {
    if (candidates.length === 0) {
      throw new ImageProviderError("No configured engine can do that", "unsupported");
    }
    let lastError: ImageProviderError | null = null;
    for (const provider of candidates) {
      try {
        return await run(provider);
      } catch (error) {
        // A cancelled request must never fall through to another engine.
        if (error instanceof ImageProviderError && error.code === "aborted") throw error;
        const reason =
          error instanceof ImageProviderError ? error : new ImageProviderError(String(error), "unavailable");
        // Log the failure type only — never the prompt or the key.
        console.warn(`[images] ${provider.id} could not ${step} (${reason.code})`);
        lastError = reason;
      }
    }
    throw lastError ?? new ImageProviderError("No image engine could do that", "unavailable");
  };

  return {
    id,
    label,
    supportsEdit: providers.some((provider) => provider.supportsEdit && typeof provider.edit === "function"),

    generate: (request: ImageGenerationRequest) =>
      attempt("generate", providers, (provider) => provider.generate(request)),

    edit: (request: ImageEditRequest) =>
      attempt(
        "edit",
        providers.filter((provider) => typeof provider.edit === "function" && provider.supportsEdit),
        (provider) => provider.edit!(request),
      ),
  };
}
