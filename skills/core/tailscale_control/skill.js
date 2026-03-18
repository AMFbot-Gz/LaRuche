/**
 * Skill : tailscale_control
 * Contrôle Tailscale (VPN mesh) via son CLI natif
 *
 * Exemples Telegram :
 *   "statut Tailscale"
 *   "liste les machines Tailscale"
 *   "mon IP Tailscale"
 *   "ping la machine bureau-mac via Tailscale"
 */

import { execSync } from "child_process";

const TS_BIN = "/usr/local/bin/tailscale";

const ALLOWED_ACTIONS = ["status", "ip", "ping", "netcheck", "version"];

export async function run({
  action = "status",
  peer = "",
  timeout = 10000,
} = {}) {
  if (!ALLOWED_ACTIONS.includes(action)) {
    return {
      success: false,
      error: `Action non autorisée: "${action}". Actions valides: ${ALLOWED_ACTIONS.join(", ")}`,
    };
  }

  try {
    switch (action) {
      case "status": {
        const out = execSync(`${TS_BIN} status`, { encoding: "utf-8", timeout });
        // Parser les pairs connectés
        const lines = out.trim().split("\n");
        const peers = lines
          .filter((l) => l.match(/^\d+\.\d+/))
          .map((l) => {
            const parts = l.trim().split(/\s+/);
            return {
              ip: parts[0],
              hostname: parts[1],
              status: parts.slice(2).join(" "),
            };
          });
        return { success: true, action, peers, raw: out.trim().slice(0, 1000) };
      }

      case "ip": {
        const out = execSync(`${TS_BIN} ip`, { encoding: "utf-8", timeout });
        const ips = out.trim().split("\n").map((ip) => ip.trim());
        return { success: true, action, ips, primary: ips[0] };
      }

      case "ping": {
        if (!peer) return { success: false, error: "peer (hostname ou IP) requis pour ping" };
        const out = execSync(`${TS_BIN} ping --c 3 ${peer}`, {
          encoding: "utf-8",
          timeout: 15000,
        });
        return { success: true, action, peer, result: out.trim() };
      }

      case "netcheck": {
        const out = execSync(`${TS_BIN} netcheck`, { encoding: "utf-8", timeout: 20000 });
        return { success: true, action, result: out.trim().slice(0, 1000) };
      }

      case "version": {
        const out = execSync(`${TS_BIN} version`, { encoding: "utf-8", timeout });
        return { success: true, action, version: out.trim() };
      }

      default:
        return { success: false, error: `Action inconnue: ${action}` };
    }
  } catch (e) {
    return { success: false, action, error: e.stderr?.slice(0, 500) || e.message };
  }
}
