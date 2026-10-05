import type { OpenClawConfig } from "../../../config/types.js";
import { listSpeechProviders } from "../../../tts/provider-registry.js";
import { getResolvedSpeechProviderConfig, resolveTtsConfig } from "../../../tts/tts.js";
import { configuredOrFalse } from "../session-config.js";

/**
 * The part of buildTalkTtsConfig's result this section reads. Narrower than the
 * caller's union so the catalog does not depend on talk.speak's error reasons.
 */
export type TalkSpeechSetup = { cfg: OpenClawConfig } | { error: string };

export type TalkCatalogSpeechParams = {
  config: OpenClawConfig;
  activeSpeechProvider: string | undefined;
  speechAvailable: boolean;
  buildTtsSetup: (config: OpenClawConfig) => TalkSpeechSetup;
};

/** Builds talk.catalog's `speech` section: stt-tts readiness plus provider entries. */
export function buildTalkCatalogSpeechSection({
  config,
  activeSpeechProvider,
  speechAvailable,
  buildTtsSetup,
}: TalkCatalogSpeechParams) {
  // Clients key stt-tts availability off speech readiness the same way they key
  // dictation off transcription.ready: a usable speech provider means Talk can
  // run in stt-tts mode even when no realtime voice provider is configured
  // (#165363).
  const ready =
    Boolean(activeSpeechProvider) &&
    speechAvailable &&
    configuredOrFalse(() => {
      const setup = buildTtsSetup(config);
      return !("error" in setup);
    });

  return {
    ready,
    ...(activeSpeechProvider ? { activeProvider: activeSpeechProvider } : {}),
    providers: listSpeechProviders(config).map((provider) => {
      const entry: Record<string, unknown> = {
        id: provider.id,
        label: provider.label,
        configured:
          speechAvailable &&
          configuredOrFalse(() => {
            const setup = provider.id === activeSpeechProvider ? buildTtsSetup(config) : undefined;
            const speechConfig = setup && !("error" in setup) ? setup.cfg : config;
            const effectiveTts = resolveTtsConfig(speechConfig);
            return provider.isConfigured({
              cfg: speechConfig,
              providerConfig: getResolvedSpeechProviderConfig(
                effectiveTts,
                provider.id,
                speechConfig,
              ),
              timeoutMs: effectiveTts.timeoutMs,
            });
          }),
        modes: ["stt-tts"],
        // stt-tts sessions run through the managed-room transport; the
        // session-create path rejects every other transport for this mode
        // (#165363).
        transports: ["managed-room"],
        brains: ["agent-consult"],
      };
      if (provider.models) {
        entry.models = [...provider.models];
      }
      if (provider.aliases?.length) {
        entry.aliases = [...provider.aliases];
      }
      if (provider.voices) {
        entry.voices = [...provider.voices];
      }
      return entry;
    }),
  };
}
