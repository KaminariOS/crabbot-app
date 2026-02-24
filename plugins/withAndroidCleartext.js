const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
  createRunOncePlugin,
} = require("@expo/config-plugins");

function withAndroidCleartext(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults?.manifest?.application?.[0];
    if (!app) {
      return mod;
    }

    app.$ = app.$ || {};
    app.$["android:usesCleartextTraffic"] = "true";
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return mod;
  });

  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      const xmlDir = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/main/res/xml"
      );
      const xmlPath = path.join(xmlDir, "network_security_config.xml");
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n  <base-config cleartextTrafficPermitted="true" />\n</network-security-config>\n`;

      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(xmlPath, xmlContent);
      return mod;
    },
  ]);

  return config;
}

module.exports = createRunOncePlugin(
  withAndroidCleartext,
  "with-android-cleartext",
  "1.0.0"
);
