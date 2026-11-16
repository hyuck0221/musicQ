import { cp, rm, access } from "node:fs/promises";
const source = new URL("../packages/web/dist/", import.meta.url);
const destination = new URL("../packages/server/web/", import.meta.url);
await access(new URL("index.html", source));
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
console.log("musicQ: web → packages/server/web");
