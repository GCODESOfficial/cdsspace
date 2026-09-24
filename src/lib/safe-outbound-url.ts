import "server-only";

import { lookup } from "node:dns/promises";
import net from "node:net";

export class UnsafeOutboundUrlError extends Error {
  constructor(message = "That address is not available for server-side fetching.") {
    super(message);
    this.name = "UnsafeOutboundUrlError";
  }
}

function privateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) || a >= 224;
}

function privateIpv6(address: string) {
  const value = address.toLowerCase().split("%")[0];
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff")) return true;
  if (value.startsWith("2001:db8:")) return true;
  const mapped = /(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  return mapped ? privateIpv4(mapped[1]) : false;
}

export function isPrivateNetworkAddress(address: string) {
  const version = net.isIP(address);
  return version === 4 ? privateIpv4(address) : version === 6 ? privateIpv6(address) : true;
}

/** Resolve and reject every non-public destination before any server fetch. */
export async function assertPublicHttpUrl(candidate: string | URL) {
  let url: URL;
  try {
    url = candidate instanceof URL ? new URL(candidate.toString()) : new URL(candidate);
  } catch {
    throw new UnsafeOutboundUrlError("The URL is invalid.");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new UnsafeOutboundUrlError();
  }
  if ((url.protocol === "http:" && url.port && url.port !== "80") || (url.protocol === "https:" && url.port && url.port !== "443")) {
    throw new UnsafeOutboundUrlError("Only standard web ports are allowed.");
  }
  const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new UnsafeOutboundUrlError();
  }
  if (net.isIP(hostname) && isPrivateNetworkAddress(hostname)) throw new UnsafeOutboundUrlError();

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeOutboundUrlError("The destination could not be resolved.");
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new UnsafeOutboundUrlError();
  }
  return url;
}
