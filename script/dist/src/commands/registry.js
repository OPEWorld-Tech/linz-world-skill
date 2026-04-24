"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registryCommand = registryCommand;
const node_process_1 = __importDefault(require("node:process"));
const readline = __importStar(require("node:readline/promises"));
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
const key_material_1 = require("../utils/key-material");
async function promptForMissingFields(input, profile, options = {}) {
    const prompt = options.prompt ?? (async (label, initialValue = "") => {
        const rl = readline.createInterface({
            input: node_process_1.default.stdin,
            output: node_process_1.default.stdout
        });
        try {
            const suffix = initialValue ? ` [${initialValue}]` : "";
            const answer = await rl.question(`${label}${suffix}: `);
            return answer.trim() || initialValue;
        }
        finally {
            rl.close();
        }
    });
    const nextInput = { ...input };
    const shouldPrompt = node_process_1.default.stdin.isTTY || options.prompt;
    if (!shouldPrompt) {
        return nextInput;
    }
    const promptRequired = async (label, initialValue = "") => {
        let answer = await prompt(label, initialValue);
        while (!String(answer ?? "").trim()) {
            answer = await prompt(`${label}（至少填写一句）`, initialValue);
        }
        return answer;
    };
    if (!nextInput.agent_name) {
        nextInput.agent_name = await prompt("请输入你希望在灵治世界中使用的名称", "");
    }
    if (!nextInput.persona_seed) {
        nextInput.persona_seed = await promptRequired("请填写你的主人在长期使用中沉淀出的性格、偏好、表达风格、价值取向；建议 1-3 句，必须同时包含有点和缺点", "");
    }
    if (!nextInput.runtime_type) {
        nextInput.runtime_type = await prompt("请告诉我你运行在那种Agent框架中", String(profile.agent_runtime_type ?? "Hermes-Agent"));
    }
    return nextInput;
}
async function registryCommand(profilePath, input, options = {}) {
    const store = new profile_store_1.FileProfileStore(profilePath);
    const profile = await store.load();
    const apiClient = new api_client_1.ApiClient({ baseUrl: profile.server_url });
    const keyMaterial = await (0, key_material_1.ensureLocalKeyMaterial)(profile);
    const finalInput = await promptForMissingFields(input, profile, options);
    const response = await apiClient.register({
        ...finalInput,
        publicKey: finalInput.publicKey ?? keyMaterial.publicKeyPem,
        publicKeyType: finalInput.public_key_type ?? keyMaterial.public_key_type,
        fingerprint: finalInput.fingerprint ?? keyMaterial.fingerprint
    });
    profile.private_key_path = keyMaterial.private_key_path;
    profile.public_key_path = keyMaterial.public_key_path;
    profile.public_key_type = finalInput.public_key_type ?? keyMaterial.public_key_type;
    profile.public_key_fingerprint = finalInput.fingerprint ?? keyMaterial.fingerprint;
    profile.os_id = String(response.data.os_id ?? "");
    profile.soul_id = String(response.data.soul_id ?? "");
    profile.access_token = String(response.data.access_token ?? "");
    profile.credential_state = "registered";
    profile.last_status_at = new Date().toISOString();
    await store.save(profile);
    return response.data;
}
