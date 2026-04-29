"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.demoCommand = demoCommand;
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
async function demoCommand(profilePath, input = {}) {
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const serverUrl = input.serverUrl ?? profile.server_url;
    if (!serverUrl) {
        throw new Error("缺少 Demo 服务地址，请通过 --server-url 指定后端地址");
    }
    const apiClient = new api_client_1.ApiClient({ baseUrl: serverUrl });
    const response = await apiClient.runDemoEventStream();
    return response.data;
}
