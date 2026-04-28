"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.profilesCommand = profilesCommand;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const profile_store_1 = require("../config/profile-store");
const path_resolver_1 = require("../config/path-resolver");
const profile_schema_1 = require("../config/profile-schema");
function isLoginReady(profile) {
    return Boolean(profile.os_id && profile.soul_id);
}
function toProfileSummary(profile, filePath) {
    return {
        profile_id: String(profile.profile_id),
        os_id: profile.os_id ?? null,
        os_name: profile.os_name ?? null,
        soul_id: profile.soul_id ?? null,
        credential_state: profile.credential_state,
        authorization_state: profile.authorization_state,
        last_login_at: profile.last_login_at ?? null,
        login_ready: isLoginReady(profile),
        profile_path: filePath
    };
}
async function profilesCommand(input = {}) {
    const profilesDir = input.profilesDir ?? (0, path_resolver_1.getLinzProfilesDir)();
    let entries;
    try {
        entries = await (0, promises_1.readdir)(profilesDir, { withFileTypes: true });
    }
    catch {
        return {
            profiles: [],
            count: 0,
            profiles_dir: profilesDir
        };
    }
    const profiles = [];
    for (const entry of entries) {
        if (!entry.isFile() || node_path_1.default.extname(entry.name) !== ".json") {
            continue;
        }
        const filePath = node_path_1.default.join(profilesDir, entry.name);
        try {
            const profile = (0, profile_schema_1.validateProfile)(JSON.parse(await (0, promises_1.readFile)(filePath, "utf8")));
            const profilePath = profile.os_id
                ? await (0, profile_store_1.saveProfileUsingOsIdFileName)(new profile_store_1.FileProfileStore(filePath, profile.profile_id), profile)
                : filePath;
            const summary = toProfileSummary(profile, profilePath);
            if (input.includeAll || summary.login_ready) {
                profiles.push(summary);
            }
        }
        catch {
            continue;
        }
    }
    profiles.sort((left, right) => {
        const leftName = String(left.os_id ?? left.profile_id);
        const rightName = String(right.os_id ?? right.profile_id);
        return leftName.localeCompare(rightName);
    });
    return {
        profiles,
        count: profiles.length,
        profiles_dir: profilesDir
    };
}
