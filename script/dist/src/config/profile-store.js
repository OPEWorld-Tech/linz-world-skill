"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileProfileStore = void 0;
exports.getOsIdProfilePath = getOsIdProfilePath;
exports.saveProfileUsingOsIdFileName = saveProfileUsingOsIdFileName;
exports.resolveExistingProfilePath = resolveExistingProfilePath;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const profile_schema_1 = require("./profile-schema");
const path_resolver_1 = require("./path-resolver");
function inferProfileIdFromPath(filePath) {
    const baseName = node_path_1.default.basename(filePath, node_path_1.default.extname(filePath));
    if (!baseName || baseName === "default" || baseName === "linz.config") {
        return (0, path_resolver_1.getDefaultProfileId)();
    }
    try {
        return (0, path_resolver_1.resolveProfileId)(baseName);
    }
    catch {
        return (0, path_resolver_1.getDefaultProfileId)();
    }
}
function getManagedProfilesDir(filePath) {
    const profileDir = node_path_1.default.dirname(filePath);
    if (node_path_1.default.basename(profileDir) === "profiles") {
        return profileDir;
    }
    return null;
}
function isSamePath(left, right) {
    return node_path_1.default.resolve(left) === node_path_1.default.resolve(right);
}
function shouldRemoveSourceProfile(sourcePath) {
    return node_path_1.default.basename(node_path_1.default.dirname(sourcePath)) === "profiles";
}
function resolveManagedProfileId(profile) {
    if (!profile.os_id) {
        return profile.profile_id;
    }
    try {
        return (0, path_resolver_1.resolveProfileId)(String(profile.os_id));
    }
    catch {
        return profile.profile_id;
    }
}
function getOsIdProfilePath(profilePath, osId) {
    const profilesDir = getManagedProfilesDir(profilePath);
    if (!osId || !profilesDir) {
        return profilePath;
    }
    return node_path_1.default.join(profilesDir, `${(0, path_resolver_1.resolveOsIdPathSegment)(String(osId))}.json`);
}
async function assertProfilePathAvailable(sourcePath, targetPath, osId) {
    if (isSamePath(sourcePath, targetPath)) {
        return;
    }
    try {
        const existing = JSON.parse(await (0, promises_1.readFile)(targetPath, "utf8"));
        const existingOsId = String(existing?.os_id ?? "");
        if (existingOsId && existingOsId !== String(osId)) {
            throw new Error(`目标 profile 文件已存在且属于其他 os_id: ${targetPath}`);
        }
    }
    catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            return;
        }
        if (error instanceof SyntaxError) {
            throw new Error(`目标 profile 文件已存在但不是有效 JSON: ${targetPath}`);
        }
        throw error;
    }
}
async function saveProfileUsingOsIdFileName(store, profile) {
    const sourcePath = store.path();
    const targetPath = getOsIdProfilePath(sourcePath, profile.os_id);
    profile.profile_id = resolveManagedProfileId(profile);
    await assertProfilePathAvailable(sourcePath, targetPath, profile.os_id);
    if (isSamePath(sourcePath, targetPath)) {
        await store.save(profile);
        return targetPath;
    }
    const targetStore = new FileProfileStore(targetPath, profile.profile_id);
    await targetStore.save(profile);
    if (shouldRemoveSourceProfile(sourcePath)) {
        await (0, promises_1.unlink)(sourcePath).catch((error) => {
            if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
                throw error;
            }
        });
    }
    else {
        await store.save(profile);
    }
    return targetPath;
}
class FileProfileStore {
    filePath;
    defaultProfileId;
    constructor(filePath, defaultProfileId = inferProfileIdFromPath(filePath)) {
        this.filePath = filePath;
        this.defaultProfileId = (0, path_resolver_1.resolveProfileId)(defaultProfileId);
    }
    async load() {
        try {
            const content = await (0, promises_1.readFile)(this.filePath, "utf8");
            return (0, profile_schema_1.validateProfile)(JSON.parse(content));
        }
        catch {
            return (0, profile_schema_1.createDefaultProfile)({ profile_id: this.defaultProfileId });
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
async function resolveExistingProfilePath(filePath, profileId) {
    try {
        await (0, promises_1.readFile)(filePath, "utf8");
        return filePath;
    }
    catch {
        const profilesDir = getManagedProfilesDir(filePath);
        if (!profilesDir) {
            return filePath;
        }
        let entries;
        try {
            entries = await (0, promises_1.readdir)(profilesDir, { withFileTypes: true });
        }
        catch {
            return filePath;
        }
        const expectedProfileId = (0, path_resolver_1.resolveProfileId)(profileId);
        for (const entry of entries) {
            if (!entry.isFile() || node_path_1.default.extname(entry.name) !== ".json") {
                continue;
            }
            const candidatePath = node_path_1.default.join(profilesDir, entry.name);
            try {
                const profile = (0, profile_schema_1.validateProfile)(JSON.parse(await (0, promises_1.readFile)(candidatePath, "utf8")));
                if ((0, path_resolver_1.resolveProfileId)(String(profile.profile_id)) === expectedProfileId) {
                    return candidatePath;
                }
            }
            catch {
                continue;
            }
        }
        return filePath;
    }
}
