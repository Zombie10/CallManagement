import { register } from "node:module";

await register("./admin_ts_loader.mjs", import.meta.url);
