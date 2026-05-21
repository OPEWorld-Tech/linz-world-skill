"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadCommand = uploadCommand;
const node_path_1 = __importDefault(require("node:path"));
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
async function uploadCommand(profilePath, input) {
    const filePath = String(input.filePath ?? "").trim();
    if (!filePath) {
        throw new Error("upload 需要提供文件路径，可使用: linz upload <file> 或 linz upload --file <file>");
    }
    const serverUrl = input.serverUrl
        ?? (await new profile_store_1.FileProfileStore(profilePath).load()).server_url;
    const apiClient = new api_client_1.ApiClient({ baseUrl: serverUrl });
    const response = await apiClient.uploadArtifact(node_path_1.default.resolve(filePath));
    return response.data;
}
