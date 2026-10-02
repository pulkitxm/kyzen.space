import { isUtf8 } from "node:buffer";
import { trackedContent, trackedFiles } from "./tracked-files.mjs";

const dash = Buffer.from("\u2014");
let violations = 0;
for (const file of trackedFiles()) {
  const content = trackedContent(file);
  if (content.includes(0) || !isUtf8(content) || !content.includes(dash))
    continue;
  violations++;
  console.error(`${JSON.stringify(file.path)}: forbidden U+2014`);
}
if (violations) process.exit(1);
console.log("No em dashes in tracked files.");
