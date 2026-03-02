export const config = {
  sttEndpoint: process.env.STT_ENDPOINT || "http://localhost:8090/inference",
  silenceMs: Number(process.env.SILENCE_MS || 3000),
};
