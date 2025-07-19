

import BrandIdentityBrief from "./formpage";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";



const Page = async () => {

    const cookiesData = await cookies();
const verified = cookiesData.get("verified");

if (!verified || verified.value !== "true") {
  redirect("/access");
}
  return (
    <div className=''>
        <BrandIdentityBrief />
    </div>
  )
}

export default Page