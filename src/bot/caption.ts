import { BOT_USERNAME } from "../config.js";

const captionTrail = `\n\n\n${BOT_USERNAME}`;

export function buildCaption(caption: string): string {
  let trimmedCaption = caption || "";
  while (trimmedCaption.length + captionTrail.length > 1024) {
    trimmedCaption = trimmedCaption.slice(0, -1);
  }
  return `${trimmedCaption}${captionTrail}`;
}
