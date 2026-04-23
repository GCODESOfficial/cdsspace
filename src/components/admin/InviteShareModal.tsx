"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  X,
  Link2,
  Share2,
  Facebook,
  Linkedin,
  MessageCircle,
  User,
  AtSign,
  KeyRound,
} from "lucide-react";

export interface InviteSharePayload {
  full_name: string;
  email: string;
  username: string;
  password: string | null;
  invite_token: string;
  origin: string;
}

/**
 * Show immediately after a team member is created. Presents the invite
 * link + configured credentials and one-click share to WhatsApp /
 * LinkedIn / Facebook (all use the platform's standard sharer URL —
 * no SDK required).
 */
export function InviteShareModal({
  open,
  onClose,
  payload,
}: {
  open: boolean;
  onClose: () => void;
  payload: InviteSharePayload | null;
}) {
  if (!open || !payload) return null;

  const inviteUrl = `${payload.origin}/team/invite/${payload.invite_token}`;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="relative p-6 text-white overflow-hidden"
          style={{
            backgroundImage:
              "linear-gradient(146.28deg, #0035C1 8.83%, #0575FF 86.3%)",
          }}
        >
          <div className="absolute -top-20 -right-20 w-60 h-60 bg-white/15 rounded-full blur-3xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center mb-3">
                <Check className="w-5 h-5" />
              </div>
              <h2 className="text-[20px] font-bold leading-tight">
                {payload.full_name} is ready to go
              </h2>
              <p className="text-white/80 text-[13px] mt-1">
                Share their credentials + invite link below.
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Credentials */}
        <div className="p-6 space-y-3">
          <CredentialRow icon={User} label="Name" value={payload.full_name} />
          <CredentialRow icon={AtSign} label="Username" value={payload.username} copyable />
          {payload.password && (
            <CredentialRow icon={KeyRound} label="Password" value={payload.password} copyable mono />
          )}
          <CredentialRow icon={Link2} label="Invite link" value={inviteUrl} copyable mono dense />
        </div>

        {/* Share buttons */}
        <div className="px-6 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">
            Share via
          </p>
          <div className="grid grid-cols-4 gap-2">
            <ShareButton
              label="WhatsApp"
              color="bg-[#25D366] hover:bg-[#20bf5a] text-white"
              icon={MessageCircle}
              href={whatsappUrl(payload, inviteUrl)}
            />
            <ShareButton
              label="LinkedIn"
              color="bg-[#0A66C2] hover:bg-[#084d93] text-white"
              icon={Linkedin}
              href={linkedinUrl(inviteUrl)}
            />
            <ShareButton
              label="Facebook"
              color="bg-[#1877F2] hover:bg-[#145ec1] text-white"
              icon={Facebook}
              href={facebookUrl(inviteUrl)}
            />
            <ShareButton
              label="More"
              color="bg-gray-100 hover:bg-gray-200 text-[#0D1B39]"
              icon={Share2}
              onClick={() => {
                if (navigator.share) {
                  navigator
                    .share({
                      title: `Welcome to CDS Space, ${payload.full_name}`,
                      text: composeShareText(payload, inviteUrl),
                    })
                    .catch(() => {});
                }
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 leading-relaxed">
          The invite link takes the teammate to a setup form to fill their details and set a password. 
          It becomes single-use the moment they complete the setup.
        </div>
      </div>
    </div>
  );
}

function CredentialRow({
  icon: Icon,
  label,
  value,
  copyable,
  mono,
  dense,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  copyable?: boolean;
  mono?: boolean;
  dense?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5">
      <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 text-[#0A4FE8] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{label}</p>
        <p
          className={`text-[${dense ? "11" : "13"}px] font-semibold text-[#0D1B39] ${
            mono ? "font-mono" : ""
          } truncate`}
        >
          {value}
        </p>
      </div>
      {copyable && (
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="p-2 rounded-lg hover:bg-white text-gray-400 hover:text-[#0A4FE8] transition"
          title="Copy"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}

function ShareButton({
  label,
  color,
  icon: Icon,
  href,
  onClick,
}: {
  label: string;
  color: string;
  icon: React.ElementType;
  href?: string;
  onClick?: () => void;
}) {
  const cls = `flex flex-col items-center justify-center gap-1 py-3 rounded-xl text-[11px] font-semibold transition ${color}`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        <Icon className="w-4 h-4" />
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function composeShareText(p: InviteSharePayload, url: string) {
  const lines = [
    `Welcome to CDS Space, ${p.full_name}!`,
    `Your sign-in details:`,
    `• Username: ${p.username}`,
  ];
  if (p.password) lines.push(`• Password: ${p.password}`);
  lines.push(`Click here to sign in — we've pre-filled everything for you: ${url}`);
  return lines.join("\n");
}

function whatsappUrl(p: InviteSharePayload, inviteUrl: string) {
  return `https://wa.me/?text=${encodeURIComponent(composeShareText(p, inviteUrl))}`;
}
function linkedinUrl(url: string) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}
function facebookUrl(url: string) {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}
