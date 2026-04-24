"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileProfileStore = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const profile_schema_1 = require("./profile-schema");
class FileProfileStore {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    async load() {
        try {
            const content = await (0, promises_1.readFile)(this.filePath, "utf8");
            return (0, profile_schema_1.validateProfile)(JSON.parse(content));
        }
        catch {
            return (0, profile_schema_1.createDefaultProfile)();
        }
    }
    async save(profile) {
        await (0, promises_1.mkdir)(node_path_1.default.dirname(this.filePath), { recursive: true });
        await (0, promises_1.writeFile)(this.filePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    }
    path() {
        return this.filePath;
    }
}
exports.FileProfileStore = FileProfileStore;
