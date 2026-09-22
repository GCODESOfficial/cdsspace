import { NextResponse } from "next/server";
import { getClientAccountState } from "@/lib/client-account";
import { glashQuery } from "@/lib/glashdb/postgres";

export const runtime = "nodejs";

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req:Request){
  const body=await req.json().catch(()=>({}));
  const name=String(body.name||"").trim().slice(0,120);
  const email=String(body.email||"").trim().toLowerCase().slice(0,254);
  const useCase=String(body.useCase||"").trim().slice(0,5000);
  if(name.length<2||!EMAIL.test(email)||useCase.length<20)return NextResponse.json({ok:false,error:"Add your name, a valid email, and a clear use case."},{status:400});
  const account=await getClientAccountState().catch(()=>null);
  const recent=await glashQuery<{count:number}>(`select count(*)::int as count from public.cmeet_api_applications where lower(email)=lower($1) and created_at > now()-interval '24 hours'`,[email]);
  if(Number(recent[0]?.count||0)>=3)return NextResponse.json({ok:false,error:"We already received your request. Please allow time for review."},{status:429});
  const [application]=await glashQuery<{id:string}>(`insert into public.cmeet_api_applications (client_user_id,applicant_name,company_name,email,website,use_case,expected_monthly_calls) values ($1::uuid,$2,$3,$4,$5,$6,$7) returning id`,[account?.user?.id||null,name,String(body.company||"").trim().slice(0,180)||null,email,String(body.website||"").trim().slice(0,500)||null,useCase,Math.max(0,Math.min(10000000,Number(body.expectedMonthlyCalls)||0))]);
  return NextResponse.json({ok:true,id:application.id},{status:201});
}
