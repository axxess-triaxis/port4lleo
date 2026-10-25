import { main } from "./cli";
import { serveMcp } from "./mcp";

/** Keep in step with claude-plugin/.claude-plugin/plugin.json. */
const VERSION = "0.3.0";

if (process.argv[2] === "mcp") serveMcp({ env: process.env, fetchImpl: fetch, version: VERSION });
else void main();
