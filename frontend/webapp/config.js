(function () {
  const host = (window.location.hostname || "").toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  const defaultBackendBaseUrl = isLocalHost ? "http://127.0.0.1:8001" : "https://api.resumepro2.me";

  window.RESUMEPRO_CONFIG = window.RESUMEPRO_CONFIG || {
  googleClientId: "109234105240-edbepiq6deenufb2k33r90k6teqs1ie5.apps.googleusercontent.com",
  googleAllowedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8001",
    "http://127.0.0.1:8001",
    "http://localhost:5501",
    "http://127.0.0.1:5501",
    "https://resumepro2.me",
    "https://www.resumepro2.me"
  ],
  googlePreferredOrigin: isLocalHost ? "http://127.0.0.1:3000" : "https://resumepro2.me",
  backendBaseUrl: defaultBackendBaseUrl
  };
})();