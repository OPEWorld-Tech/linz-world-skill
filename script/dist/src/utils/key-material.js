"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureLocalKeyMaterial = ensureLocalKeyMaterial;
exports.signWithLocalPrivateKey = signWithLocalPrivateKey;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const path_resolver_1 = require("../config/path-resolver");
function buildFingerprint(publicKeyPem) {
    return (0, node_crypto_1.createHash)("sha256").update(publicKeyPem).digest("hex");
}
async function ensureLocalKeyMaterial(profile) {
    const profile_id = (0, path_resolver_1.resolveProfileId)(String(profile.profile_id ?? (0, path_resolver_1.getDefaultProfileId)()));
    const private_key_path = profile.private_key_path ?? (0, path_resolver_1.getDefaultPrivateKeyPath)(profile_id);
    const public_key_path = profile.public_key_path ?? (0, path_resolver_1.getDefaultPublicKeyPath)(profile_id);
    try {
        const [privateKeyPem, publicKeyPem] = await Promise.all([
            (0, promises_1.readFile)(private_key_path, "utf8"),
            (0, promises_1.readFile)(public_key_path, "utf8")
        ]);
        return {
            private_key_path,
            public_key_path,
            privateKeyPem,
            publicKeyPem,
            public_key_type: String(profile.public_key_type ?? "RSA"),
            fingerprint: String(profile.public_key_fingerprint ?? buildFingerprint(publicKeyPem))
        };
    }
    catch {
        const { privateKey, publicKey } = (0, node_crypto_1.generateKeyPairSync)("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" }
        });
        await (0, promises_1.mkdir)(node_path_1.default.dirname(private_key_path), { recursive: true });
        await Promise.all([
            (0, promises_1.writeFile)(private_key_path, privateKey, "utf8"),
            (0, promises_1.writeFile)(public_key_path, publicKey, "utf8")
        ]);
        return {
            private_key_path,
            public_key_path,
            privateKeyPem: privateKey,
            publicKeyPem: publicKey,
            public_key_type: "RSA",
            fingerprint: buildFingerprint(publicKey)
        };
    }
}
async function signWithLocalPrivateKey(private_key_path, payload) {
    const privateKeyPem = await (0, promises_1.readFile)(private_key_path, "utf8");
    const signer = (0, node_crypto_1.createSign)("RSA-SHA256");
    signer.update(payload);
    signer.end();
    return signer.sign(privateKeyPem, "base64");
}
