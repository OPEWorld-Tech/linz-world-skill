"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeSoulTailBlock = writeSoulTailBlock;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const START_MARKER = "<!-- LINZ-WORLD:START -->";
const END_MARKER = "<!-- LINZ-WORLD:END -->";
async function writeSoulTailBlock(filePath, blockContent) {
    await (0, promises_1.mkdir)(node_path_1.default.dirname(filePath), { recursive: true });
    let current = "";
    try {
        current = await (0, promises_1.readFile)(filePath, "utf8");
    }
    catch {
        current = "";
    }
    const normalizedBlock = `${START_MARKER}\n${blockContent.trim()}\n${END_MARKER}`;
    const pattern = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`, "m");
    const next = pattern.test(current)
        ? current.replace(pattern, normalizedBlock)
        : `${current.trimEnd()}\n\n${normalizedBlock}\n`;
    await (0, promises_1.writeFile)(filePath, next, "utf8");
}
