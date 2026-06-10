import { Config } from "@remotion/cli/config";

Config.setEntryPoint("src/index.ts");
Config.setPublicDir("../apps/web/public");
Config.setOverwriteOutput(true);
