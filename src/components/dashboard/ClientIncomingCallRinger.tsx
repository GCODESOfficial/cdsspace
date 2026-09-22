"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneIncoming, Video, Volume2 } from "lucide-react";

type IncomingCall={id:string;title:string;audioOnly:boolean;callerName:string;link:string};

export function ClientIncomingCallRinger(){
  const pathname=usePathname();
  const [calls,setCalls]=useState<IncomingCall[]>([]);
  const [soundBlocked,setSoundBlocked]=useState(false);
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const loadingRef=useRef(false);
  const active=calls[0]||null;
  const stop=useCallback(()=>{const audio=audioRef.current;if(!audio)return;audio.pause();audio.currentTime=0;},[]);
  const ring=useCallback(async()=>{const audio=audioRef.current;if(!audio)return;audio.volume=1;audio.loop=true;try{await audio.play();setSoundBlocked(false);}catch{setSoundBlocked(true);}},[]);
  const refresh=useCallback(async()=>{if(loadingRef.current)return;loadingRef.current=true;try{const response=await fetch(`/api/client/calls/incoming?path=${encodeURIComponent(pathname||"/dashboard")}`,{cache:"no-store",credentials:"include"});const payload=await response.json().catch(()=>({}));if(response.ok&&payload.ok)setCalls(payload.calls||[]);}finally{loadingRef.current=false;}},[pathname]);
  useEffect(()=>{const audio=new Audio("/special-notification.mp3");audio.preload="auto";audio.loop=true;audio.volume=1;audioRef.current=audio;return()=>{audio.pause();audio.src="";audioRef.current=null;};},[]);
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>void refresh(),3000);const visible=()=>{if(!document.hidden)void refresh();};window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);return()=>{window.clearInterval(timer);window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible);};},[refresh]);
  useEffect(()=>{if(!active){stop();setSoundBlocked(false);return;}stop();void ring();},[active?.id,ring,stop]);
  useEffect(()=>{if(!active||!soundBlocked)return;const retry=()=>void ring();window.addEventListener("pointerdown",retry,{once:true});window.addEventListener("keydown",retry,{once:true});return()=>{window.removeEventListener("pointerdown",retry);window.removeEventListener("keydown",retry);};},[active,soundBlocked,ring]);
  if(!active)return null;
  return <div className="fixed inset-0 z-[140] grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]"><section role="dialog" aria-modal="true" aria-live="assertive" className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-2xl"><div className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-blue-50 text-[#0A4FE8]"><span className="absolute inset-0 animate-ping rounded-full border border-blue-300/70"/>{active.audioOnly?<PhoneIncoming className="relative h-8 w-8"/>:<Video className="relative h-8 w-8"/>}</div><p className="mt-5 text-xs font-medium text-[#0A4FE8]">Incoming {active.audioOnly?"audio":"video"} call</p><h2 className="mt-1 text-xl font-semibold text-[#0D1B39]">{active.callerName}</h2><p className="mt-1 text-sm text-slate-500">{active.title}</p>{soundBlocked&&<button type="button" onClick={()=>void ring()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-xs font-semibold text-[#0A4FE8]"><Volume2 className="h-4 w-4"/>Turn on ringtone</button>}<Link href={active.link} onClick={stop} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#0A4FE8] text-sm font-semibold text-white hover:bg-[#083FC0]">Join call</Link><p className="mt-3 text-[11px] leading-4 text-slate-400">The loud ringtone continues until you join or the caller ends the call.</p></section></div>;
}
