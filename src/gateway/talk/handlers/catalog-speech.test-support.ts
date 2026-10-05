/** talk.catalog's `speech` section for a configured ElevenLabs provider. */
export const EXPECTED_ELEVENLABS_SPEECH_SECTION = {
  ready: true,
  activeProvider: "elevenlabs",
  providers: [
    {
      id: "elevenlabs",
      label: "ElevenLabs",
      aliases: ["11labs"],
      configured: true,
      modes: ["stt-tts"],
      transports: ["managed-room"],
      brains: ["agent-consult"],
      models: ["eleven_flash_v2_5"],
      voices: ["voice-1"],
    },
  ],
};
